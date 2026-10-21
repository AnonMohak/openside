/**
 * One fixed output geometry per video master.
 *
 * WHY THIS EXISTS:
 * A `getDisplayMedia` track RESIZES mid-capture whenever the shared surface
 * changes shape - switching tabs, resizing or maximizing the shared window, a
 * display-scale change. MediaRecorder happily encodes that as a resolution
 * switch mid-stream, but libx264 cannot change frame size mid-encode: with no
 * explicit size filter, everything after the switch is fed to an encoder still
 * configured for the ORIGINAL geometry, which is what produced the smeared /
 * garbage masters ("leave the recorder page, get a broken video").
 *
 * Both finalizers (screen recorder + space) share this so neither can drift
 * back to an unpinned encode.
 */

import { spawn } from "node:child_process";
import { ffmpegPath } from "./ffmpeg-path.ts";

export interface VideoSize {
	width: number;
	height: number;
}

/** Run ffmpeg purely to read its stderr (probing); never rejects on exit code. */
function ffmpegStderr(args: string[]): Promise<string> {
	return new Promise((resolve) => {
		const proc = spawn(ffmpegPath, args, {
			stdio: ["ignore", "ignore", "pipe"],
		});
		let stderr = "";
		const timeout = setTimeout(() => proc.kill("SIGKILL"), 30_000);
		proc.stderr.on("data", (d) => {
			stderr += d.toString();
		});
		proc.on("error", () => {
			clearTimeout(timeout);
			resolve(stderr);
		});
		proc.on("close", () => {
			clearTimeout(timeout);
			resolve(stderr);
		});
	});
}

export interface MediaProbe {
	hasVideo: boolean;
	hasAudio: boolean;
	/** First video stream's frame size, when there is one. */
	size: VideoSize | null;
	/** Container duration; null when the header has none (raw MediaRecorder
	 *  WebM never does). */
	durationMs: number | null;
	/** First video stream's frame rate (its "fps", else its "tbr"). */
	fps: number | null;
	/** Container's overall bitrate, in bits per second. */
	bitrate: number | null;
	/** First audio stream's sample rate (Hz) and channel count. */
	sampleRate: number | null;
	channels: number | null;
}

const CHANNEL_LAYOUTS: Record<string, number> = {
	mono: 1,
	stereo: 2,
	"2.1": 3,
	quad: 4,
	"4.0": 4,
	"5.0": 5,
	"5.1": 6,
	"6.1": 7,
	"7.1": 8,
};

/**
 * Which streams a file ACTUALLY has. The client's metadata can't be trusted
 * for this: a camera track recorded with the camera off is audio-only, and a
 * participant with no mic produces video-only parts.
 */
export async function probeMedia(file: string): Promise<MediaProbe> {
	const out = await ffmpegStderr(["-hide_banner", "-i", file]);
	const videoLine = /Stream #[^\n]*?: Video:[^\n]*/.exec(out)?.[0] ?? null;
	const hasAudio = /Stream #[^\n]*?: Audio:/.test(out);
	const sizeMatch = videoLine
		? /\b(\d{2,5})x(\d{2,5})\b/.exec(videoLine)
		: null;
	const width = sizeMatch ? Number(sizeMatch[1]) : 0;
	const height = sizeMatch ? Number(sizeMatch[2]) : 0;
	const durationMatch = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(out);
	const durationMs = durationMatch
		? Math.round(
				(Number(durationMatch[1]) * 3600 +
					Number(durationMatch[2]) * 60 +
					Number(durationMatch[3])) *
					1000,
			)
		: null;
	const fpsMatch = videoLine
		? (/\b(\d+(?:\.\d+)?) fps\b/.exec(videoLine) ??
			/\b(\d+(?:\.\d+)?) tbr\b/.exec(videoLine))
		: null;
	const fps = fpsMatch ? Number(fpsMatch[1]) : null;
	const bitrateMatch = /Duration:[^\n]*?bitrate: (\d+) kb\/s/.exec(out);
	const bitrate = bitrateMatch ? Number(bitrateMatch[1]) * 1000 : null;
	const audioLine = /Stream #[^\n]*?: Audio:[^\n]*/.exec(out)?.[0] ?? null;
	const rateMatch = audioLine ? /\b(\d+) Hz\b/.exec(audioLine) : null;
	const layout = audioLine
		? /\bHz, ([^,]+),/.exec(audioLine)?.[1]?.trim()
		: undefined;
	const channelCount = layout
		? (CHANNEL_LAYOUTS[layout.replace(/\(.*\)$/, "")] ??
			Number(/^(\d+) channels/.exec(layout)?.[1]))
		: Number.NaN;
	return {
		hasVideo: videoLine !== null,
		hasAudio,
		size: width && height ? { width, height } : null,
		durationMs,
		fps: fps && Number.isFinite(fps) ? fps : null,
		bitrate,
		sampleRate: rateMatch ? Number(rateMatch[1]) : null,
		channels: Number.isFinite(channelCount) ? channelCount : null,
	};
}

/** First video frame size reported in the container header (null if unreadable). */
async function probeVideoSize(file: string): Promise<VideoSize | null> {
	// No output file: ffmpeg prints the input's stream table to stderr, then
	// exits non-zero ("At least one output file must be specified").
	const out = await ffmpegStderr(["-hide_banner", "-i", file]);
	const match = /Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/.exec(out);
	if (!match) return null;
	const width = Number(match[1]);
	const height = Number(match[2]);
	if (!width || !height) return null;
	return { width, height };
}

/** yuv420p needs even dimensions. */
export function evenDim(n: number): number {
	return Math.max(2, Math.floor(n / 2) * 2);
}

/**
 * The size every frame of a master is normalized to.
 *
 * Target = the LARGEST size we know about (the client-reported max observed
 * dimensions vs the container header), so a surface that GREW mid-capture is
 * downscaled rather than cropped.
 */
export async function resolveTargetSize(
	rec: { width: number | null; height: number | null },
	rawPath: string,
): Promise<VideoSize> {
	const candidates: VideoSize[] = [];
	if (rec.width && rec.height && rec.width > 1 && rec.height > 1) {
		candidates.push({ width: rec.width, height: rec.height });
	}
	const probed = await probeVideoSize(rawPath);
	if (probed) candidates.push(probed);

	const best = candidates.reduce<VideoSize | null>(
		(acc, c) => (!acc || c.width * c.height > acc.width * acc.height ? c : acc),
		null,
	) ?? { width: 1920, height: 1080 };

	return { width: evenDim(best.width), height: evenDim(best.height) };
}

/** Scale a size down (aspect kept) so its SHORT side is at most `maxShortSide`
 *  - "720p" means the short side, so a portrait frame is capped the same way. */
export function capShortSide(
	size: VideoSize,
	maxShortSide?: number,
): VideoSize {
	const shortSide = Math.min(size.width, size.height);
	const scale =
		maxShortSide && shortSide > maxShortSide ? maxShortSide / shortSide : 1;
	return {
		width: evenDim(Math.round(size.width * scale)),
		height: evenDim(Math.round(size.height * scale)),
	};
}

/** scale-to-fit + letterbox onto the pinned canvas, so a mid-stream resolution
 *  change becomes black bars instead of a corrupt encode. */
export function sizeFilter(size: VideoSize): string {
	return (
		`scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease,` +
		`pad=${size.width}:${size.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`
	);
}
