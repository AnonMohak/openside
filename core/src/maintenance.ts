/**
 * One-shot maintenance run, for a scheduled (cron) service.
 *
 * The API and the workers sleep when idle (Railway Serverless), and the API
 * only runs its housekeeping while it has traffic - so with nobody online, a
 * finalize whose worker died or an abandoned session would sit until someone
 * came back. A cron service running `pnpm maintenance` every few minutes closes
 * that gap: it runs every task once (see lib/maintenance.ts), then exits.
 */

import "./lib/load-env.ts";
import { prisma } from "./db/index.ts";
import { runAllMaintenance } from "./lib/maintenance.ts";
import { closeQueueConnections } from "./lib/queue.ts";

/** Work some tasks start without awaiting (a finalize enqueue + worker wake)
 *  gets this long to land; anything cut off is picked up by the next run. */
const SETTLE_MS = 10_000;

/** Never overlap the next scheduled run. */
const HARD_TIMEOUT_MS = 4 * 60 * 1000;

setTimeout(() => {
	console.error("[Maintenance] run exceeded its time budget; exiting");
	process.exit(1);
}, HARD_TIMEOUT_MS).unref();

async function main(): Promise<void> {
	const started = Date.now();
	const failed = await runAllMaintenance();
	await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
	await closeQueueConnections().catch(() => undefined);
	await prisma.$disconnect().catch(() => undefined);
	console.log(
		`[Maintenance] done in ${Date.now() - started}ms${failed.length > 0 ? `; failed: ${failed.join(", ")}` : ""}`,
	);
	process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
	console.error("[Maintenance] run failed:", error);
	process.exit(1);
});
