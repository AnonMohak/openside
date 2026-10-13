import { Router } from "express";
import {
	closeQueueConnections,
	getFinalizeQueue,
	getTranscodeQueue,
	isQueueConfigured,
} from "../lib/queue.ts";
import { wakeMediaWorker } from "../lib/worker-wake.ts";

export const queueAdminRoutes = Router();

const NAMES = ["finalize", "transcode"] as const;
type QueueName = (typeof NAMES)[number];
const isName = (v: string): v is QueueName =>
	(NAMES as readonly string[]).includes(v);
const queueOf = (name: QueueName) =>
	name === "finalize" ? getFinalizeQueue() : getTranscodeQueue();

// The API holds no Redis connection while idle (so it can sleep): open one for
// this request only and close it after.
async function withQueues<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} finally {
		await closeQueueConnections().catch(() => {});
	}
}

queueAdminRoutes.get("/queue", async (_req, res) => {
	if (!isQueueConfigured()) {
		res.json({ configured: false, queues: [] });
		return;
	}

	const queues = await withQueues(async () =>
		Promise.all(
			NAMES.map(async (name) => {
				const q = queueOf(name);
				const [counts, failed] = await Promise.all([
					q.getJobCounts("waiting", "active", "delayed", "completed", "failed"),
					q.getFailed(0, 19),
				]);
				return {
					name,
					counts: {
						waiting: counts.waiting ?? 0,
						active: counts.active ?? 0,
						delayed: counts.delayed ?? 0,
						completed: counts.completed ?? 0,
						failed: counts.failed ?? 0,
					},
					failedJobs: failed.map((j) => ({
						id: String(j.id),
						reason: (j.failedReason ?? "").slice(0, 300),
						attempts: j.attemptsMade,
						failedAt: j.finishedOn
							? new Date(j.finishedOn).toISOString()
							: null,
					})),
				};
			}),
		),
	);
	res.json({ configured: true, queues });
});

queueAdminRoutes.post("/queue/:name/jobs/:id/retry", async (req, res) => {
	const name = String(req.params.name);
	if (!isName(name)) {
		res.status(404).json({ error: "Unknown queue" });
		return;
	}
	const ok = await withQueues(async () => {
		const job = await queueOf(name).getJob(String(req.params.id));
		if (!job) return false;
		await job.retry();
		return true;
	});
	if (!ok) {
		res.status(404).json({ error: "Job not found" });
		return;
	}
	await wakeMediaWorker().catch(() => {});
	res.json({ ok: true });
});

queueAdminRoutes.delete("/queue/:name/jobs/:id", async (req, res) => {
	const name = String(req.params.name);
	if (!isName(name)) {
		res.status(404).json({ error: "Unknown queue" });
		return;
	}
	const ok = await withQueues(async () => {
		const job = await queueOf(name).getJob(String(req.params.id));
		if (!job) return false;
		await job.remove();
		return true;
	});
	if (!ok) {
		res.status(404).json({ error: "Job not found" });
		return;
	}
	res.json({ ok: true });
});
