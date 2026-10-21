/**
 * Audio timelines for recording masters (ffmpeg only - no DB, no R2).
 *
 * WHY:
 * Audio is captured on the audio hardware's clock; video and every chunk
 * timestamp run on the system clock. The two tick at slightly different rates
 * (tens to hundreds of ppm - up to about half a second an hour), and an audio
 * pipeline that stalls (a suspended audio context, a dropped buffer) simply
 * stops counting samples. Laying samples end to end therefore drifts out of
 * sync with the video, more the longer the recording runs.
 *
 * Instead every audio stream is cut into "runs" of continuous capture. Each
 * run's sample count is fitted against its timestamps, then the run is placed
 * where it started and resampled - by a fraction of a percent, inaudible - to
 * exactly the wall-clock span it covered. Breaks become silence. A run whose
 * clock matches (the common short-recording case) is copied bit for bit.
 */

import { createReadStream } from "node:fs";
import { type FileHandle, open, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { runFfmpeg } from "./ffmpeg-run.ts";

export interface RawAudioFormat {
	sampleRate: number;
	channelCount: number;
	bitDepth: number;
}

/** The working format for lossy masters: decoded once, encoded once. */
export const MASTER_AUDIO_FORMAT: RawAudioFormat = {
	sampleRate: 48000,
	channelCount: 2,
	bitDepth: 16,
};

export function rawAudioCodec(format: RawAudioFormat): string {
	if (format.bitDepth === 24) return "s24le";
	if (format.bitDepth === 32) return "s32le";
	return "s16le";
}

export function bytesPerFrame(format: RawAudioFormat): number {
	return (format.bitDepth / 8) * format.channelCount;
}

/** ffmpeg input args for a headerless file in `format`. */
export function rawAudioInputArgs(format: RawAudioFormat): string[] {
	return [
		"-f",
		rawAudioCodec(format),
		"-ar",
		String(format.sampleRate),
		"-ac",
		String(format.channelCount),
	];
}

// ── Planning ────────────────────────────────────────────────────────────

export interface ClockChunk {
	/** Timeline position of the chunk's first sample (ms). */
	startMs: number;
	frames: number;
	/** Capture is known to be broken right before this chunk (lost audio). */
	breakBefore?: boolean;
}

export interface AudioRun {
	/** First frame of the run in the source (every chunk laid end to end). */
	sourceFrame: number;
	frames: number;
	/** Timeline position of the run's first sample (ms). */
	startMs: number;
	/** Timeline ms per sample-clock ms; 1 = copied as is. */
	ratio: number;
}

/** Recent offsets a new chunk is compared against. */
const BASELINE_WINDOW = 5;
/** Shorter runs can't drift enough to matter, and their slope is noise. */
const MIN_FIT_SPAN_MS = 60_000;
const MIN_FIT_POINTS = 4;
/** Real clocks are within ~0.1%; a steeper slope means bad timestamps. */
const MAX_CLOCK_SKEW = 0.005;
/** Drift below this over a whole run is left alone (bit-exact copy). */
const MIN_CORRECTION_MS = 8;
const OUTLIER_FLOOR_MS = 15;

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	if (sorted.length % 2) return sorted[mid] ?? 0;
	return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

interface FitPoint {
	/** Sample-clock position within the run (ms). */
	x: number;
	/** Timestamp (ms). */
	y: number;
}

function fitLine(points: FitPoint[]): { a: number; b: number } | null {
	if (points.length < 2) return null;
	let mx = 0;
	let my = 0;
	for (const p of points) {
		mx += p.x;
		my += p.y;
	}
	mx /= points.length;
	my /= points.length;
	let sxx = 0;
	let sxy = 0;
	for (const p of points) {
		const dx = p.x - mx;
		sxx += dx * dx;
		sxy += dx * (p.y - my);
	}
	if (sxx <= 0) return null;
	const b = sxy / sxx;
	return { a: my - b * mx, b };
}

interface RunBuilder {
	sourceFrame: number;
	frames: number;
	points: FitPoint[];
	recentOffsets: number[];
}

function fitRun(run: RunBuilder, sampleRate: number): AudioRun {
	const spanMs = (run.frames * 1000) / sampleRate;
	const base = { sourceFrame: run.sourceFrame, frames: run.frames };
	const flat = {
		...base,
		startMs: median(run.points.map((p) => p.y - p.x)),
		ratio: 1,
	};
	if (run.points.length < MIN_FIT_POINTS || spanMs < MIN_FIT_SPAN_MS) {
		return flat;
	}

	// Least squares, then drop stray timestamps (a late-delivered chunk) and
	// refit - jitter is one-sided, so a plain fit would be pulled late.
	let points = run.points;
	let line = fitLine(points);
	for (let pass = 0; pass < 3 && line; pass++) {
		const { a, b } = line;
		const residuals = points.map((p) => p.y - (a + b * p.x));
		const spread = median(residuals.map(Math.abs)) * 1.4826;
		const limit = Math.max(OUTLIER_FLOOR_MS, 4 * spread);
		const kept = points.filter(
			(_, index) => Math.abs(residuals[index] ?? 0) <= limit,
		);
		if (kept.length === points.length || kept.length < MIN_FIT_POINTS) break;
		points = kept;
		line = fitLine(points);
	}

	if (!line || Math.abs(line.b - 1) > MAX_CLOCK_SKEW) return flat;
	if (Math.abs(line.b - 1) * spanMs < MIN_CORRECTION_MS) {
		return {
			...base,
			startMs: median(points.map((p) => p.y - p.x)),
			ratio: 1,
		};
	}
	return { ...base, startMs: line.a, ratio: line.b };
}

/**
 * Split chunks into runs of continuous capture and fit each run's clock.
 * A chunk whose timestamp jumps more than `jumpMs` from where the run says it
 * should start is a break - unless the chunk after it agrees with the run
 * again, in which case only that one timestamp was off (it's kept in the run,
 * just not used for the fit).
 */
export function planAudioRuns(
	chunks: ClockChunk[],
	sampleRate: number,
	options: { jumpMs: number },
): AudioRun[] {
	const runs: AudioRun[] = [];
	const msOf = (frames: number) => (frames * 1000) / sampleRate;
	let sourceFrame = 0;
	let run: RunBuilder | null = null;

	for (const [index, chunk] of chunks.entries()) {
		if (chunk.frames <= 0) continue;
		if (run && chunk.breakBefore) {
			runs.push(fitRun(run, sampleRate));
			run = null;
		}
		if (run) {
			const x = msOf(run.frames);
			const baseline = median(run.recentOffsets);
			if (Math.abs(chunk.startMs - x - baseline) > options.jumpMs) {
				const next = chunks[index + 1];
				const strayStamp =
					next !== undefined &&
					next.frames > 0 &&
					!next.breakBefore &&
					Math.abs(next.startMs - (x + msOf(chunk.frames)) - baseline) <=
						options.jumpMs;
				if (strayStamp) {
					run.frames += chunk.frames;
					sourceFrame += chunk.frames;
					continue;
				}
				runs.push(fitRun(run, sampleRate));
				run = null;
			}
		}
		if (!run) {
			run = { sourceFrame, frames: 0, points: [], recentOffsets: [] };
		}
		const x = msOf(run.frames);
		run.points.push({ x, y: chunk.startMs });
		run.recentOffsets.push(chunk.startMs - x);
		if (run.recentOffsets.length > BASELINE_WINDOW) run.recentOffsets.shift();
		run.frames += chunk.frames;
		sourceFrame += chunk.frames;
	}
	if (run) runs.push(fitRun(run, sampleRate));
	return runs;
}

/** Timeline length of a run once placed (ms). */
export function runSpanMs(run: AudioRun, sampleRate: number): number {
	return ((run.frames * 1000) / sampleRate) * run.ratio;
}

// ── Writing ─────────────────────────────────────────────────────────────

const ZERO_BLOCK = Buffer.alloc(1 << 20);
const COPY_BLOCK_BYTES = 1 << 20;

/** Append-only raw audio file with a frame cursor. */
export class AudioTimelineWriter {
	frames = 0;
	private readonly frameBytes: number;

	private constructor(
		private readonly file: FileHandle,
		readonly format: RawAudioFormat,
	) {
		this.frameBytes = bytesPerFrame(format);
	}

	static async open(
		filePath: string,
		format: RawAudioFormat,
	): Promise<AudioTimelineWriter> {
		return new AudioTimelineWriter(await open(filePath, "w"), format);
	}

	/** Silence up to `frame` (no-op if the cursor is already there). */
	async padTo(frame: number): Promise<void> {
		const frames = Math.round(frame) - this.frames;
		if (frames <= 0) return;
		await this.writeZeroBytes(frames * this.frameBytes);
		this.frames += frames;
	}

	/** Append `count` frames of a raw file from `fromFrame` (silence past its end). */
	async copyFrom(
		sourcePath: string,
		fromFrame: number,
		count: number,
	): Promise<void> {
		if (count <= 0) return;
		const source = await open(sourcePath, "r");
		let remaining = count * this.frameBytes;
		try {
			const buffer = Buffer.alloc(
				COPY_BLOCK_BYTES - (COPY_BLOCK_BYTES % this.frameBytes),
			);
			let position = fromFrame * this.frameBytes;
			while (remaining > 0) {
				const { bytesRead } = await source.read(
					buffer,
					0,
					Math.min(buffer.length, remaining),
					position,
				);
				if (bytesRead <= 0) break;
				await this.file.write(buffer, 0, bytesRead);
				position += bytesRead;
				remaining -= bytesRead;
			}
		} finally {
			await source.close();
		}
		await this.writeZeroBytes(remaining);
		this.frames += count;
	}

	async close(): Promise<void> {
		await this.file.close();
	}

	private async writeZeroBytes(bytes: number): Promise<void> {
		let remaining = bytes;
		while (remaining > 0) {
			const size = Math.min(remaining, ZERO_BLOCK.length);
			await this.file.write(ZERO_BLOCK, 0, size);
			remaining -= size;
		}
	}
}

/**
 * Resample frames [fromFrame, fromFrame + frames) of a raw file to `outFrames`
 * frames. ffmpeg only takes integer rates, so the stream is relabelled to a
 * ~1 MHz rate first: the ratio is then exact to ~1 ppm (and the caller pads or
 * trims the last sample or two).
 */
async function resampleRange(params: {
	sourcePath: string;
	fromFrame: number;
	frames: number;
	outFrames: number;
	format: RawAudioFormat;
	outPath: string;
}): Promise<void> {
	const { format } = params;
	const frameBytes = bytesPerFrame(format);
	// swresample needs rate * 1024 phases to fit an int32.
	const label =
		format.sampleRate * Math.max(1, Math.floor(1_000_000 / format.sampleRate));
	const target = Math.round((label * params.outFrames) / params.frames);
	const input = createReadStream(params.sourcePath, {
		start: params.fromFrame * frameBytes,
		end: (params.fromFrame + params.frames) * frameBytes - 1,
	});
	await runFfmpeg(
		[
			"-y",
			...rawAudioInputArgs(format),
			"-i",
			"pipe:0",
			"-af",
			`asetrate=${label},aresample=osr=${target}:filter_size=64,asetrate=${format.sampleRate}`,
			...rawAudioInputArgs(format),
			params.outPath,
		],
		undefined,
		input,
	);
}

/**
 * Write one run at `atFrame`. Within `toleranceFrames` of the cursor it's
 * simply appended (timestamp rounding, not a gap); further ahead the gap is
 * silenced; behind, the overlap is trimmed off the run's start. `endFrame`
 * clips the run's tail.
 */
export async function placeRun(params: {
	writer: AudioTimelineWriter;
	sourcePath: string;
	run: AudioRun;
	atFrame: number;
	endFrame?: number;
	toleranceFrames: number;
	tmpDir: string;
}): Promise<void> {
	const { writer, run } = params;
	const outFrames =
		run.ratio === 1
			? run.frames
			: Math.max(1, Math.round(run.frames * run.ratio));

	let skip = 0;
	if (params.atFrame > writer.frames + params.toleranceFrames) {
		await writer.padTo(params.atFrame);
	} else if (params.atFrame < writer.frames - params.toleranceFrames) {
		skip = writer.frames - Math.round(params.atFrame);
	}
	let count = outFrames - skip;
	if (params.endFrame !== undefined) {
		count = Math.min(count, Math.round(params.endFrame) - writer.frames);
	}
	if (count <= 0) return;

	if (run.ratio === 1) {
		await writer.copyFrom(params.sourcePath, run.sourceFrame + skip, count);
		return;
	}

	const stretched = path.join(
		params.tmpDir,
		`stretch-${Date.now()}-${Math.random().toString(36).slice(2)}.raw`,
	);
	try {
		await resampleRange({
			sourcePath: params.sourcePath,
			fromFrame: run.sourceFrame,
			frames: run.frames,
			outFrames,
			format: writer.format,
			outPath: stretched,
		});
		await writer.copyFrom(stretched, skip, count);
	} finally {
		await rm(stretched, { force: true }).catch(() => undefined);
	}
}

// ── Decoding recorder audio ─────────────────────────────────────────────

/** A timestamp step beyond this inside a recorder part is a real dropout. */
const PART_SPLIT_MS = 20;
/** Fit points every ~second of audio. */
const PART_CHUNK_FRAMES = MASTER_AUDIO_FORMAT.sampleRate;

interface FramecrcEntry {
	pts: number | null;
	duration: number;
}

/** Parse ffmpeg's framecrc output: per-stream time base + one line per packet. */
function parseFramecrc(text: string): {
	timeBase: number;
	entries: FramecrcEntry[];
} {
	let timeBase = 1 / 1000;
	const entries: FramecrcEntry[] = [];
	for (const line of text.split("\n")) {
		if (line.startsWith("#tb 0:")) {
			const match = /(\d+)\s*\/\s*(\d+)/.exec(line);
			if (match) timeBase = Number(match[1]) / Number(match[2]);
			continue;
		}
		if (!line || line.startsWith("#")) continue;
		const fields = line.split(",").map((field) => field.trim());
		if (fields.length < 4) continue;
		const pts = Number(fields[2]);
		entries.push({
			pts: Number.isFinite(pts) ? pts : null,
			duration: Number(fields[3]) || 0,
		});
	}
	return { timeBase, entries };
}

export interface DecodedPartAudio {
	/** Every decoded sample end to end, in MASTER_AUDIO_FORMAT. */
	rawPath: string;
	frames: number;
	/** ~1s chunks stamped with the recorder's own timestamps (ms). */
	chunks: ClockChunk[];
	/** First video frame's timestamp (ms, same clock), if the part has video. */
	videoStartMs: number | null;
}

/**
 * Decode a recorder part's audio to raw PCM and read the timestamps the
 * recorder gave it. ffmpeg decodes sample-continuously - it ignores timestamp
 * gaps and drift - which is exactly what the run planner needs to compare
 * against.
 */
export async function decodePartAudio(params: {
	input: string;
	rawPath: string;
	tmpDir: string;
	id: string;
	hasVideo: boolean;
	timeoutMs?: number;
}): Promise<DecodedPartAudio> {
	const audioCrc = path.join(params.tmpDir, `${params.id}-audio.crc`);
	const videoCrc = path.join(params.tmpDir, `${params.id}-video.crc`);
	const format = MASTER_AUDIO_FORMAT;
	const args = [
		"-y",
		"-fflags",
		"+genpts",
		"-i",
		params.input,
		"-map",
		"0:a:0",
		...rawAudioInputArgs(format),
		params.rawPath,
		"-map",
		"0:a:0",
		"-c:a",
		"pcm_s16le",
		"-ar",
		String(format.sampleRate),
		"-ac",
		String(format.channelCount),
		"-f",
		"framecrc",
		audioCrc,
	];
	if (params.hasVideo) {
		args.push(
			"-map",
			"0:v:0",
			"-frames:v",
			"8",
			"-c:v",
			"copy",
			"-f",
			"framecrc",
			videoCrc,
		);
	}

	try {
		await runFfmpeg(args, params.timeoutMs);

		const frameBytes = bytesPerFrame(format);
		const raw = await open(params.rawPath, "r");
		const frames = Math.floor((await raw.stat()).size / frameBytes);
		await raw.close();

		const audio = parseFramecrc(await readFile(audioCrc, "utf8"));
		const chunks: ClockChunk[] = [];
		let current: ClockChunk | null = null;
		let expectedMs: number | null = null;
		let counted = 0;
		for (const entry of audio.entries) {
			const durationMs = entry.duration * audio.timeBase * 1000 || 0;
			const samples = Math.round(
				entry.duration * audio.timeBase * format.sampleRate,
			);
			const ms: number =
				entry.pts === null
					? (expectedMs ?? 0)
					: entry.pts * audio.timeBase * 1000;
			if (
				!current ||
				current.frames >= PART_CHUNK_FRAMES ||
				(expectedMs !== null && Math.abs(ms - expectedMs) > PART_SPLIT_MS)
			) {
				current = { startMs: ms, frames: 0 };
				chunks.push(current);
			}
			current.frames += samples;
			counted += samples;
			expectedMs = ms + durationMs;
		}
		// framecrc and the raw file come from the same decode; if rounding ever
		// leaves them apart, the raw file is the truth.
		const last = chunks[chunks.length - 1];
		if (last && counted !== frames) {
			last.frames = Math.max(0, last.frames + frames - counted);
		}

		let videoStartMs: number | null = null;
		if (params.hasVideo) {
			const video = parseFramecrc(
				await readFile(videoCrc, "utf8").catch(() => ""),
			);
			for (const entry of video.entries) {
				if (entry.pts === null) continue;
				const ms = entry.pts * video.timeBase * 1000;
				videoStartMs = videoStartMs === null ? ms : Math.min(videoStartMs, ms);
			}
		}

		return { rawPath: params.rawPath, frames, chunks, videoStartMs };
	} finally {
		await rm(audioCrc, { force: true }).catch(() => undefined);
		await rm(videoCrc, { force: true }).catch(() => undefined);
	}
}

// ── Lossless PCM masters ────────────────────────────────────────────────

/** Client stamps are min-filtered per chunk; a step past this is a real break
 *  (the audio context was suspended, the tab reloaded). */
const PCM_JUMP_MS = 100;

export interface PcmTimelineSegment {
	sequenceNumber: number;
	/** Timeline position of the chunk's first sample, measured on the system
	 *  clock by the client (ms). */
	startMs: number;
	format: RawAudioFormat;
	/** null / empty = the chunk object is gone. */
	load: () => Promise<Buffer | null>;
}

/**
 * Build a lossless PCM master: chunks in sequence order, each run of
 * continuous capture placed at its measured start and stretched to the span
 * it covered (see the module comment). `originMs` is the timeline instant the
 * output should start at (the video master's start) - the first run is padded
 * by up to `maxLeadPadMs` to land there.
 */
export async function composePcmTimeline(params: {
	segments: PcmTimelineSegment[];
	outPath: string;
	tmpDir: string;
	originMs: number | null;
	maxLeadPadMs: number;
	convert: (
		buffer: Buffer,
		from: RawAudioFormat,
		to: RawAudioFormat,
	) => Promise<Buffer>;
	/** Resample down to this when the capture ran faster (the plan's cap). */
	maxSampleRate?: number;
	toleranceMs?: number;
}): Promise<
	RawAudioFormat & {
		bytes: number;
		leadPadMs: number;
		runs: number;
		correctedMs: number;
	}
> {
	const first = params.segments[0];
	if (!first) throw new Error("No PCM segments");
	const format = {
		...first.format,
		sampleRate: Math.min(
			first.format.sampleRate,
			params.maxSampleRate ?? Number.POSITIVE_INFINITY,
		),
	};
	const frameBytes = bytesPerFrame(format);
	const sourcePath = `${params.outPath}.src`;

	try {
		// 1. Every readable chunk end to end, noting where capture broke.
		const chunks: ClockChunk[] = [];
		const source = await open(sourcePath, "w");
		try {
			let previousSequence: number | null = null;
			let broken = false;
			for (const segment of params.segments) {
				const lostBefore =
					previousSequence !== null &&
					segment.sequenceNumber !== previousSequence + 1;
				previousSequence = segment.sequenceNumber;
				let buffer = await segment.load();
				if (buffer && buffer.length > 0) {
					const sameFormat =
						segment.format.sampleRate === format.sampleRate &&
						segment.format.channelCount === format.channelCount &&
						segment.format.bitDepth === format.bitDepth;
					if (!sameFormat) {
						buffer = await params.convert(buffer, segment.format, format);
					}
				}
				const frames = buffer ? Math.floor(buffer.length / frameBytes) : 0;
				if (!buffer || frames === 0) {
					broken = true;
					continue;
				}
				await source.write(buffer, 0, frames * frameBytes);
				chunks.push({
					startMs: segment.startMs,
					frames,
					breakBefore: broken || lostBefore,
				});
				broken = false;
			}
		} finally {
			await source.close();
		}
		if (chunks.length === 0) throw new Error("No PCM audio could be read");

		// 2. Runs + their clocks.
		const runs = planAudioRuns(chunks, format.sampleRate, {
			jumpMs: PCM_JUMP_MS,
		});
		const firstRun = runs[0];
		if (!firstRun) throw new Error("No PCM audio could be read");
		const leadPadMs =
			params.originMs === null
				? 0
				: Math.min(
						params.maxLeadPadMs,
						Math.max(0, firstRun.startMs - params.originMs),
					);

		// 3. Lay them out.
		const toleranceFrames = Math.round(
			((params.toleranceMs ?? 20) * format.sampleRate) / 1000,
		);
		const writer = await AudioTimelineWriter.open(params.outPath, format);
		let correctedMs = 0;
		try {
			for (const run of runs) {
				const atMs = leadPadMs + run.startMs - firstRun.startMs;
				await placeRun({
					writer,
					sourcePath,
					run,
					atFrame: Math.max(0, Math.round((atMs * format.sampleRate) / 1000)),
					toleranceFrames,
					tmpDir: params.tmpDir,
				});
				correctedMs += Math.abs(
					runSpanMs(run, format.sampleRate) -
						(run.frames * 1000) / format.sampleRate,
				);
			}
		} finally {
			await writer.close();
		}

		return {
			...format,
			bytes: writer.frames * frameBytes,
			leadPadMs,
			runs: runs.length,
			correctedMs: Math.round(correctedMs),
		};
	} finally {
		await rm(sourcePath, { force: true }).catch(() => undefined);
	}
}
