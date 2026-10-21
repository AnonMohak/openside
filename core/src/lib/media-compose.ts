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
 * Every part and filler is encoded with IDENTICAL settings so they can be
 * joined with a stream copy - one encode per frame in total, same as a
 * single-part master.
 */

import { spawn } from "node:child_process";
import { open, writeFile } from "node:fs/promises";
import path from "node:path";
import { ffmpegPath, withThreadLimit } from "./ffmpeg-path.ts";
import {
	type MediaProbe,
	type VideoSize,
	evenDim,
	probeMedia,
	sizeFilter,
} from "./video-geometry.ts";

/** Speed/size trade-off for masters. `medium` ran slower than real time at 4K,
 *  so a one-hour 4K track took hours; `veryfast` is several times quicker at a
 *  visually transparent CRF. */
const MASTER_X264_PRESET = "veryfast";

/** Gaps shorter than this are timer jitter between parts, not real gaps. */
const GAP_TOLERANCE_MS = 40;

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

export function runFfmpeg(args: string[], timeoutMs?: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn(ffmpegPath, withThreadLimit(args), {
			stdio: ["ignore", "ignore", "pipe"],
		});
		let stderr = "";
		const timeout = timeoutMs
			? setTimeout(() => {
					proc.kill("SIGKILL");
					reject(new Error(`ffmpeg timed out after ${timeoutMs}ms`));
				}, timeoutMs)
			: null;
		proc.stderr.on("data", (data) => {
			stderr += data.toString();
			// Keep only the tail - a multi-hour encode prints a lot of progress.
			if (stderr.length > 64_000) stderr = stderr.slice(-16_000);
		});
		proc.on("error", (error) => {
			if (timeout) clearTimeout(timeout);
			reject(error);
		});
		proc.on("close", (code) => {
			if (timeout) clearTimeout(timeout);
			if (code === 0) resolve();
			else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-2000)}`));
		});
	});
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

function videoArgs(settings: MasterEncodeSettings): string[] {
	return [
		"-vf",
		[sizeFilter(settings.target), ...settings.extraFilters].join(","),
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

/**
 * Encode one recorder part to the normalized master format: CFR H.264 at the
 * pinned size + stereo AAC. A part missing a stream gets black video or silence
 * so every piece of the timeline has the same streams. `maxDurationMs` trims the
 * tail that overlaps the next part (a new recorder starts before the old one
 * stops so no audio is lost at the seam).
 */
export async function encodeMasterPart(params: {
	input: string;
	probe: MediaProbe;
	settings: MasterEncodeSettings;
	output: string;
	maxDurationMs?: number;
	timeoutMs?: number;
}): Promise<void> {
	const { input, probe, settings, output } = params;
	const cap =
		params.maxDurationMs !== undefined
			? ["-t", durationArg(params.maxDurationMs)]
			: [];
	const tail = [...cap, "-movflags", "+faststart", output];
	const { width, height } = settings.target;

	let args: string[];
	if (probe.hasVideo && probe.hasAudio) {
		args = [
			"-y",
			"-fflags",
			"+genpts",
			"-i",
			input,
			"-map",
			"0:v:0",
			"-map",
			"0:a:0",
			...videoArgs(settings),
			...MASTER_AUDIO_ARGS,
			...tail,
		];
	} else if (probe.hasVideo) {
		args = [
			"-y",
			"-fflags",
			"+genpts",
			"-i",
			input,
			"-f",
			"lavfi",
			"-i",
			SILENCE_SOURCE,
			"-map",
			"0:v:0",
			"-map",
			"1:a:0",
			...videoArgs(settings),
			...MASTER_AUDIO_ARGS,
			"-shortest",
			...tail,
		];
	} else if (probe.hasAudio) {
		args = [
			"-y",
			"-f",
			"lavfi",
			"-i",
			`color=c=black:s=${width}x${height}:r=${settings.fps}`,
			"-fflags",
			"+genpts",
			"-i",
			input,
			"-map",
			"0:v:0",
			"-map",
			"1:a:0",
			...videoArgs(settings),
			...MASTER_AUDIO_ARGS,
			"-shortest",
			...tail,
		];
	} else {
		throw new Error("Part has neither audio nor video");
	}

	await runFfmpeg(args, params.timeoutMs);
}

/** Black video + silence, encoded exactly like a master part. */
export async function encodeMasterFiller(params: {
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
		"-f",
		"lavfi",
		"-i",
		SILENCE_SOURCE,
		"-map",
		"0:v:0",
		"-map",
		"1:a:0",
		...videoArgs(params.settings),
		...MASTER_AUDIO_ARGS,
		"-t",
		durationArg(params.durationMs),
		"-movflags",
		"+faststart",
		params.output,
	]);
}

async function encodeAudioPart(params: {
	input: string;
	output: string;
	maxDurationMs?: number;
}): Promise<void> {
	await runFfmpeg([
		"-y",
		"-fflags",
		"+genpts",
		"-i",
		params.input,
		"-map",
		"0:a:0",
		"-vn",
		...AUDIO_ONLY_ARGS,
		...(params.maxDurationMs !== undefined
			? ["-t", durationArg(params.maxDurationMs)]
			: []),
		params.output,
	]);
}

async function encodeAudioFiller(params: {
	durationMs: number;
	output: string;
}): Promise<void> {
	await runFfmpeg([
		"-y",
		"-f",
		"lavfi",
		"-i",
		SILENCE_SOURCE,
		...AUDIO_ONLY_ARGS,
		"-t",
		durationArg(params.durationMs),
		params.output,
	]);
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
	timeoutMs?: number;
}): Promise<ComposedMaster> {
	const { tmpDir, id } = params;
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

	let target: VideoSize | null = null;
	if (anyVideo) {
		const sizes = probes
			.map((probe) => probe.size)
			.filter((size): size is VideoSize => size !== null);
		if (params.sizeHint) sizes.push(params.sizeHint);
		const best = sizes.reduce<VideoSize | null>(
			(acc, size) =>
				!acc || size.width * size.height > acc.width * acc.height ? size : acc,
			null,
		) ?? { width: 1920, height: 1080 };
		target = { width: evenDim(best.width), height: evenDim(best.height) };
	}

	const ext: "mp4" | "webm" = anyVideo ? "mp4" : "webm";

	// One audio-only part: a stream copy keeps the original audio untouched.
	const onlyPart = params.parts[0];
	if (!anyVideo && params.parts.length === 1 && onlyPart) {
		const output = path.join(tmpDir, `${id}-master.webm`);
		try {
			await runFfmpeg([
				"-y",
				"-fflags",
				"+genpts",
				"-i",
				onlyPart.rawPath,
				"-map",
				"0:a:0",
				"-c",
				"copy",
				output,
			]);
			const copied = await probeMedia(output);
			if (copied.hasAudio) {
				return {
					path: output,
					ext,
					hasVideo: false,
					hasAudio: true,
					target: null,
					durationMs: copied.durationMs ?? 0,
					skippedParts: 0,
				};
			}
		} catch (error) {
			console.error(`[Compose] ${id}: audio remux failed, re-encoding:`, error);
		}
	}
	const settings: MasterEncodeSettings | null = target
		? {
				target,
				fps: params.fps,
				crf: params.crf,
				extraFilters: params.extraFilters,
			}
		: null;

	const pieces: string[] = [];
	let cursorMs = 0;
	let skippedParts = 0;
	let fillerIndex = 0;

	const fill = async (durationMs: number) => {
		const output = path.join(tmpDir, `${id}-fill-${fillerIndex++}.${ext}`);
		if (settings) {
			await encodeMasterFiller({ durationMs, settings, output });
		} else {
			await encodeAudioFiller({ durationMs, output });
		}
		pieces.push(output);
	};

	for (const [index, part] of params.parts.entries()) {
		const probe = probes[index];
		const position = positions[index] ?? 0;
		const next = positions[index + 1];
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

		const output = path.join(tmpDir, `${id}-part-${index}.${ext}`);
		try {
			if (settings) {
				await encodeMasterPart({
					input: part.rawPath,
					probe,
					settings,
					output,
					maxDurationMs,
					timeoutMs: params.timeoutMs,
				});
			} else {
				await encodeAudioPart({ input: part.rawPath, output, maxDurationMs });
			}
		} catch (error) {
			console.error(
				`[Compose] ${id}: part ${index} could not be encoded, filling its span:`,
				error,
			);
			skippedParts++;
			continue;
		}

		const encoded = await probeMedia(output);
		const durationMs = encoded.durationMs ?? 0;
		if (durationMs <= 0) {
			skippedParts++;
			continue;
		}

		if (position - cursorMs >= GAP_TOLERANCE_MS) {
			await fill(position - cursorMs);
			cursorMs = position;
		}
		pieces.push(output);
		cursorMs += durationMs;
	}

	if (!pieces.some((piece) => piece.includes(`${id}-part-`))) {
		throw new Error("No part of the track could be encoded");
	}

	let outputPath: string;
	if (pieces.length === 1 && pieces[0]) {
		outputPath = pieces[0];
	} else {
		outputPath = path.join(tmpDir, `${id}-master.${ext}`);
		await concatCopy(pieces, outputPath, path.join(tmpDir, `${id}-list.txt`));
	}

	const final = await probeMedia(outputPath);
	return {
		path: outputPath,
		ext,
		hasVideo: anyVideo,
		hasAudio: anyAudio,
		target,
		durationMs: final.durationMs ?? Math.round(cursorMs),
		skippedParts,
	};
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

export interface PcmFormat {
	sampleRate: number;
	channelCount: number;
	bitDepth: number;
}

export interface PcmTimelineSegment {
	startMs: number;
	format: PcmFormat;
	load: () => Promise<Buffer>;
}

const ZERO_BLOCK = Buffer.alloc(1 << 20);

/**
 * Write raw PCM chunks to `outPath`, each at its own timeline position: a
 * missing chunk or a tab refresh becomes silence instead of pulling everything
 * after it earlier (which is what plain concatenation did - the WAV drifted out
 * of sync with the video after every gap). `leadPadMs` aligns the start with
 * the video master. Chunks within `toleranceMs` of contiguous are appended as-is
 * (that's timestamp rounding, not a gap).
 */
export async function composePcmTimeline(params: {
	segments: PcmTimelineSegment[];
	outPath: string;
	leadPadMs: number;
	convert: (buffer: Buffer, from: PcmFormat, to: PcmFormat) => Promise<Buffer>;
	toleranceMs?: number;
}): Promise<PcmFormat & { bytes: number }> {
	const first = params.segments[0];
	if (!first) throw new Error("No PCM segments");
	const format = first.format;
	const frameBytes = (format.bitDepth / 8) * format.channelCount;
	const toleranceFrames = Math.round(
		((params.toleranceMs ?? 20) * format.sampleRate) / 1000,
	);

	const file = await open(params.outPath, "w");
	let cursorFrames = 0;
	try {
		const writeZeros = async (frames: number) => {
			let remaining = frames * frameBytes;
			while (remaining > 0) {
				const size = Math.min(remaining, ZERO_BLOCK.length);
				await file.write(ZERO_BLOCK, 0, size);
				remaining -= size;
			}
			cursorFrames += frames;
		};

		for (const segment of params.segments) {
			let buffer = await segment.load();
			const sameFormat =
				segment.format.sampleRate === format.sampleRate &&
				segment.format.channelCount === format.channelCount &&
				segment.format.bitDepth === format.bitDepth;
			if (!sameFormat) {
				buffer = await params.convert(buffer, segment.format, format);
			}
			const frames = Math.floor(buffer.length / frameBytes);
			if (frames === 0) continue;

			const targetFrames = Math.max(
				0,
				Math.round(
					((params.leadPadMs + segment.startMs - first.startMs) *
						format.sampleRate) /
						1000,
				),
			);

			let skipFrames = 0;
			if (targetFrames > cursorFrames + toleranceFrames) {
				await writeZeros(targetFrames - cursorFrames);
			} else if (targetFrames < cursorFrames - toleranceFrames) {
				skipFrames = Math.min(frames, cursorFrames - targetFrames);
			}
			if (skipFrames >= frames) continue;

			const start = skipFrames * frameBytes;
			const end = frames * frameBytes;
			await file.write(buffer, start, end - start);
			cursorFrames += frames - skipFrames;
		}
	} finally {
		await file.close();
	}

	return { ...format, bytes: cursorFrames * frameBytes };
}
