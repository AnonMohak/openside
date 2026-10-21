/**
 * Background housekeeping: recording recovery, usage metering, retention and
 * LiveKit/egress reconciliation.
 *
 * Two runners share this list. The API runs due tasks opportunistically while
 * it has traffic (no timers, so Railway Serverless can still put it to sleep),
 * and the `maintenance` cron service runs every task once on a schedule - so a
 * stuck finalize, an abandoned session or an unmetered take is recovered even
 * when nobody is using the app. Every task is safe to run concurrently with
 * itself (conditional updates, deduped queue jobs).
 */

import { expireDownloadCache } from "../services/download-cache-service.ts";
import {
	reconcileLiveKitState,
	reconcilePendingEgress,
} from "../services/livekit-webhook-service.ts";
import { reconcileStaleRecordingSessions } from "../services/recording-service.ts";
import { sweepExpiredRecordings } from "../services/retention-service.ts";
import { sweepActiveRecordingUsage } from "../services/usage-service.ts";

interface MaintenanceTask {
	name: string;
	intervalMs: number;
	run: () => Promise<unknown>;
	nextRunAt: number;
	running: boolean;
}

// Recovery first: on a scheduled run it's the one that must not wait behind a
// slow LiveKit call.
const maintenanceTasks: MaintenanceTask[] = [
	{
		name: "Recording recovery sweep",
		intervalMs: Number(process.env.RECORDING_RECOVERY_INTERVAL_MS) || 60 * 1000,
		run: reconcileStaleRecordingSessions,
		nextRunAt: 0,
		running: false,
	},
	{
		name: "Usage metering sweep",
		intervalMs: Number(process.env.USAGE_SWEEP_INTERVAL_MS) || 60 * 1000,
		run: sweepActiveRecordingUsage,
		nextRunAt: 0,
		running: false,
	},
	{
		name: "Egress reconcile sweep",
		intervalMs: Number(process.env.EGRESS_POLL_INTERVAL_MS) || 30 * 1000,
		run: reconcilePendingEgress,
		nextRunAt: 0,
		running: false,
	},
	{
		name: "LiveKit reconcile sweep",
		intervalMs:
			Number(process.env.LIVEKIT_RECONCILE_INTERVAL_MS) || 5 * 60 * 1000,
		run: reconcileLiveKitState,
		nextRunAt: 0,
		running: false,
	},
	{
		name: "Download cache expiry",
		intervalMs:
			Number(process.env.DOWNLOAD_CACHE_SWEEP_INTERVAL_MS) || 60 * 60 * 1000,
		run: expireDownloadCache,
		nextRunAt: 0,
		running: false,
	},
	{
		name: "Retention sweep",
		intervalMs:
			Number(process.env.RETENTION_SWEEP_INTERVAL_MS) || 15 * 60 * 1000,
		run: sweepExpiredRecordings,
		nextRunAt: 0,
		running: false,
	},
];

/** Kick off every task whose interval has elapsed (API: called per request). */
export function runDueMaintenance(): void {
	const now = Date.now();
	for (const task of maintenanceTasks) {
		if (task.running || now < task.nextRunAt) continue;
		task.running = true;
		task.nextRunAt = now + task.intervalMs;
		void task
			.run()
			.catch((error) => console.error(`${task.name} failed:`, error))
			.finally(() => {
				task.running = false;
			});
	}
}

/** A hung task (a LiveKit call that never answers) must not stall the rest. */
const SCHEDULED_TASK_TIMEOUT_MS = 2 * 60 * 1000;

/** Run every task once, in order (the cron service). Returns the ones that failed. */
export async function runAllMaintenance(): Promise<string[]> {
	const failed: string[] = [];
	for (const task of maintenanceTasks) {
		const started = Date.now();
		let timer: NodeJS.Timeout | null = null;
		try {
			await Promise.race([
				task.run(),
				new Promise((_, reject) => {
					timer = setTimeout(
						() => reject(new Error("timed out")),
						SCHEDULED_TASK_TIMEOUT_MS,
					);
				}),
			]);
			console.log(`[Maintenance] ${task.name}: ok (${Date.now() - started}ms)`);
		} catch (error) {
			console.error(`[Maintenance] ${task.name} failed:`, error);
			failed.push(task.name);
		} finally {
			if (timer) clearTimeout(timer);
		}
	}
	return failed;
}
