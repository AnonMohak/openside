/**
 * Retention sweep - recordings auto-delete once they outlive their owner's
 * plan window: DEMO 48h, PRO 30 days, SELF_HOST never (their bucket, their
 * data). The window follows the infra the session was stamped on, not the
 * owner's current switch: a Pro user's cloud recordings still expire after 30
 * days while they're self-hosting, and their self-hosted ones are never purged
 * from their bucket after they switch back. Runs on an interval from the API
 * process (see index.ts).
 *
 * Age is measured from when the recording stopped (fallback: startedAt).
 * ACTIVE sessions are never touched.
 */

import { prisma } from "../db/index.ts";
import {
	DEMO_RETENTION_HOURS,
	getEntitlements,
} from "./entitlements-service.ts";
import { purgeRecordingSessionCascade } from "./recording-service.ts";
import { resolveSessionOwner } from "./usage-service.ts";

const SWEEP_BATCH_SIZE = 50;

export async function sweepExpiredRecordings(): Promise<void> {
	// The shortest window (DEMO 48h) bounds the candidate set; each candidate's
	// actual window comes from its owner's entitlements.
	const oldestPossible = new Date(
		Date.now() - DEMO_RETENTION_HOURS * 60 * 60 * 1000,
	);

	const candidates = await prisma.recordingSession.findMany({
		where: {
			status: { not: "ACTIVE" },
			// Self-hosted sessions are kept forever - skip them here so they can't
			// fill every batch and starve the ones that do expire.
			AND: [
				{
					OR: [
						{ stoppedAt: { lt: oldestPossible } },
						{ stoppedAt: null, startedAt: { lt: oldestPossible } },
					],
				},
				{ OR: [{ selfHosted: false }, { selfHosted: null }] },
			],
		},
		select: {
			id: true,
			spaceId: true,
			userId: true,
			startedAt: true,
			stoppedAt: true,
			selfHosted: true,
		},
		orderBy: { startedAt: "asc" },
		take: SWEEP_BATCH_SIZE,
	});

	if (candidates.length === 0) return;

	// Entitlements are per owner + infra - look each pair up once per sweep.
	const retentionByOwner = new Map<string, number | null>();

	for (const session of candidates) {
		try {
			const ownerUserId = await resolveSessionOwner(session);
			if (!ownerUserId) continue;

			const cacheKey = `${ownerUserId}:${session.selfHosted}`;
			if (!retentionByOwner.has(cacheKey)) {
				const entitlements = await getEntitlements(
					ownerUserId,
					session.selfHosted,
				);
				retentionByOwner.set(cacheKey, entitlements.retentionHours);
			}

			const retentionHours = retentionByOwner.get(cacheKey) ?? null;
			if (retentionHours === null) continue; // self-host: keep forever

			const endedAt = session.stoppedAt ?? session.startedAt;
			const expiresAt = endedAt.getTime() + retentionHours * 60 * 60 * 1000;
			if (expiresAt > Date.now()) continue;

			await purgeRecordingSessionCascade(session.id);
			console.log(
				`[Retention] deleted session ${session.id} (owner ${ownerUserId}, ${retentionHours}h window)`,
			);
		} catch (error) {
			console.error(`[Retention] failed to process ${session.id}:`, error);
		}
	}
}
