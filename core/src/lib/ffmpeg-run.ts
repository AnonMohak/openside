import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { ffmpegPath, withThreadLimit } from "./ffmpeg-path.ts";

/**
 * Run ffmpeg to completion. `stdin` is piped in when given (an input of
 * `pipe:0`); otherwise stdin is closed. Rejects with the stderr tail on a
 * non-zero exit.
 */
export function runFfmpeg(
	args: string[],
	timeoutMs?: number,
	stdin?: Readable,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn(ffmpegPath, withThreadLimit(args), {
			stdio: [stdin ? "pipe" : "ignore", "ignore", "pipe"],
		});
		let stderr = "";
		let settled = false;
		const finish = (error: Error | null) => {
			if (settled) return;
			settled = true;
			if (timeout) clearTimeout(timeout);
			if (error) reject(error);
			else resolve();
		};
		const timeout = timeoutMs
			? setTimeout(() => {
					proc.kill("SIGKILL");
					finish(new Error(`ffmpeg timed out after ${timeoutMs}ms`));
				}, timeoutMs)
			: null;

		if (stdin && proc.stdin) {
			// ffmpeg closing its input early (it hit an error) surfaces as EPIPE
			// here; the exit code below is the real result.
			proc.stdin.on("error", () => undefined);
			stdin.on("error", (error) => {
				proc.kill("SIGKILL");
				finish(error);
			});
			stdin.pipe(proc.stdin);
		}

		proc.stderr?.on("data", (data) => {
			stderr += data.toString();
			// Keep only the tail - a multi-hour encode prints a lot of progress.
			if (stderr.length > 64_000) stderr = stderr.slice(-16_000);
		});
		proc.on("error", (error) => finish(error));
		proc.on("close", (code) => {
			if (code === 0) finish(null);
			else finish(new Error(`ffmpeg exited ${code}: ${stderr.slice(-2000)}`));
		});
	});
}
