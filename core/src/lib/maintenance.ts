/**
 * Background housekeeping: recording recovery, usage metering, retention and
 * LiveKit/egress reconciliation.
 *
 * The API runs these on a timer for as long as it's up, so a stuck finalize,
 * an abandoned session or an unmetered take is recovered even when nobody is
 * using the app. That needs an always-on API (not Railway Serverless). Every
 * task is safe to run concurrently with itself (conditional updates, deduped
 * queue jobs), so several API replicas can each run them.
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

/** How often the API checks for due tasks; below the shortest task interval. */
const MAINTENANCE_TICK_MS = 15 * 1000;

/** Kick off every task whose interval has elapsed. */
function runDueMaintenance(): void {
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

/** Run due tasks now, then keep checking for as long as the API is up. */
export function startMaintenance(): void {
	runDueMaintenance();
	setInterval(runDueMaintenance, MAINTENANCE_TICK_MS);
}
