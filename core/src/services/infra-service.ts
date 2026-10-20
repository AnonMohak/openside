/**
 * Infra resolution - which LiveKit + R2 a given user/space/object runs on.
 *
 * SELF_HOST users bring their own LiveKit + R2 keys (stored encrypted in
 * SelfHostConfig); everyone else runs on the platform's env-configured infra.
 * Recording object keys and room names are owner-scoped by construction
 * (`spaces/{spaceId}/…`, `screen/{userId}/…`, `space:{spaceId}`), so callers
 * don't need to thread config around - the storage/LiveKit/egress services
 * resolve the right target from the key/room they're already given.
 *
 * Users can switch between self-host and platform at any time, so the infra
 * a space or recording session runs on is STAMPED when it starts
 * (Space.selfHosted / RecordingSession.selfHosted) and always resolved from
 * that stamp - never from the owner's current setting. Rows from before the
 * stamp existed (null) follow the owner's current setting, and reads of their
 * objects fall back to the other bucket when the file isn't there.
 *
 * Lookups are cached briefly; call invalidateInfraCache(userId) after a
 * settings change.
 */

import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "../db/index.ts";
import { decryptSecret } from "../lib/crypto.ts";
import { R2_BUCKET, getR2Client } from "../lib/r2-client.ts";

export interface LiveKitInfra {
	url: string;
	apiKey: string;
	apiSecret: string;
	selfHost: boolean;
}

export interface R2Infra {
	client: S3Client;
	bucket: string;
	selfHost: boolean;
}

export interface SelfHostCredentials {
	livekitUrl: string;
	livekitApiKey: string;
	livekitApiSecret: string;
	r2AccountId: string;
	r2AccessKeyId: string;
	r2SecretAccessKey: string;
	r2Bucket: string;
}

const CACHE_TTL_MS = 60 * 1000;

interface CacheEntry<T> {
	value: T;
	expiresAt: number;
}

interface StoredSelfHost {
	credentials: SelfHostCredentials;
	enabled: boolean;
}

interface Stamp {
	ownerId: string | null;
	selfHosted: boolean | null;
}

const selfHostCache = new Map<string, CacheEntry<StoredSelfHost | null>>();
const spaceStampCache = new Map<string, CacheEntry<Stamp>>();
const sessionStampCache = new Map<string, CacheEntry<Stamp>>();
const legacyKeyCache = new Map<string, CacheEntry<R2Infra>>();
const s3ClientCache = new Map<string, S3Client>();

function readCache<T>(
	map: Map<string, CacheEntry<T>>,
	key: string,
): T | undefined {
	const entry = map.get(key);
	if (!entry || entry.expiresAt < Date.now()) {
		map.delete(key);
		return undefined;
	}
	return entry.value;
}

function writeCache<T>(map: Map<string, CacheEntry<T>>, key: string, value: T) {
	map.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidateInfraCache(userId: string) {
	selfHostCache.delete(userId);
	// Legacy objects may resolve differently once the owner's setting changes.
	legacyKeyCache.clear();
}

/** Call after stamping a space so the next lookup sees the new value. */
export function invalidateSpaceInfraCache(spaceId: string) {
	spaceStampCache.delete(spaceId);
}

export function getEnvLiveKitInfra(): LiveKitInfra {
	const url = process.env.LIVEKIT_URL;
	const apiKey = process.env.LIVEKIT_API_KEY;
	const apiSecret = process.env.LIVEKIT_API_SECRET;

	if (!url || !apiKey || !apiSecret) {
		throw new Error("LIVEKIT_NOT_CONFIGURED");
	}

	return { url, apiKey, apiSecret, selfHost: false };
}

export function getEnvR2Infra(): R2Infra {
	return { client: getR2Client(), bucket: R2_BUCKET, selfHost: false };
}

/**
 * The user's validated self-host keys, whether or not the switch is on.
 * Needed to reach recordings made while they were self-hosting.
 */
async function getStoredSelfHost(
	userId: string,
): Promise<StoredSelfHost | null> {
	const cached = readCache(selfHostCache, userId);
	if (cached !== undefined) return cached;

	const config = await prisma.selfHostConfig.findUnique({
		where: { userId },
	});

	let stored: StoredSelfHost | null = null;
	if (config?.lastValidatedAt) {
		try {
			stored = {
				enabled: config.enabled,
				credentials: {
					livekitUrl: config.livekitUrl,
					livekitApiKey: decryptSecret(config.livekitApiKey),
					livekitApiSecret: decryptSecret(config.livekitApiSecret),
					r2AccountId: config.r2AccountId,
					r2AccessKeyId: decryptSecret(config.r2AccessKeyId),
					r2SecretAccessKey: decryptSecret(config.r2SecretAccessKey),
					r2Bucket: config.r2Bucket,
				},
			};
		} catch (error) {
			console.error(
				`[Infra] failed to decrypt self-host config for ${userId} - falling back to platform infra:`,
				error,
			);
		}
	}

	writeCache(selfHostCache, userId, stored);
	return stored;
}

/** Decrypted self-host credentials for a user, or null when not active. */
export async function getSelfHostCredentials(
	userId: string,
): Promise<SelfHostCredentials | null> {
	const stored = await getStoredSelfHost(userId);
	return stored?.enabled ? stored.credentials : null;
}

/** Whether new spaces/recordings for this user should go on their own infra. */
export async function isSelfHostActive(userId: string): Promise<boolean> {
	return !!(await getSelfHostCredentials(userId));
}

/**
 * Credentials for a stamped owner/infra pair. `selfHosted: null` (legacy)
 * follows the owner's current setting. A self-host stamp whose keys were since
 * deleted resolves to null - the files are unreachable.
 */
async function credentialsForStamp(
	stamp: Stamp,
): Promise<SelfHostCredentials | null> {
	if (!stamp.ownerId || stamp.selfHosted === false) return null;
	if (stamp.selfHosted === null) return getSelfHostCredentials(stamp.ownerId);
	return (await getStoredSelfHost(stamp.ownerId))?.credentials ?? null;
}

/**
 * Thrown when something stamped self-hosted is used after its owner removed
 * their keys. Fails closed: it must never fall back to platform infra, or a
 * self-host call would keep running on our LiveKit/R2 unmetered and uncapped.
 */
export const SELF_HOST_UNAVAILABLE = "SELF_HOST_UNAVAILABLE";

export function isSelfHostUnavailable(error: unknown): boolean {
	return error instanceof Error && error.message === SELF_HOST_UNAVAILABLE;
}

/** Like credentialsForStamp, but throws instead of falling back to platform. */
async function requireCredentialsForStamp(
	stamp: Stamp,
): Promise<SelfHostCredentials | null> {
	const creds = await credentialsForStamp(stamp);
	if (stamp.selfHosted === true && !creds) {
		throw new Error(SELF_HOST_UNAVAILABLE);
	}
	return creds;
}

function buildS3Client(creds: SelfHostCredentials): S3Client {
	const cacheKey = `${creds.r2AccountId}:${creds.r2AccessKeyId}:${creds.r2Bucket}`;
	const existing = s3ClientCache.get(cacheKey);
	if (existing) return existing;

	const client = new S3Client({
		region: "auto",
		endpoint: `https://${creds.r2AccountId}.r2.cloudflarestorage.com`,
		credentials: {
			accessKeyId: creds.r2AccessKeyId,
			secretAccessKey: creds.r2SecretAccessKey,
		},
	});

	s3ClientCache.set(cacheKey, client);
	return client;
}

function liveKitFromCredentials(
	creds: SelfHostCredentials | null,
): LiveKitInfra {
	if (!creds) return getEnvLiveKitInfra();
	return {
		url: creds.livekitUrl,
		apiKey: creds.livekitApiKey,
		apiSecret: creds.livekitApiSecret,
		selfHost: true,
	};
}

function r2FromCredentials(creds: SelfHostCredentials | null): R2Infra {
	if (!creds) return getEnvR2Infra();
	return {
		client: buildS3Client(creds),
		bucket: creds.r2Bucket,
		selfHost: true,
	};
}

export async function resolveLiveKitForUser(
	userId: string | null | undefined,
): Promise<LiveKitInfra> {
	if (!userId) return getEnvLiveKitInfra();
	return liveKitFromCredentials(await getSelfHostCredentials(userId));
}

export async function resolveR2ForUser(
	userId: string | null | undefined,
): Promise<R2Infra> {
	if (!userId) return getEnvR2Infra();
	return r2FromCredentials(await getSelfHostCredentials(userId));
}

async function getSpaceStamp(spaceId: string): Promise<Stamp> {
	const cached = readCache(spaceStampCache, spaceId);
	if (cached !== undefined) return cached;

	const space = await prisma.space.findUnique({
		where: { id: spaceId },
		select: { hostId: true, selfHosted: true },
	});

	const stamp: Stamp = {
		ownerId: space?.hostId ?? null,
		selfHosted: space?.selfHosted ?? null,
	};
	writeCache(spaceStampCache, spaceId, stamp);
	return stamp;
}

async function getSessionStamp(sessionId: string): Promise<Stamp | null> {
	const cached = readCache(sessionStampCache, sessionId);
	if (cached !== undefined) return cached;

	const session = await prisma.recordingSession.findUnique({
		where: { id: sessionId },
		select: {
			userId: true,
			selfHosted: true,
			space: { select: { hostId: true } },
		},
	});
	if (!session) return null;

	const stamp: Stamp = {
		ownerId: session.space?.hostId ?? session.userId,
		selfHosted: session.selfHosted,
	};
	// Only cache once stamped - a stamp never changes after that.
	if (stamp.selfHosted !== null)
		writeCache(sessionStampCache, sessionId, stamp);
	return stamp;
}

/** Room names are `space:{spaceId}` - infra follows the space's stamp. */
export async function resolveLiveKitForRoom(
	roomName: string | null | undefined,
): Promise<LiveKitInfra> {
	const spaceId = roomName?.startsWith("space:") ? roomName.slice(6) : null;
	if (!spaceId) return getEnvLiveKitInfra();
	return resolveLiveKitForSpace(spaceId);
}

export async function resolveLiveKitForSpace(
	spaceId: string,
): Promise<LiveKitInfra> {
	return liveKitFromCredentials(
		await requireCredentialsForStamp(await getSpaceStamp(spaceId)),
	);
}

export interface R2RawCredentials {
	accessKeyId: string;
	secretAccessKey: string;
	endpoint: string;
	bucket: string;
	selfHost: boolean;
}

/**
 * Raw R2 credentials (for LiveKit egress S3Upload, which can't take an
 * S3Client). Follows the space's stamp, so egress always writes to the same
 * side as the LiveKit server it runs on - platform R2 keys are never handed to
 * a self-hosted LiveKit.
 */
export async function resolveR2CredentialsForSpace(
	spaceId: string,
): Promise<R2RawCredentials> {
	const creds = await requireCredentialsForStamp(await getSpaceStamp(spaceId));

	if (creds) {
		return {
			accessKeyId: creds.r2AccessKeyId,
			secretAccessKey: creds.r2SecretAccessKey,
			endpoint: `https://${creds.r2AccountId}.r2.cloudflarestorage.com`,
			bucket: creds.r2Bucket,
			selfHost: true,
		};
	}

	return {
		accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
		secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
		endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
		bucket: R2_BUCKET,
		selfHost: false,
	};
}

/**
 * Who owns a storage key and which infra it was stamped on:
 *   spaces/{spaceId}/sessions/{sessionId}/…  -> the session's stamp
 *   screen/{userId}/sessions/{sessionId}/…   -> the session's stamp
 *   spaces/{spaceId}/… or screen/{userId}/…  -> legacy (owner's current setting)
 * Anything else lives on platform R2.
 */
async function getKeyStamp(key: string): Promise<Stamp> {
	const sessionMatch = key.match(
		/^(?:spaces|screen)\/[^/]+\/sessions\/([^/]+)\//,
	);
	if (sessionMatch?.[1]) {
		const stamp = await getSessionStamp(sessionMatch[1]);
		if (stamp) return stamp;
	}

	const spaceMatch = key.match(/^spaces\/([^/]+)\//);
	if (spaceMatch?.[1]) {
		const { ownerId } = await getSpaceStamp(spaceMatch[1]);
		return { ownerId, selfHosted: null };
	}

	const screenMatch = key.match(/^screen\/([^/]+)\//);
	if (screenMatch?.[1]) {
		return { ownerId: screenMatch[1], selfHosted: null };
	}

	return { ownerId: null, selfHosted: false };
}

/** Where a key's object is written (and, for stamped sessions, read from). */
export async function resolveR2ForKey(key: string): Promise<R2Infra> {
	// Never let a self-host session spill onto platform R2 once its keys are gone.
	return r2FromCredentials(
		await requireCredentialsForStamp(await getKeyStamp(key)),
	);
}

/**
 * Every bucket a key's object could be in. Stamped keys have exactly one;
 * legacy keys (made before stamping) may be in either the owner's bucket or
 * platform R2, depending on what they were set to back then.
 */
export async function resolveR2CandidatesForKey(
	key: string,
): Promise<R2Infra[]> {
	const stamp = await getKeyStamp(key);

	if (stamp.selfHosted !== null || !stamp.ownerId) {
		const creds = await credentialsForStamp(stamp);
		// Self-host keys deleted -> nothing reachable; platform is a harmless miss.
		return [r2FromCredentials(creds)];
	}

	const stored = await getStoredSelfHost(stamp.ownerId);
	const current = r2FromCredentials(
		stored?.enabled ? stored.credentials : null,
	);
	if (!stored) return [current];

	const other = stored.enabled
		? getEnvR2Infra()
		: r2FromCredentials(stored.credentials);
	return [current, other];
}

/**
 * Bucket to READ a key from. Stamped keys resolve directly; legacy keys check
 * the owner's current side first and fall back to the other one.
 */
export async function resolveR2ForRead(key: string): Promise<R2Infra> {
	const cached = readCache(legacyKeyCache, key);
	if (cached) return cached;

	const candidates = await resolveR2CandidatesForKey(key);
	const [primary] = candidates;
	if (!primary) return getEnvR2Infra();
	if (candidates.length === 1) return primary;

	for (const candidate of candidates) {
		try {
			await candidate.client.send(
				new HeadObjectCommand({ Bucket: candidate.bucket, Key: key }),
			);
			writeCache(legacyKeyCache, key, candidate);
			return candidate;
		} catch {
			// Not in this bucket (or unreachable) - try the next one.
		}
	}

	return primary;
}
