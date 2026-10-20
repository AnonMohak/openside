/**
 * Worker roles.
 *
 * Finalization runs on its own worker service so it never waits behind (or
 * crashes alongside) other media work. Every other queue - transcodes today,
 * more later - runs on the `general` worker, which can scale out independently.
 * A worker with no role consumes every queue: the single-worker setup used in
 * local dev and by older deploys.
 */

export const WORKER_ROLES = ["finalize", "general"] as const;
export type WorkerRole = (typeof WORKER_ROLES)[number];

function isWorkerRole(value: string): value is WorkerRole {
	return (WORKER_ROLES as readonly string[]).includes(value);
}

/** Role from a `--role=<role>` argument or WORKER_ROLE; null = every queue. */
export function resolveWorkerRole(): WorkerRole | null {
	const arg = process.argv
		.find((value) => value.startsWith("--role="))
		?.slice("--role=".length);
	const value = (arg ?? process.env.WORKER_ROLE)?.trim();
	if (!value) return null;
	if (isWorkerRole(value)) return value;
	throw new Error(
		`Unknown worker role "${value}" - expected ${WORKER_ROLES.join(" or ")}.`,
	);
}
