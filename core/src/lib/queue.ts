/**
 * Job queue (BullMQ + Redis) for heavy media work.
 *
 * The API server must NEVER run ffmpeg in-process - it should only enqueue a
 * job. A separate worker fleet (see `src/worker.ts`) consumes these queues and
 * scales independently of the API.
 *
 * GRACEFUL FALLBACK:
 * If REDIS_URL isn't set, `enqueue*` returns false and the caller runs the work
 * in-process (the old behaviour). This keeps local dev and any not-yet-migrated
 * deploy working without Redis - you only get the scaling benefit once REDIS_URL
 * is configured AND the worker process is running.
 */

import { type Job, type JobsOptions, Queue } from "bullmq";
import IORedis from "ioredis";
import type { WorkerRole } from "./worker-role.ts";
import { wakeWorker } from "./worker-wake.ts";

const redisUrl = process.env.REDIS_URL;

export const FINALIZE_QUEUE = "finalize";
export const TRANSCODE_QUEUE = "transcode";

/** Which worker role consumes each queue. New queues go to `general`. */
export const QUEUE_ROLES = {
	[FINALIZE_QUEUE]: "finalize",
	[TRANSCODE_QUEUE]: "general",
} as const satisfies Record<string, WorkerRole>;

export interface FinalizeJob {
	recordingSessionId: string;
	/** Meeting tracks finalize one job per track, so a 10-person session encodes
	 *  in parallel across the worker fleet instead of one track after another.
	 *  Absent for screen-recorder sessions (composited per session). */
	recordingId?: string;
}

export interface TranscodeJob {
	masterKey: string;
	targetKey: string;
	/** DownloadFormat ("mp4" | "mp3" | "wav" | "webm"); typed loosely to avoid a
	 *  circular import with download-service. */
	format: string;
}

/** Whether the queue is usable (Redis configured). */
export function isQueueConfigured(): boolean {
	return Boolean(redisUrl);
}

/**
 * A fresh Redis connection. Workers need their own (they issue blocking
 * commands), so each Worker should call this rather than share one.
 * `maxRetriesPerRequest: null` is required by BullMQ.
 */
export function createConnection(): IORedis {
	if (!redisUrl) {
		throw new Error("REDIS_URL is not set - cannot create a Redis connection.");
	}
	return new IORedis(redisUrl, { maxRetriesPerRequest: null });
}

// Queues (producer side) can share a single cached connection.
let producerConnection: IORedis | null = null;
let finalizeQueue: Queue<FinalizeJob> | null = null;
let transcodeQueue: Queue<TranscodeJob> | null = null;
let producerOperations = 0;
let producerCloseTimer: NodeJS.Timeout | null = null;
let producerClosePromise: Promise<void> | null = null;

const producerIdleMs = Number(process.env.QUEUE_PRODUCER_IDLE_MS) || 30_000;

function beginProducerOperation(): void {
	producerOperations += 1;
	if (producerCloseTimer) {
		clearTimeout(producerCloseTimer);
		producerCloseTimer = null;
	}
}

function endProducerOperation(): void {
	producerOperations -= 1;
	if (producerOperations !== 0 || producerCloseTimer) return;

	producerCloseTimer = setTimeout(() => {
		producerCloseTimer = null;
		void closeQueueConnections().catch((error) =>
			console.error("[Queue] failed to close idle Redis connections:", error),
		);
	}, producerIdleMs);
	producerCloseTimer.unref();
}

function getProducerConnection(): IORedis {
	if (!producerConnection) producerConnection = createConnection();
	return producerConnection;
}

export function getFinalizeQueue(): Queue<FinalizeJob> {
	if (!finalizeQueue) {
		finalizeQueue = new Queue<FinalizeJob>(FINALIZE_QUEUE, {
			connection: getProducerConnection(),
		});
	}
	return finalizeQueue;
}

export function getTranscodeQueue(): Queue<TranscodeJob> {
	if (!transcodeQueue) {
		transcodeQueue = new Queue<TranscodeJob>(TRANSCODE_QUEUE, {
			connection: getProducerConnection(),
		});
	}
	return transcodeQueue;
}

/** Close producer-side queue connections so an idle serverless worker has no
 * outbound Redis traffic and Railway can put the container to sleep. */
export async function closeQueueConnections(): Promise<void> {
	if (producerClosePromise) return producerClosePromise;
	if (producerCloseTimer) {
		clearTimeout(producerCloseTimer);
		producerCloseTimer = null;
	}

	const queues = [finalizeQueue, transcodeQueue].filter(
		(queue): queue is Queue<FinalizeJob> | Queue<TranscodeJob> =>
			queue !== null,
	);
	const connection = producerConnection;

	finalizeQueue = null;
	transcodeQueue = null;
	producerConnection = null;

	producerClosePromise = (async () => {
		await Promise.allSettled(queues.map((queue) => queue.close()));
		if (connection && connection.status !== "end") {
			await connection.quit().catch(() => connection.disconnect());
		}
	})();

	try {
		await producerClosePromise;
	} finally {
		producerClosePromise = null;
	}
}

const DEFAULT_JOB_OPTS: JobsOptions = {
	attempts: 3,
	backoff: { type: "exponential", delay: 5000 },
	// Keep recent terminal jobs for visibility, then auto-prune.
	removeOnComplete: { age: 3600, count: 1000 },
	removeOnFail: { age: 24 * 3600 },
};

function safeJobId(prefix: string, value: string): string {
	return `${prefix}-${value.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

/**
 * BullMQ silently ignores an add whose jobId already exists - including a job
 * that already FAILED (kept 24h for visibility) or completed. That turned "retry
 * this" into a no-op for a day. Clear a finished job first; leave waiting,
 * delayed and active ones alone, since deduping those is the point.
 * `minFailedAgeMs` throttles re-running something that just failed.
 */
async function clearFinishedJob<T>(
	queue: Queue<T>,
	jobId: string,
	minFailedAgeMs = 0,
): Promise<"clear" | "pending" | "throttled"> {
	const existing: Job<T> | undefined = await queue.getJob(jobId);
	if (!existing) return "clear";
	const state = await existing.getState();
	if (state === "failed") {
		const failedAt = existing.finishedOn ?? 0;
		if (Date.now() - failedAt < minFailedAgeMs) return "throttled";
		await existing.remove().catch(() => undefined);
		return "clear";
	}
	if (state === "completed") {
		await existing.remove().catch(() => undefined);
		return "clear";
	}
	return "pending";
}

/**
 * Enqueue a session finalization. Deduped by jobId so the same session can't be
 * finalized twice concurrently (replaces the old in-memory `inFlight` guard,
 * which broke across multiple API replicas). Returns false if Redis isn't
 * configured, signalling the caller to fall back to in-process work.
 */
export async function enqueueFinalize(
	recordingSessionId: string,
): Promise<boolean> {
	if (!isQueueConfigured()) return false;
	beginProducerOperation();
	try {
		await clearFinishedJob(
			getFinalizeQueue(),
			safeJobId("finalize", recordingSessionId),
		);
		await getFinalizeQueue().add(
			"finalize",
			{ recordingSessionId },
			{
				jobId: safeJobId("finalize", recordingSessionId),
				...DEFAULT_JOB_OPTS,
				// Remove immediately on success so a later track completion can enqueue a
				// fresh finalize for the same session. With the default retention, the
				// dedup jobId would swallow that follow-up run and the straggler track
				// would never finalize (until the recovery sweep). While a job is active,
				// re-adds are still ignored, so this keeps concurrent dedup intact.
				removeOnComplete: true,
			},
		);
		await wakeWorker(QUEUE_ROLES[FINALIZE_QUEUE]);
		return true;
	} finally {
		endProducerOperation();
	}
}

export type FinalizeTrackJobState =
	| "pending"
	| "failed"
	| "missing"
	| "unconfigured";

function finalizeTrackJobId(recordingId: string): string {
	return safeJobId("finalize-track", recordingId);
}

/**
 * Enqueue one meeting track's finalization. Deduped per track: while its job
 * waits, sits in its delay, or runs, re-adds are ignored. `delayMs` debounces a
 * burst of late chunks into one re-encode.
 */
export async function enqueueFinalizeTrack(
	recordingSessionId: string,
	recordingId: string,
	{ delayMs = 0 }: { delayMs?: number } = {},
): Promise<boolean> {
	if (!isQueueConfigured()) return false;
	beginProducerOperation();
	try {
		const queue = getFinalizeQueue();
		const jobId = finalizeTrackJobId(recordingId);
		await clearFinishedJob(queue, jobId);
		await queue.add(
			"finalize-track",
			{ recordingSessionId, recordingId },
			{
				jobId,
				...DEFAULT_JOB_OPTS,
				// Storage hiccups are retried for ~10 minutes before a track is
				// given up on (chunks stay in R2 either way).
				attempts: 8,
				removeOnComplete: true,
				...(delayMs > 0 ? { delay: delayMs } : {}),
			},
		);
		await wakeWorker(QUEUE_ROLES[FINALIZE_QUEUE]);
		return true;
	} finally {
		endProducerOperation();
	}
}

/**
 * Whether a track's finalize job is still alive. A track left PROCESSING with
 * no live job lost its worker mid-encode; one whose job FAILED exhausted its
 * retries (a crash loop) and must not be re-run forever.
 */
export async function getFinalizeTrackJobState(
	recordingId: string,
): Promise<FinalizeTrackJobState> {
	if (!isQueueConfigured()) return "unconfigured";
	beginProducerOperation();
	try {
		const job = await getFinalizeQueue().getJob(
			finalizeTrackJobId(recordingId),
		);
		if (!job) return "missing";
		const state = await job.getState();
		if (state === "failed") return "failed";
		if (state === "completed" || state === "unknown") return "missing";
		return "pending";
	} finally {
		endProducerOperation();
	}
}

/**
 * Enqueue an on-demand transcode. Deduped by the target R2 key so two requests
 * for the same MP4/MP3/WAV don't double-encode. Returns false if Redis isn't
 * configured.
 */
export async function enqueueTranscode(job: TranscodeJob): Promise<boolean> {
	if (!isQueueConfigured()) return false;
	beginProducerOperation();
	try {
		const queue = getTranscodeQueue();
		const jobId = safeJobId("transcode", job.targetKey);
		// The caller only enqueues when the target file is missing, so a retained
		// completed job is stale (its output was invalidated) and a failed one
		// gets another try - throttled so a client polling a broken source
		// doesn't re-run it every few seconds.
		const existing = await clearFinishedJob(queue, jobId, 60_000);
		if (existing === "throttled") return true;
		await queue.add("transcode", job, {
			jobId,
			...DEFAULT_JOB_OPTS,
		});
		await wakeWorker(QUEUE_ROLES[TRANSCODE_QUEUE]);
		return true;
	} finally {
		endProducerOperation();
	}
}
