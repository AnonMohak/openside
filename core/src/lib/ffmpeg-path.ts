import ffmpegStatic from "ffmpeg-static";

/**
 * Path to the ffmpeg binary. `ffmpeg-static` bundles a platform-specific
 * static binary into node_modules so we don't depend on the deploy image
 * having ffmpeg installed. Falls back to a PATH lookup if it's unavailable.
 */
export const ffmpegPath: string = ffmpegStatic ?? "ffmpeg";

const ffmpegThreads = Number(process.env.FFMPEG_THREADS) || 0;

/**
 * Cap encoder threads at FFMPEG_THREADS so concurrent jobs on one worker share
 * the CPU instead of each grabbing every core. `-threads` is a per-file option,
 * so it goes right before the output path, which must be the last argument.
 * Unset = ffmpeg's default (all cores).
 */
export function withThreadLimit(args: string[]): string[] {
	if (!ffmpegThreads) return args;
	return [
		...args.slice(0, -1),
		"-threads",
		String(ffmpegThreads),
		...args.slice(-1),
	];
}
