/**
 * Timeline composition for recording masters (ffmpeg only - no DB, no R2).
 *
 * WHY PARTS:
 * A participant's camera track is not one continuous MediaRecorder stream. The
 * recorder has to restart whenever its source tracks change - LiveKit stops the
 * camera track on mute and creates a new one on unmute, a device switch or a
 * background effect swaps the track, and a refreshed tab starts over. Each
 * restart is a new "part": its own self-contained stream (its first chunk
 * carries a fresh container header), placed on the track's timeline by the
 * start time of its first chunk. Gaps between parts (camera off, a refresh)
 * become black video / silence so the master stays in sync with everyone
 * else's.
 *
 * WHY VIDEO AND AUDIO ARE BUILT SEPARATELY:
 * Video parts are encoded with IDENTICAL settings and joined with a stream
 * copy - one encode per frame in total, and every piece is a whole number of
 * frames, so the cursor is exact. Audio is NOT joined that way: every AAC
 * piece carries ~21ms of encoder priming, which piles up at each join, and a
 * recorder's audio drifts against its own video over a long part (see
 * audio-timeline.ts). So each part's audio is decoded into one raw timeline -
 * placed at its video piece's exact position, drift-corrected, clipped to the
 * piece - and encoded once when the video is muxed.
 */

import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	type AudioRun,
	AudioTimelineWriter,
	type DecodedPartAudio,
	MASTER_AUDIO_FORMAT,
	decodePartAudio,
	placeRun,
	planAudioRuns,
	rawAudioInputArgs,
	runSpanMs,
} from "./audio-timeline.ts";
import { runFfmpeg } from "./ffmpeg-run.ts";
import {
	type MediaProbe,
	type VideoSize,
	capShortSide,
	evenDim,
	probeMedia,
	sizeFilter,
} from "./video-geometry.ts";

export { runFfmpeg } from "./ffmpeg-run.ts";

/** Speed/size trade-off for masters. `medium` ran slower than real time at 4K,
 *  so a one-hour 4K track took hours; `veryfast` is several times quicker at a
 *  visually transparent CRF. */
const MASTER_X264_PRESET = "veryfast";

/** Gaps shorter than this are timer jitter between parts, not real gaps. */
const GAP_TOLERANCE_MS = 40;

/** A recorder's own audio timestamps are exact to the ms; a step past this is
 *  a real dropout inside the part. */
const PART_AUDIO_JUMP_MS = 40;
const PART_AUDIO_TOLERANCE_FRAMES = MASTER_AUDIO_FORMAT.sampleRate / 1000;

const MASTER_AUDIO_ARGS = [
	"-c:a",
	"aac",
	"-b:a",
	"192k",
	"-ar",
	"48000",
	"-ac",
	"2",
];

const AUDIO_ONLY_ARGS = [
	"-c:a",
	"libopus",
	"-b:a",
	"128k",
	"-ar",
	"48000",
	"-ac",
	"2",
];

const SILENCE_SOURCE = "anullsrc=channel_layout=stereo:sample_rate=48000";

/**
 * A picture laid over every recorder part's video in the same encode (the
 * screen recorder's camera PiP), so a composite costs one pass, not two.
 */
export interface VideoOverlay {
	/** A CFR video, placed on the track's timeline at `startMs`. */
	path: string;
	/** Where the overlay's t=0 sits, on the same clock as the parts' startMs. */
	startMs: number;
	/** The overlay's filter chain and position for the master's final size. */
	build: (target: VideoSize) => { filter: string; x: string; y: string };
}

export interface MasterEncodeSettings {
	/** Pinned output geometry (every frame is scaled/letterboxed onto it). */
	target: VideoSize;
	/** Session CFR target. */
	fps: number;
	crf: number;
	/** Applied after the size filter (e.g. the DEMO watermark). */
	extraFilters: string[];
}

/**
 * `leadMs` (recorder parts only): where the part's first video frame sits after
 * the recorder started. The piece is re-anchored so t=0 is the recorder start
 * - the instant the part is placed at and its audio is measured from - with
 * the first frame held over the lead.
 */
function videoArgs(
	settings: MasterEncodeSettings,
	leadMs?: number,
	overlay?: VideoOverlay,
): string[] {
	const anchor =
		leadMs === undefined
			? []
			: [
					"setpts=PTS-STARTPTS",
					...(leadMs >= 1
						? [
								`tpad=start_duration=${(leadMs / 1000).toFixed(3)}:start_mode=clone`,
							]
						: []),
				];
	const base = [...anchor, sizeFilter(settings.target)].join(",");
	const extra = settings.extraFilters.join(",");
	let filterArgs: string[];
	if (overlay) {
		// The overlay (input 1, already seeked to this piece) goes on after the
		// base is pinned to its final size; extra filters (the DEMO badge) land
		// on top of both. eof_action=pass keeps the base going if the overlay
		// ends first.
		const { filter, x, y } = overlay.build(settings.target);
		filterArgs = [
			"-filter_complex",
			`[0:v:0]${base}[base];[1:v:0]setpts=PTS-STARTPTS,${filter}[ov];[base][ov]overlay=${x}:${y}:format=auto:eof_action=pass,format=yuv420p${extra ? `,${extra}` : ""}[v]`,
			"-map",
			"[v]",
		];
	} else {
		filterArgs = ["-vf", [base, ...settings.extraFilters].join(",")];
	}
	return [
		...filterArgs,
		"-r",
		String(settings.fps),
		"-fps_mode",
		"cfr",
		"-c:v",
		"libx264",
		"-preset",
		MASTER_X264_PRESET,
		"-crf",
		String(settings.crf),
		"-profile:v",
		"high",
		"-pix_fmt",
		"yuv420p",
		"-video_track_timescale",
		"90000",
	];
}

function durationArg(ms: number): string {
	return (Math.max(1, ms) / 1000).toFixed(3);
}

/** Encode one recorder part's video to the normalized master format. */
async function encodeVideoPiece(params: {
	input: string;
	settings: MasterEncodeSettings;
	output: string;
	/** First video frame's offset from the recorder start (see videoArgs). */
	leadMs: number;
	/** Trims the tail that overlaps the next part (a new recorder starts
	 *  before the old one stops so nothing is lost at the seam). */
	maxDurationMs?: number;
	timeoutMs?: number;
	/** Laid over this piece from `offsetMs` into the overlay's own timeline. */
	overlay?: { overlay: VideoOverlay; offsetMs: number };
}): Promise<void> {
	const overlayInput = params.overlay
		? [
				"-ss",
				(Math.max(0, params.overlay.offsetMs) / 1000).toFixed(3),
				"-i",
				params.overlay.overlay.path,
			]
		: [];
	await runFfmpeg(
		[
			"-y",
			"-fflags",
			"+genpts",
			"-i",
			params.input,
			...overlayInput,
			...(params.overlay ? [] : ["-map", "0:v:0"]),
			"-an",
			...videoArgs(
				params.settings,
				Math.max(0, params.leadMs),
				params.overlay?.overlay,
			),
			...(params.maxDurationMs !== undefined
				? ["-t", durationArg(params.maxDurationMs)]
				: []),
			"-movflags",
			"+faststart",
			params.output,
		],
		params.timeoutMs,
	);
}

/** Black video, encoded exactly like a master piece. */
async function encodeBlackPiece(params: {
	durationMs: number;
	settings: MasterEncodeSettings;
	output: string;
}): Promise<void> {
	const { width, height } = params.settings.target;
	await runFfmpeg([
		"-y",
		"-f",
		"lavfi",
		"-i",
		`color=c=black:s=${width}x${height}:r=${params.settings.fps}`,
		...videoArgs(params.settings),
		"-t",
		durationArg(params.durationMs),
		"-movflags",
		"+faststart",
		params.output,
	]);
}

/** Exact frame count of a piece (its CFR duration is frames / fps). */
async function countVideoFrames(file: string): Promise<number> {
	const crcPath = `${file}.crc`;
	try {
		await runFfmpeg([
			"-y",
			"-i",
			file,
			"-map",
			"0:v:0",
			"-c",
			"copy",
			"-f",
			"framecrc",
			crcPath,
		]);
		const text = await readFile(crcPath, "utf8");
		return text.split("\n").filter((line) => line && !line.startsWith("#"))
			.length;
	} finally {
		await rm(crcPath, { force: true }).catch(() => undefined);
	}
}

/** Join identically-encoded files without re-encoding. */
export async function concatCopy(
	files: string[],
	output: string,
	listPath: string,
): Promise<void> {
	const list = files
		.map((file) => `file '${file.replace(/'/g, "'\\''")}'`)
		.join("\n");
	await writeFile(listPath, `${list}\n`);
	await runFfmpeg([
		"-y",
		"-f",
		"concat",
		"-safe",
		"0",
		"-i",
		listPath,
		"-c",
		"copy",
		...(output.endsWith(".mp4") ? ["-movflags", "+faststart"] : []),
		output,
	]);
}

/** Video timeline + raw audio timeline → MP4, the audio encoded once. */
async function muxMaster(params: {
	videoPath: string;
	/** Raw MASTER_AUDIO_FORMAT timeline; null = a silent track. */
	audioPath: string | null;
	/** Silence before the audio timeline (the aligned variant's lead-in). */
	audioLeadFrames: number;
	totalDurationMs: number;
	output: string;
}): Promise<void> {
	const audioInput = params.audioPath
		? [...rawAudioInputArgs(MASTER_AUDIO_FORMAT), "-i", params.audioPath]
		: [
				"-f",
				"lavfi",
				"-t",
				durationArg(params.totalDurationMs),
				"-i",
				SILENCE_SOURCE,
			];
	const delay =
		params.audioPath && params.audioLeadFrames > 0
			? ["-af", `adelay=delays=${params.audioLeadFrames}S:all=1`]
			: [];
	await runFfmpeg([
		"-y",
		"-i",
		params.videoPath,
		...audioInput,
		"-map",
		"0:v:0",
		"-map",
		"1:a:0",
		"-c:v",
		"copy",
		...delay,
		...MASTER_AUDIO_ARGS,
		"-movflags",
		"+faststart",
		params.output,
	]);
}

export interface TimelinePart {
	/** Byte-concatenated chunks of one recorder part (starts with a header). */
	rawPath: string;
	/** Start of the part's first chunk on the track's timeline. */
	startMs: number;
}

export interface ComposedMaster {
	path: string;
	ext: "mp4" | "webm";
	hasVideo: boolean;
	hasAudio: boolean;
	/** Pinned geometry (video masters only). */
	target: VideoSize | null;
	durationMs: number;
	/** Parts that couldn't be decoded (e.g. their header chunk never arrived);
	 *  their span is filled with black/silence instead. */
	skippedParts: number;
	/** Video masters: what the master was muxed from, so the aligned variant
	 *  reuses it (see composeAlignedMaster). */
	timeline: {
		settings: MasterEncodeSettings;
		videoPath: string;
		audioPath: string | null;
		frames: number;
	} | null;
}

/** Decode a part's audio and plan its runs against the piece's t=0. */
async function decodeAudioOf(params: {
	part: TimelinePart;
	hasVideo: boolean;
	tmpDir: string;
	id: string;
	timeoutMs?: number;
}): Promise<{ audio: DecodedPartAudio; runs: AudioRun[] } | null> {
	try {
		const audio = await decodePartAudio({
			input: params.part.rawPath,
			rawPath: path.join(params.tmpDir, `${params.id}.pcm`),
			tmpDir: params.tmpDir,
			id: params.id,
			hasVideo: params.hasVideo,
			timeoutMs: params.timeoutMs,
		});
		if (audio.chunks.length === 0 || audio.frames === 0) {
			await rm(audio.rawPath, { force: true }).catch(() => undefined);
			return null;
		}
		// ffmpeg reports timestamps from the file's start - the recorder start,
		// which is the piece's t=0.
		const runs = planAudioRuns(audio.chunks, MASTER_AUDIO_FORMAT.sampleRate, {
			jumpMs: PART_AUDIO_JUMP_MS,
		});
		return { audio, runs };
	} catch (error) {
		console.error(`[Compose] ${params.id}: audio could not be decoded:`, error);
		return null;
	}
}

/**
 * Lay a track's parts out on one timeline: each at its own start, overlaps
 * trimmed, gaps filled. t=0 of the result is the first part's start.
 */
export async function composeTimeline(params: {
	parts: TimelinePart[];
	tmpDir: string;
	/** Prefix for intermediate files, unique per track. */
	id: string;
	fps: number;
	crf: number;
	extraFilters: string[];
	/** Client-reported max frame size, if any (a grown screen surface). */
	sizeHint: VideoSize | null;
	/** Scale down so the shorter side is at most this (e.g. 720 for 720p). */
	maxShortSide?: number;
	timeoutMs?: number;
	/** Composited into every part in the same encode (see VideoOverlay). */
	overlay?: VideoOverlay;
}): Promise<ComposedMaster> {
	if (params.parts.length === 0) throw new Error("No parts to compose");

	const probes = await Promise.all(
		params.parts.map((part) => probeMedia(part.rawPath)),
	);
	const anyVideo = probes.some((probe) => probe.hasVideo);
	const anyAudio = probes.some((probe) => probe.hasAudio);
	if (!anyVideo && !anyAudio) {
		throw new Error("No decodable audio or video in any part");
	}

	// Positions relative to the first part; never let a clock hiccup move a
	// later part before an earlier one.
	const origin = params.parts[0]?.startMs ?? 0;
	const positions: number[] = [];
	for (const [index, part] of params.parts.entries()) {
		const raw = Math.max(0, part.startMs - origin);
		positions.push(Math.max(raw, positions[index - 1] ?? 0));
	}

	if (!anyVideo) {
		return composeAudioOnly({ ...params, probes, positions });
	}

	const sizes = probes
		.map((probe) => probe.size)
		.filter((size): size is VideoSize => size !== null);
	if (params.sizeHint) sizes.push(params.sizeHint);
	const best = sizes.reduce<VideoSize | null>(
		(acc, size) =>
			!acc || size.width * size.height > acc.width * acc.height ? size : acc,
		null,
	) ?? { width: 1920, height: 1080 };
	const target = capShortSide(best, params.maxShortSide);

	return composeVideoTimeline({
		...params,
		probes,
		positions,
		anyAudio,
		settings: {
			target,
			fps: params.fps,
			crf: params.crf,
			extraFilters: params.extraFilters,
		},
	});
}

async function composeVideoTimeline(params: {
	parts: TimelinePart[];
	probes: MediaProbe[];
	positions: number[];
	settings: MasterEncodeSettings;
	anyAudio: boolean;
	tmpDir: string;
	id: string;
	timeoutMs?: number;
	overlay?: VideoOverlay;
}): Promise<ComposedMaster> {
	const { tmpDir, id, settings } = params;
	const originMs = params.parts[0]?.startMs ?? 0;
	const { sampleRate } = MASTER_AUDIO_FORMAT;
	const msAt = (frames: number) => (frames * 1000) / settings.fps;
	const audioFrameAt = (videoFrames: number) =>
		Math.round((videoFrames * sampleRate) / settings.fps);

	const pieces: string[] = [];
	let cursorFrames = 0;
	let encodedParts = 0;
	let skippedParts = 0;
	let fillerIndex = 0;

	const audioPath = path.join(tmpDir, `${id}-audio.raw`);
	const writer = params.anyAudio
		? await AudioTimelineWriter.open(audioPath, MASTER_AUDIO_FORMAT)
		: null;

	try {
		const fill = async (durationMs: number) => {
			const output = path.join(tmpDir, `${id}-fill-${fillerIndex++}.mp4`);
			await encodeBlackPiece({ durationMs, settings, output });
			const frames = await countVideoFrames(output);
			if (frames <= 0) return;
			pieces.push(output);
			cursorFrames += frames;
		};

		for (const [index, part] of params.parts.entries()) {
			const probe = params.probes[index];
			const position = params.positions[index] ?? 0;
			const next = params.positions[index + 1];
			const maxDurationMs = next !== undefined ? next - position : undefined;
			if (!probe || (!probe.hasVideo && !probe.hasAudio)) {
				skippedParts++;
				continue;
			}
			if (maxDurationMs !== undefined && maxDurationMs < GAP_TOLERANCE_MS) {
				// The next part started (almost) at the same instant - nothing of
				// this one survives the overlap.
				continue;
			}

			const pieceId = `${id}-part-${index}`;
			const decoded =
				probe.hasAudio && writer
					? await decodeAudioOf({
							part,
							hasVideo: probe.hasVideo,
							tmpDir,
							id: pieceId,
							timeoutMs: params.timeoutMs,
						})
					: null;

			try {
				const output = path.join(tmpDir, `${pieceId}.mp4`);
				let frames = 0;
				// Where the part's audio ends (from the recorder start), capped at
				// the next part.
				const audioEndMs = (decoded?.runs ?? []).reduce(
					(end, run) => Math.max(end, run.startMs + runSpanMs(run, sampleRate)),
					0,
				);
				const audioLimitMs = Math.min(audioEndMs, maxDurationMs ?? audioEndMs);
				try {
					if (probe.hasVideo) {
						await encodeVideoPiece({
							input: part.rawPath,
							settings,
							output,
							leadMs: decoded?.audio.videoStartMs ?? 0,
							maxDurationMs,
							timeoutMs: params.timeoutMs,
							// The piece's t=0 is its part's start on the timeline.
							...(params.overlay
								? {
										overlay: {
											overlay: params.overlay,
											offsetMs: originMs + position - params.overlay.startMs,
										},
									}
								: {}),
						});
					} else {
						// Camera off for this part: black for as long as its audio runs.
						if (audioLimitMs < GAP_TOLERANCE_MS) {
							throw new Error("audio-only part has no usable audio");
						}
						await encodeBlackPiece({
							durationMs: audioLimitMs,
							settings,
							output,
						});
					}
					frames = await countVideoFrames(output);
				} catch (error) {
					console.error(
						`[Compose] ${id}: part ${index} could not be encoded, filling its span:`,
						error,
					);
				}
				if (frames <= 0) {
					skippedParts++;
					continue;
				}

				if (position - msAt(cursorFrames) >= GAP_TOLERANCE_MS) {
					await fill(position - msAt(cursorFrames));
				}

				const pieceStart = cursorFrames;
				pieces.push(output);
				cursorFrames += frames;
				encodedParts++;

				// The video stopped before the audio did (the camera died mid-part):
				// black under the rest of the audio instead of cutting it off.
				if (audioLimitMs - msAt(frames) >= GAP_TOLERANCE_MS) {
					await fill(audioLimitMs - msAt(frames));
				}

				if (writer && decoded) {
					const startFrame = audioFrameAt(pieceStart);
					const endFrame = audioFrameAt(cursorFrames);
					await writer.padTo(startFrame);
					for (const run of decoded.runs) {
						await placeRun({
							writer,
							sourcePath: decoded.audio.rawPath,
							run,
							atFrame:
								startFrame + Math.round((run.startMs * sampleRate) / 1000),
							endFrame,
							toleranceFrames: PART_AUDIO_TOLERANCE_FRAMES,
							tmpDir,
						});
					}
				}
			} finally {
				if (decoded) {
					await rm(decoded.audio.rawPath, { force: true }).catch(
						() => undefined,
					);
				}
			}
		}

		if (encodedParts === 0) {
			throw new Error("No part of the track could be encoded");
		}
		await writer?.padTo(audioFrameAt(cursorFrames));
	} finally {
		await writer?.close();
	}

	let videoPath: string;
	if (pieces.length === 1 && pieces[0]) {
		videoPath = pieces[0];
	} else {
		videoPath = path.join(tmpDir, `${id}-video.mp4`);
		await concatCopy(pieces, videoPath, path.join(tmpDir, `${id}-list.txt`));
	}

	const masterPath = path.join(tmpDir, `${id}-master.mp4`);
	await muxMaster({
		videoPath,
		audioPath: writer ? audioPath : null,
		audioLeadFrames: 0,
		totalDurationMs: msAt(cursorFrames),
		output: masterPath,
	});

	return {
		path: masterPath,
		ext: "mp4",
		hasVideo: true,
		hasAudio: params.anyAudio,
		target: settings.target,
		durationMs: Math.round(msAt(cursorFrames)),
		skippedParts,
		timeline: {
			settings,
			videoPath,
			audioPath: writer ? audioPath : null,
			frames: cursorFrames,
		},
	};
}

async function composeAudioOnly(params: {
	parts: TimelinePart[];
	probes: MediaProbe[];
	positions: number[];
	tmpDir: string;
	id: string;
	timeoutMs?: number;
}): Promise<ComposedMaster> {
	const { tmpDir, id } = params;
	const { sampleRate } = MASTER_AUDIO_FORMAT;
	const audioPath = path.join(tmpDir, `${id}-audio.raw`);
	const output = path.join(tmpDir, `${id}-master.webm`);
	const writer = await AudioTimelineWriter.open(audioPath, MASTER_AUDIO_FORMAT);
	let placedParts = 0;
	let skippedParts = 0;

	try {
		for (const [index, part] of params.parts.entries()) {
			const position = params.positions[index] ?? 0;
			const next = params.positions[index + 1];
			if (!params.probes[index]?.hasAudio) {
				skippedParts++;
				continue;
			}
			if (next !== undefined && next - position < GAP_TOLERANCE_MS) continue;

			const decoded = await decodeAudioOf({
				part,
				hasVideo: false,
				tmpDir,
				id: `${id}-part-${index}`,
				timeoutMs: params.timeoutMs,
			});
			if (!decoded) {
				skippedParts++;
				continue;
			}

			try {
				// One clean part: a stream copy keeps the original audio untouched.
				if (
					params.parts.length === 1 &&
					decoded.runs.length === 1 &&
					decoded.runs[0]?.ratio === 1
				) {
					const remuxed = await remuxAudio(part, output, id);
					if (remuxed) return remuxed;
				}

				const startFrame = Math.round((position * sampleRate) / 1000);
				const endFrame =
					next !== undefined
						? Math.round((next * sampleRate) / 1000)
						: undefined;
				await writer.padTo(startFrame);
				for (const run of decoded.runs) {
					await placeRun({
						writer,
						sourcePath: decoded.audio.rawPath,
						run,
						atFrame: startFrame + Math.round((run.startMs * sampleRate) / 1000),
						endFrame,
						toleranceFrames: PART_AUDIO_TOLERANCE_FRAMES,
						tmpDir,
					});
				}
				placedParts++;
			} finally {
				await rm(decoded.audio.rawPath, { force: true }).catch(() => undefined);
			}
		}
	} finally {
		await writer.close();
	}

	if (placedParts === 0) {
		throw new Error("No part of the track could be encoded");
	}
	await runFfmpeg([
		"-y",
		...rawAudioInputArgs(MASTER_AUDIO_FORMAT),
		"-i",
		audioPath,
		...AUDIO_ONLY_ARGS,
		output,
	]);
	await rm(audioPath, { force: true }).catch(() => undefined);

	return {
		path: output,
		ext: "webm",
		hasVideo: false,
		hasAudio: true,
		target: null,
		durationMs: Math.round((writer.frames * 1000) / sampleRate),
		skippedParts,
		timeline: null,
	};
}

async function remuxAudio(
	part: TimelinePart,
	output: string,
	id: string,
): Promise<ComposedMaster | null> {
	try {
		await runFfmpeg([
			"-y",
			"-fflags",
			"+genpts",
			"-i",
			part.rawPath,
			"-map",
			"0:a:0",
			"-c",
			"copy",
			output,
		]);
		const copied = await probeMedia(output);
		if (!copied.hasAudio) return null;
		return {
			path: output,
			ext: "webm",
			hasVideo: false,
			hasAudio: true,
			target: null,
			durationMs: copied.durationMs ?? 0,
			skippedParts: 0,
			timeline: null,
		};
	} catch (error) {
		console.error(`[Compose] ${id}: audio remux failed, re-encoding:`, error);
		return null;
	}
}

/**
 * The master with `leadMs` of black/silence in front (a late joiner's "with
 * space" variant). Reuses the master's video pieces and raw audio: the video
 * is a stream copy, the audio is shifted sample-exactly and encoded once.
 */
export async function composeAlignedMaster(params: {
	master: ComposedMaster;
	leadMs: number;
	tmpDir: string;
	id: string;
	output: string;
}): Promise<void> {
	const timeline = params.master.timeline;
	if (!timeline) throw new Error("Master has no video timeline to align");
	const { settings } = timeline;

	const leadPath = path.join(params.tmpDir, `${params.id}-lead.mp4`);
	await encodeBlackPiece({
		durationMs: params.leadMs,
		settings,
		output: leadPath,
	});
	const leadFrames = await countVideoFrames(leadPath);
	const videoPath = path.join(params.tmpDir, `${params.id}-aligned-video.mp4`);
	await concatCopy(
		[leadPath, timeline.videoPath],
		videoPath,
		path.join(params.tmpDir, `${params.id}-aligned-list.txt`),
	);
	await muxMaster({
		videoPath,
		audioPath: timeline.audioPath,
		audioLeadFrames: Math.round(
			(leadFrames * MASTER_AUDIO_FORMAT.sampleRate) / settings.fps,
		),
		totalDurationMs: ((leadFrames + timeline.frames) * 1000) / settings.fps,
		output: params.output,
	});
}

/** True when a chunk opens a new container stream (a recorder (re)start). */
export function startsContainer(chunk: Buffer): boolean {
	if (chunk.length < 8) return false;
	// WebM / Matroska: EBML magic.
	if (
		chunk[0] === 0x1a &&
		chunk[1] === 0x45 &&
		chunk[2] === 0xdf &&
		chunk[3] === 0xa3
	) {
		return true;
	}
	// MP4 (Chrome/Safari MediaRecorder): the init segment opens with `ftyp`.
	return chunk.toString("latin1", 4, 8) === "ftyp";
}
