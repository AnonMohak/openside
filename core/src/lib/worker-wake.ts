import type { WorkerRole } from "./worker-role.ts";

function normalizeUrl(url: string | undefined): string | undefined {
	return url?.replace(/\/$/, "") || undefined;
}

// Each role has its own wake URL. WORKER_WAKE_URL is the fallback for a single
// worker that consumes every queue.
const wakeUrls: Record<WorkerRole, string | undefined> = {
	finalize: normalizeUrl(
		process.env.FINALIZE_WORKER_WAKE_URL ?? process.env.WORKER_WAKE_URL,
	),
	general: normalizeUrl(
		process.env.GENERAL_WORKER_WAKE_URL ?? process.env.WORKER_WAKE_URL,
	),
};
const wakeSecret = process.env.WORKER_WAKE_SECRET;

const RETRY_DELAYS_MS = [0, 250, 500, 1000, 2000];
const REQUEST_TIMEOUT_MS = 10_000;

const warnedMissingUrl = new Set<WorkerRole>();

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wake the worker for `role` after a job has been durably added to Redis.
 *
 * Railway may return a transient 502 while restoring a sleeping service, so
 * cold-start failures are retried. A wake failure never removes the queued job;
 * it remains in Redis for the next wake/recovery attempt.
 */
export async function wakeWorker(role: WorkerRole): Promise<void> {
	const wakeUrl = wakeUrls[role];
	if (!wakeUrl) {
		if (!warnedMissingUrl.has(role)) {
			warnedMissingUrl.add(role);
			console.warn(
				`[WorkerWake] no wake URL for the ${role} worker; assuming it is always-on.`,
			);
		}
		return;
	}

	let lastError: unknown;
	for (const retryDelay of RETRY_DELAYS_MS) {
		if (retryDelay > 0) await delay(retryDelay);

		try {
			const response = await fetch(`${wakeUrl}/wake`, {
				method: "POST",
				headers: wakeSecret
					? { authorization: `Bearer ${wakeSecret}` }
					: undefined,
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});

			if (response.ok) return;

			const message = `worker wake returned ${response.status}`;
			if (response.status === 401 || response.status === 403) {
				throw new Error(`${message}; check WORKER_WAKE_SECRET`);
			}
			lastError = new Error(message);
		} catch (error) {
			lastError = error;
			if (
				error instanceof Error &&
				error.message.includes("WORKER_WAKE_SECRET")
			) {
				break;
			}
		}
	}

	console.error(
		`[WorkerWake] queued job is waiting, but the ${role} worker could not be woken:`,
		lastError,
	);
}
