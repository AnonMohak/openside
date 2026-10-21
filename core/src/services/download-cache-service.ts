/**
 * Expiry for cached download formats.
 *
 * An MP3 of a WAV master, an MP4 of a WebM one: download-service makes these
 * on first request and keeps them next to the master, so the next download is
 * instant. Kept forever they'd double a recording's storage for the rest of
 * its life, so a cache nobody has downloaded for a week is deleted - the next
 * request just transcodes it again.
 *
 * Last use is tracked in a Redis sorted set (key → timestamp), no schema
 * needed. Losing that set only means those caches live until their recording
 * is deleted, as before.
 */

import { prisma } from "../db/index.ts";
import { withRedis } from "../lib/queue.ts";
import { deleteObjects } from "./storage-service.ts";

const CACHE_SET = "openside:download-cache";

const DOWNLOAD_CACHE_TTL_MS =
	Number(process.env.DOWNLOAD_CACHE_TTL_MS) || 7 * 24 * 60 * 60 * 1000;

const EXPIRE_BATCH = 200;
const MAX_BATCHES_PER_RUN = 10;

/** A cached format was just made or served: keep it another full TTL. */
export async function touchDownloadCache(key: string): Promise<void> {
	await withRedis((redis) => redis.zadd(CACHE_SET, Date.now(), key)).catch(
		(error) =>
			console.warn(`[DownloadCache] couldn't record use of ${key}:`, error),
	);
}

/**
 * Keys the database points at as a real file. A cached format can share a key
 * with a later master (a legacy WebM master re-finalized to MP4 lands on the
 * key its MP4 cache had), and that must never be expired.
 */
async function keysInUse(keys: string[]): Promise<Set<string>> {
	const used = new Set<string>();
	const [outputs, recordings] = await Promise.all([
		prisma.finalOutput.findMany({
			where: {
				OR: [
					{ masterKey: { in: keys } },
					{ audioWavKey: { in: keys } },
					{ thumbnailKey: { in: keys } },
				],
			},
			select: { masterKey: true, audioWavKey: true, thumbnailKey: true },
		}),
		prisma.participantRecording.findMany({
			where: { mergedFileKey: { in: keys } },
			select: { mergedFileKey: true },
		}),
	]);
	for (const output of outputs) {
		for (const key of [
			output.masterKey,
			output.audioWavKey,
			output.thumbnailKey,
		]) {
			if (key) used.add(key);
		}
	}
	for (const recording of recordings) {
		if (recording.mergedFileKey) used.add(recording.mergedFileKey);
	}

	// Screen recordings keep their outputs in a JSON column on the session.
	const screenSessionIds = [
		...new Set(
			keys.flatMap((key) => {
				const id = key.match(/^screen\/[^/]+\/sessions\/([^/]+)\//)?.[1];
				return id ? [id] : [];
			}),
		),
	];
	if (screenSessionIds.length > 0) {
		const sessions = await prisma.recordingSession.findMany({
			where: { id: { in: screenSessionIds } },
			select: { outputs: true },
		});
		for (const session of sessions) {
			if (!session.outputs || typeof session.outputs !== "object") continue;
			for (const value of Object.values(
				session.outputs as Record<string, unknown>,
			)) {
				const key = (value as { key?: unknown } | null)?.key;
				if (typeof key === "string") used.add(key);
			}
		}
	}
	return used;
}

/** Delete cached formats unused for the TTL. Returns how many were deleted. */
export async function expireDownloadCache(): Promise<number> {
	let expired = 0;
	for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
		const cutoff = Date.now() - DOWNLOAD_CACHE_TTL_MS;
		const candidates = await withRedis((redis) =>
			redis.zrangebyscore(CACHE_SET, "-inf", cutoff, "LIMIT", 0, EXPIRE_BATCH),
		);
		if (!candidates || candidates.length === 0) break;

		const inUse = await keysInUse(candidates);
		// Re-read the scores: a download may have used one since the range read.
		const scores =
			(await withRedis((redis) => redis.zmscore(CACHE_SET, ...candidates))) ??
			[];
		const stale = candidates.filter((key, index) => {
			const score = scores[index];
			return score !== null && score !== undefined && Number(score) <= cutoff;
		});
		const doomed = stale.filter((key) => !inUse.has(key));

		if (doomed.length > 0) await deleteObjects(doomed);
		const settled = [...doomed, ...stale.filter((key) => inUse.has(key))];
		if (settled.length > 0) {
			await withRedis((redis) => redis.zrem(CACHE_SET, ...settled));
		}
		expired += doomed.length;
		if (candidates.length < EXPIRE_BATCH || settled.length === 0) break;
	}
	if (expired > 0) {
		console.log(`[DownloadCache] expired ${expired} cached download(s)`);
	}
	return expired;
}
