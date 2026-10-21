/**
 * Media worker process.
 *
 * WORKER_ROLE (or `--role=`) picks which queues this process consumes:
 * `finalize` runs session finalization only, `general` runs every other queue, and
 * no role runs everything (see `lib/worker-role.ts`).
 *
 * In the default mode this is a traditional always-on BullMQ consumer. With
 * WORKER_SERVERLESS=true it exposes POST /wake, drains its queues, then closes
 * every Redis/database connection so Railway can scale it to zero.
 */

import "./lib/load-env.ts";
import { type Server, createServer } from "node:http";
import { type Job, type Queue, Worker } from "bullmq";
import type IORedis from "ioredis";
import { prisma } from "./db/index.ts";
import { logFfmpegAvailability } from "./lib/ffmpeg-check.ts";
import {
	FINALIZE_QUEUE,
	type FinalizeJob,
	QUEUE_ROLES,
	TRANSCODE_QUEUE,
	type TranscodeJob,
	closeQueueConnections,
	createConnection,
	getFinalizeQueue,
	getTranscodeQueue,
	isQueueConfigured,
} from "./lib/queue.ts";
import { resolveWorkerRole } from "./lib/worker-role.ts";
import {
	type DownloadFormat,
	transcodeToR2,
} from "./services/download-service.ts";
import {
	finalizeSession,
	finalizeTrack,
	requestTrackFinalize,
} from "./services/finalization-service.ts";
import { finalizeScreenSession } from "./services/screen-finalization-service.ts";

if (!isQueueConfigured()) {
	console.error(
		"[Worker] REDIS_URL is not set. The worker has nothing to connect to - " +
			"set REDIS_URL and restart.",
	);
	process.exit(1);
}

const role = resolveWorkerRole();
const roleLabel = role ?? "all";
const concurrency = Number(process.env.WORKER_CONCURRENCY) || 2;
const serverless = process.env.WORKER_SERVERLESS === "true";
const idleGraceMs = Number(process.env.WORKER_IDLE_GRACE_MS) || 30_000;
const pollIntervalMs = 1000;
const wakeSecret = process.env.WORKER_WAKE_SECRET;

if (serverless && process.env.NODE_ENV === "production" && !wakeSecret) {
	console.error(
		"[Worker] WORKER_WAKE_SECRET is required when WORKER_SERVERLESS=true in production.",
	);
	process.exit(1);
}

/** Chunks landed while the track was encoding: run it once more. */
const LATE_CHUNK_RERUN_DELAY_MS = 5000;

async function processFinalizeJob(
	job: Job<FinalizeJob>,
): Promise<{ rerun: boolean } | undefined> {
	const { recordingSessionId, recordingId } = job.data;
	console.log(
		`[Worker:finalize] picked job ${job.id} for session ${recordingSessionId}${recordingId ? ` track ${recordingId}` : ""}`,
	);

	if (recordingId) {
		return finalizeTrack(recordingSessionId, recordingId);
	}

	const session = await prisma.recordingSession.findUnique({
		where: { id: recordingSessionId },
		select: {
			source: true,
			status: true,
			userId: true,
			spaceId: true,
			participantRecordings: {
				select: {
					id: true,
					isComplete: true,
					uploadedSegments: true,
					expectedSegments: true,
				},
			},
		},
	});

	if (!session) {
		console.warn(`[Worker:finalize] session ${recordingSessionId} not found`);
		return;
	}

	console.log(
		`[Worker:finalize] session ${recordingSessionId} source=${session.source} status=${session.status} recordings=${session.participantRecordings.length}`,
		session.participantRecordings.map((recording) => ({
			id: recording.id,
			complete: recording.isComplete,
			uploaded: recording.uploadedSegments,
			expected: recording.expectedSegments,
		})),
	);

	if (session.source === "SCREEN_RECORDER") {
		console.log(
			`[Worker:finalize] routing ${recordingSessionId} to screen finalizer`,
		);
		await finalizeScreenSession(recordingSessionId);
		return;
	}

	console.log(
		`[Worker:finalize] fanning ${recordingSessionId} out to per-track jobs`,
	);
	await finalizeSession(recordingSessionId);
	return undefined;
}

async function processTranscodeJob(job: Job<TranscodeJob>): Promise<void> {
	const { masterKey, targetKey, format } = job.data;
	console.log(
		`[Worker:transcode] picked job ${job.id}: ${masterKey} -> ${targetKey} (${format})`,
	);
	await transcodeToR2(masterKey, targetKey, format as DownloadFormat);
}

interface QueueDefinition {
	name: keyof typeof QUEUE_ROLES;
	process: (job: Job) => Promise<unknown>;
	getQueue: () => Queue;
}

// Every queue this codebase consumes. Add new ones here and in QUEUE_ROLES.
const QUEUE_DEFINITIONS: QueueDefinition[] = [
	{
		name: FINALIZE_QUEUE,
		process: processFinalizeJob,
		getQueue: getFinalizeQueue,
	},
	{
		name: TRANSCODE_QUEUE,
		process: processTranscodeJob,
		getQueue: getTranscodeQueue,
	},
];

const ownedQueues = QUEUE_DEFINITIONS.filter(
	(definition) => !role || QUEUE_ROLES[definition.name] === role,
);
const ownedQueueNames = ownedQueues.map((definition) => definition.name);

interface Consumers {
	workers: Worker[];
	connections: IORedis[];
}

function attachWorkerLogs(name: string, worker: Worker): void {
	worker.on("completed", (job) => {
		console.log(`[Worker:${name}] completed ${job.id}`, job.data);
		// A track that got late chunks mid-encode re-queues itself here, after
		// its job has left the queue - an add from inside the running job would
		// be deduped against itself.
		const data = job.data as Partial<FinalizeJob>;
		const result = job.returnvalue as { rerun?: boolean } | undefined;
		if (
			name === FINALIZE_QUEUE &&
			result?.rerun &&
			data.recordingSessionId &&
			data.recordingId
		) {
			void requestTrackFinalize(data.recordingSessionId, data.recordingId, {
				delayMs: LATE_CHUNK_RERUN_DELAY_MS,
			});
		}
	});
	worker.on("failed", (job, error) =>
		console.error(`[Worker:${name}] failed ${job?.id}:`, job?.data, error),
	);
	worker.on("error", (error) =>
		console.error(`[Worker:${name}] worker error:`, error),
	);
	worker.on("stalled", (jobId) =>
		console.warn(`[Worker:${name}] stalled ${jobId}`),
	);
}

function createConsumers(): Consumers {
	const consumers: Consumers = { workers: [], connections: [] };
	for (const definition of ownedQueues) {
		const connection = createConnection();
		const worker = new Worker(definition.name, definition.process, {
			connection,
			concurrency,
			// A multi-hour encode runs in a child process, but a long GC pause or a
			// big chunk download can still delay the lock renewal; a lost lock
			// makes BullMQ hand the same job to a second worker mid-encode.
			lockDuration: 120_000,
		});
		attachWorkerLogs(definition.name, worker);
		consumers.workers.push(worker);
		consumers.connections.push(connection);
	}
	return consumers;
}

async function closeConsumers(consumers: Consumers): Promise<void> {
	await Promise.allSettled(consumers.workers.map((worker) => worker.close()));
	await Promise.allSettled(
		consumers.connections.map(async (connection) => {
			if (connection.status !== "end") {
				await connection.quit().catch(() => connection.disconnect());
			}
		}),
	);
}

async function pendingCount(queue: Queue): Promise<number> {
	const [waiting, active, delayed, prioritized, waitingChildren] =
		await Promise.all([
			queue.getWaitingCount(),
			queue.getActiveCount(),
			queue.getDelayedCount(),
			queue.getPrioritizedCount(),
			queue.getWaitingChildrenCount(),
		]);
	return waiting + active + delayed + prioritized + waitingChildren;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

let activeConsumers: Consumers | null = null;
let drainPromise: Promise<void> | null = null;
let wakeRequested = false;
let shuttingDown = false;
let httpServer: Server | null = null;

async function waitUntilQueuesAreQuiet(): Promise<void> {
	let emptySince: number | null = null;

	while (!shuttingDown) {
		let totalPending = 0;
		for (const definition of ownedQueues) {
			totalPending += await pendingCount(definition.getQueue());
		}

		if (totalPending === 0) {
			emptySince ??= Date.now();
			if (Date.now() - emptySince >= idleGraceMs) return;
		} else {
			emptySince = null;
		}

		await delay(pollIntervalMs);
	}
}

async function drainCycle(): Promise<void> {
	console.log(
		`[Worker:${roleLabel}] wake received; draining ${ownedQueueNames.join(", ")}.`,
	);
	activeConsumers = createConsumers();
	try {
		await waitUntilQueuesAreQuiet();
	} finally {
		const consumers = activeConsumers;
		activeConsumers = null;
		if (consumers) await closeConsumers(consumers);
		await closeQueueConnections();
		await prisma.$disconnect();
	}
	console.log(
		`[Worker:${roleLabel}] queues idle; outbound connections closed.`,
	);
}

function requestDrain(): void {
	wakeRequested = true;
	if (drainPromise) return;

	drainPromise = (async () => {
		while (wakeRequested && !shuttingDown) {
			wakeRequested = false;
			await drainCycle();
		}
	})()
		.catch((error) => console.error("[Worker] drain failed:", error))
		.finally(() => {
			drainPromise = null;
			// Cover a wake arriving between the loop's final check and cleanup.
			if (wakeRequested && !shuttingDown) requestDrain();
		});
}

function isAuthorized(authorization: string | undefined): boolean {
	if (!wakeSecret) return true;
	return authorization === `Bearer ${wakeSecret}`;
}

function startWakeServer(): void {
	const port = Number(process.env.PORT) || 4000;
	httpServer = createServer((request, response) => {
		if (request.method === "GET" && request.url === "/health") {
			response.writeHead(200, { "content-type": "application/json" });
			response.end(
				JSON.stringify({
					ok: true,
					role: roleLabel,
					queues: ownedQueueNames,
					draining: Boolean(drainPromise),
				}),
			);
			return;
		}

		if (request.method === "POST" && request.url === "/wake") {
			if (!isAuthorized(request.headers.authorization)) {
				response.writeHead(401, { "content-type": "application/json" });
				response.end(JSON.stringify({ ok: false }));
				return;
			}

			requestDrain();
			response.writeHead(202, { "content-type": "application/json" });
			response.end(JSON.stringify({ ok: true }));
			return;
		}

		response.writeHead(404, { "content-type": "application/json" });
		response.end(JSON.stringify({ ok: false }));
	});

	httpServer.listen(port, "::", () => {
		console.log(
			`[Worker:${roleLabel}] serverless wake endpoint listening on port ${port} for ${ownedQueueNames.join(", ")}.`,
		);
	});
}

async function shutdown(signal: string): Promise<void> {
	if (shuttingDown) return;
	shuttingDown = true;
	console.log(`[Worker] ${signal} received, draining active work...`);

	const consumers = activeConsumers;
	activeConsumers = null;
	if (consumers) await closeConsumers(consumers);
	await drainPromise?.catch(() => undefined);
	await closeQueueConnections();
	await prisma.$disconnect();
	await new Promise<void>((resolve) => {
		if (!httpServer) return resolve();
		httpServer.close(() => resolve());
	});
	process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

if (serverless) {
	startWakeServer();
	// A deploy or crash can leave jobs queued (or stalled mid-encode) with no
	// wake call coming - drain once at boot so they're picked up now.
	requestDrain();
} else {
	activeConsumers = createConsumers();
	console.log(
		`[Worker:${roleLabel}] up in always-on mode for ${ownedQueueNames.join(", ")} - concurrency ${concurrency} per queue.`,
	);
}

logFfmpegAvailability("Worker");
