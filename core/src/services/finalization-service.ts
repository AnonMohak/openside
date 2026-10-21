/**
 * Meeting finalization.
 *
 * Each participant track (camera, PCM mic, every screen share) finalizes on its
 * own as soon as all of its chunks are in - one queue job per track, so a big
 * meeting encodes in parallel and one slow or broken track never holds up the
 * rest. A track's chunks are byte-fragments of one or more recorder "parts"
 * (see lib/media-compose.ts); they're laid out on the track's timeline and
 * encoded to a CFR H.264/AAC master (audio-only tracks stay WebM).
 *
 * A track is never left PROCESSING by a dead worker (the next run takes it
 * over), never downgraded from READY by a failed re-run, and re-finalized when
 * a straggler chunk lands after it was already built.
 */

import { createReadStream, createWriteStream } from "node:fs";
import {
	appendFile,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "../db/index.ts";
import {
	type RawAudioFormat as PcmFormat,
	composePcmTimeline,
} from "../lib/audio-timeline.ts";
import {
	type ComposedMaster,
	composeAlignedMaster,
	composeTimeline,
	runFfmpeg,
	startsContainer,
} from "../lib/media-compose.ts";
import {
	enqueueFinalizeTrack,
	getFinalizeTrackJobState,
	isQueueConfigured,
} from "../lib/queue.ts";
import {
	type AllowedFps,
	DEFAULT_FPS,
	clampFps,
} from "../lib/recording-constants.ts";
import {
	describeSegmentGaps,
	findSegmentGaps,
	waitForLateSegments,
} from "../lib/segment-gaps.ts";
import { escapeFilterPath, watermarkFontPath } from "../lib/watermark-font.ts";
import { sessionNeedsWatermark } from "./entitlements-service.ts";
import {
	deleteObjects,
	getObjectBuffer,
	putFileObject,
} from "./storage-service.ts";

// In-process guard per track. Across processes, the queue's per-track jobId is
// the dedup: at most one job per track waits or runs at a time.
const inFlight = new Set<string>();

// Minimum join delay before we bother generating an aligned ("with space")
// variant. Below this, the gap is just recorder-startup/measurement noise - not
// a real late join - so padding it would only add black nobody needs. Genuine
// latecomers are seconds late, well above this.
const ALIGNED_MIN_OFFSET_MS = 500;

/** Re-run delay when chunks landed while a track was encoding. */
const LATE_CHUNK_RERUN_DELAY_MS = 5000;

/** Master CRF (veryfast). DEMO masters carry a watermark and use a lighter one. */
const MASTER_CRF = 18;
const WATERMARKED_MASTER_CRF = 20;

function trackKey(recordingId: string): string {
	return `track:${recordingId}`;
}

/**
 * Reading a chunk failed for a reason worth retrying (R2 or network trouble),
 * as opposed to the object really being gone. The job is retried instead of
 * failing a track for good while its chunks are still sitting in storage.
 */
class TransientFinalizeError extends Error {}

function isMissingObject(error: unknown): boolean {
	const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
	return (
		e?.name === "NoSuchKey" ||
		e?.name === "NotFound" ||
		e?.$metadata?.httpStatusCode === 404
	);
}

/** A chunk's bytes, or null if the object is gone (it becomes a gap). */
async function downloadChunk(key: string): Promise<Buffer | null> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await getObjectBuffer(key);
		} catch (error) {
			if (isMissingObject(error)) return null;
			if (attempt >= 2) {
				throw new TransientFinalizeError(
					`Chunk download failed: ${errorMessage(error)}`,
				);
			}
			await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
		}
	}
}

type TrackKind = "combined" | "audio" | `screen-${string}`;

function recordingTrackKind(rec: {
	id: string;
	type: "AUDIO" | "VIDEO";
	hasVideo: boolean;
	isScreenShare: boolean;
}): TrackKind {
	// A screen share lives under the SAME participant/session prefix as that
	// participant's camera master, so it must not reuse the "combined" kind - its
	// master/aligned/thumb keys would overwrite the camera's (and each other's when
	// there are multiple shares). Scope every screen share by its recording id.
	if (rec.isScreenShare) return `screen-${rec.id}`;
	// By the track's TYPE, not whether video was captured: a camera track
	// recorded with the camera off is still the camera track, and its key must
	// not move when a re-run finds video in it.
	return rec.type === "VIDEO" || rec.hasVideo ? "combined" : "audio";
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function masterContentType(ext: "mp4" | "webm"): string {
	return ext === "mp4" ? "video/mp4" : "video/webm";
}

function masterKey(
	spaceId: string,
	recordingSessionId: string,
	participantId: string,
	kind: TrackKind,
	ext: "mp4" | "webm",
): string {
	return `spaces/${spaceId}/sessions/${recordingSessionId}/${participantId}/${kind}/master.${ext}`;
}

function alignedKey(
	spaceId: string,
	recordingSessionId: string,
	participantId: string,
	kind: TrackKind,
	ext: "mp4" | "webm",
): string {
	return `spaces/${spaceId}/sessions/${recordingSessionId}/${participantId}/${kind}/aligned.${ext}`;
}

function thumbnailKey(
	spaceId: string,
	recordingSessionId: string,
	participantId: string,
	kind: TrackKind,
): string {
	return `spaces/${spaceId}/sessions/${recordingSessionId}/${participantId}/${kind}/thumb.jpg`;
}

/**
 * Object key for a participant's lossless WAV master (built from their raw-PCM
 * mic track). One per participant per session, under its own "audio-wav" prefix
 * so it never collides with or overwrites the WebM video master.
 */
function audioWavKey(
	spaceId: string,
	recordingSessionId: string,
	participantId: string,
): string {
	return `spaces/${spaceId}/sessions/${recordingSessionId}/${participantId}/audio-wav/master.wav`;
}

/**
 * Extract a sharp poster JPEG from a completed video master and upload it to
 * R2. It stays compact enough for cards, while preserving enough detail for
 * larger project previews. Uses ffmpeg's `thumbnail` filter to pick a
 * representative frame (it skips near-uniform frames, so camera warm-up / black
 * frames at the very start are avoided). Best-effort: a failure here never fails
 * the recording - the master is already safe.
 */
async function generateThumbnail(
	masterPath: string,
	spaceId: string,
	recordingSessionId: string,
	participantId: string,
	kind: TrackKind,
	tmpDir: string,
): Promise<string | null> {
	const thumbPath = path.join(tmpDir, `${participantId}-${kind}-thumb.jpg`);
	try {
		await runFfmpeg([
			"-y",
			"-i",
			masterPath,
			// Analyse a batch of early frames and keep the most representative one.
			"-vf",
			"thumbnail=n=100,scale=640:-2",
			"-frames:v",
			"1",
			// 2 (best) – 31 (worst). Keep the final poster crisp for the project UI.
			"-q:v",
			"4",
			thumbPath,
		]);
	} catch (error) {
		console.error("[Finalize] thumbnail extract failed:", error);
		return null;
	}

	const key = thumbnailKey(spaceId, recordingSessionId, participantId, kind);
	try {
		await putFileObject(key, thumbPath, "image/jpeg");
	} catch (error) {
		console.error("[Finalize] thumbnail upload failed:", error);
		return null;
	}
	return key;
}

/**
 * Extract a poster from the FIRST uploaded chunk while the recording is still in
 * progress, so a thumbnail is ready within seconds of pressing record - long
 * before finalization. The first chunk carries the WebM header, so it's a
 * self-contained decodable file (later chunks are headerless fragments and
 * can't be decoded alone). Writes to the same key finalization would use, so the
 * finalizer reuses it instead of re-extracting. Best-effort and fire-and-forget.
 */
export async function generateEarlyThumbnailFromChunk(params: {
	chunkKey: string;
	spaceId: string;
	recordingSessionId: string;
	participantId: string;
	recordingId: string;
}): Promise<void> {
	let tmp: string | null = null;
	try {
		tmp = await mkdtemp(path.join(tmpdir(), "openside-early-thumb-"));
		const chunkPath = path.join(tmp, "chunk0.webm");
		await writeFile(chunkPath, await getObjectBuffer(params.chunkKey));

		const thumbPath = path.join(tmp, "thumb.jpg");
		await runFfmpeg([
			"-y",
			"-i",
			chunkPath,
			// Pick a representative frame from the chunk (skips near-uniform
			// warm-up/black frames). This temporary poster is replaced by the
			// higher-quality final thumbnail once the master is complete.
			"-vf",
			"thumbnail=n=60,scale=640:-2",
			"-frames:v",
			"1",
			"-q:v",
			"5",
			thumbPath,
		]);

		// Camera track master kind is always "combined".
		const key = thumbnailKey(
			params.spaceId,
			params.recordingSessionId,
			params.participantId,
			"combined",
		);
		await putFileObject(key, thumbPath, "image/jpeg");
		await prisma.participantRecording
			.update({
				where: { id: params.recordingId },
				data: { thumbnailKey: key },
			})
			.catch(() => undefined);
	} catch (error) {
		console.error(
			"[Thumbnail] early thumbnail from first chunk failed:",
			error,
		);
	} finally {
		if (tmp)
			await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
	}
}

async function readyOutputCount(recordingSessionId: string): Promise<number> {
	return prisma.finalOutput.count({
		where: { recordingSessionId, status: "READY", masterKey: { not: null } },
	});
}

/**
 * Kick finalization for every meeting track that's ready. Safe to call
 * repeatedly (every track completion, every sweep): per-track jobs are deduped,
 * so a track already queued or running is left alone. Tracks finalize
 * independently - nobody waits for a slow participant.
 */
export async function maybeFinalizeSession(
	recordingSessionId: string,
): Promise<void> {
	const session = await prisma.recordingSession.findUnique({
		where: { id: recordingSessionId },
		select: {
			id: true,
			status: true,
			spaceId: true,
			participantRecordings: {
				select: { id: true, status: true, isComplete: true },
			},
		},
	});

	// Screen-recorder sessions have their own (per-session) finalizer.
	if (!session?.spaceId) return;

	// Tracks only become finalizable after the host stops.
	if (!["STOPPED", "PROCESSING", "FAILED", "READY"].includes(session.status)) {
		return;
	}

	const recordings = session.participantRecordings;
	if (recordings.length === 0) return;

	for (const rec of recordings) {
		if (rec.status === "UPLOADED") {
			await requestTrackFinalize(recordingSessionId, rec.id);
		} else if (rec.status === "PROCESSING") {
			await recoverProcessingTrack(recordingSessionId, session.spaceId, rec.id);
		}
	}

	// Nothing left to encode and nothing uploading (e.g. every track failed
	// with zero segments): settle the session's final status now.
	const pending = recordings.some(
		(rec) =>
			!rec.isComplete ||
			rec.status === "UPLOADED" ||
			rec.status === "PROCESSING",
	);
	if (!pending && session.status !== "READY") {
		await settleSessionStatus(recordingSessionId, session.spaceId);
	}
}

/** Queue one track (or, without Redis, run it in-process). */
export async function requestTrackFinalize(
	recordingSessionId: string,
	recordingId: string,
	{ delayMs = 0 }: { delayMs?: number } = {},
): Promise<void> {
	if (!isQueueConfigured()) {
		const run = () => {
			void finalizeTrack(recordingSessionId, recordingId).catch((error) =>
				console.error(
					`[Finalize] track ${recordingId} failed in-process (the recovery sweep retries it):`,
					error,
				),
			);
		};
		if (delayMs > 0) setTimeout(run, delayMs).unref();
		else run();
		return;
	}
	try {
		await enqueueFinalizeTrack(recordingSessionId, recordingId, { delayMs });
	} catch (error) {
		// Redis unreachable: never encode in the API process - the recovery
		// sweep re-kicks this track once the queue is back.
		console.error(
			`[Finalize] enqueue failed for track ${recordingId}; leaving for recovery:`,
			error,
		);
	}
}

/**
 * A track in PROCESSING whose job is gone lost its worker mid-encode (deploy,
 * OOM, scale-down) - run it again. One whose job FAILED exhausted its retries
 * (it keeps killing the worker): stop the crash loop and fail it for good.
 */
async function recoverProcessingTrack(
	recordingSessionId: string,
	spaceId: string,
	recordingId: string,
): Promise<void> {
	if (!isQueueConfigured()) {
		if (!inFlight.has(trackKey(recordingId))) {
			await requestTrackFinalize(recordingSessionId, recordingId);
		}
		return;
	}

	const state = await getFinalizeTrackJobState(recordingId).catch(
		() => "pending" as const,
	);
	if (state === "pending" || state === "unconfigured") return;

	if (state === "failed") {
		const rec = await prisma.participantRecording.findUnique({
			where: { id: recordingId },
			include: { segments: { orderBy: { sequenceNumber: "asc" } } },
		});
		if (rec?.status === "PROCESSING" && rec.participantId) {
			await failTrack({
				rec: { ...rec, participantId: rec.participantId },
				spaceId,
				recordingSessionId,
				message: "Finalization kept crashing the worker; gave up.",
			});
			await settleSessionStatus(recordingSessionId, spaceId);
		}
		return;
	}

	console.warn(
		`[Finalize] track ${recordingId} was left PROCESSING with no live job - re-running`,
	);
	await requestTrackFinalize(recordingSessionId, recordingId);
}

/** Settle the session status from where its tracks actually landed. */
async function settleSessionStatus(
	recordingSessionId: string,
	spaceId: string,
): Promise<void> {
	const [readyOutputs, recordings] = await Promise.all([
		readyOutputCount(recordingSessionId),
		prisma.participantRecording.findMany({
			where: { recordingSessionId },
			select: { status: true, isComplete: true },
		}),
	]);

	// Anything still uploading, queued, or mid-encode means more tracks are
	// coming - don't call the session finished yet.
	const stillPending = recordings.some(
		(rec) =>
			!rec.isComplete ||
			rec.status === "UPLOADED" ||
			rec.status === "PROCESSING",
	);

	if (readyOutputs > 0) {
		// At least one downloadable track exists → the session is usable now.
		// Late tracks get added incrementally by their own jobs.
		await prisma.recordingSession
			.updateMany({
				where: { id: recordingSessionId, status: { not: "ACTIVE" } },
				data: { status: "READY" },
			})
			.catch(() => undefined);
		return;
	}

	if (!stillPending && recordings.length > 0) {
		// Everything terminal and nothing succeeded → the session failed.
		await prisma.recordingSession
			.updateMany({
				where: { id: recordingSessionId, status: { not: "ACTIVE" } },
				data: { status: "FAILED" },
			})
			.catch(() => undefined);
		await prisma.space
			.updateMany({
				where: { id: spaceId, recordingStatus: "RECORDING" },
				data: { recordingStatus: "STOPPED" },
			})
			.catch(() => undefined);
		console.error(
			`[Finalize] Session ${recordingSessionId} failed: no recordings finalized.`,
		);
	}
}

/**
 * Finalize ONE meeting track. Returns whether chunks landed while it was
 * encoding, so the caller re-runs it once the current job is out of the way
 * (a re-add from inside the running job would be deduped away).
 */
export async function finalizeTrack(
	recordingSessionId: string,
	recordingId: string,
): Promise<{ rerun: boolean }> {
	const key = trackKey(recordingId);
	if (inFlight.has(key)) return { rerun: false };
	inFlight.add(key);

	let tmp: string | null = null;
	let rerun = false;
	try {
		const session = await prisma.recordingSession.findUnique({
			where: { id: recordingSessionId },
			select: {
				status: true,
				spaceId: true,
				targetFps: true,
				selfHosted: true,
			},
		});
		if (!session?.spaceId) return { rerun: false };
		if (
			!["STOPPED", "PROCESSING", "FAILED", "READY"].includes(session.status)
		) {
			return { rerun: false };
		}
		const spaceId = session.spaceId;

		// Jobs are deduped per track, so only this run may hold this track. A
		// PROCESSING track here was claimed by a run whose worker died - take
		// it over instead of skipping it forever.
		const claim = await prisma.participantRecording.updateMany({
			where: {
				id: recordingId,
				status: { in: ["UPLOADED", "PROCESSING"] },
				participantId: { not: null },
			},
			data: { status: "PROCESSING" },
		});
		if (claim.count !== 1) return { rerun: false };

		// Only flip to PROCESSING on the very first track (session still
		// STOPPED); later tracks must not downgrade a READY session and flicker
		// the UI.
		await prisma.recordingSession
			.updateMany({
				where: { id: recordingSessionId, status: "STOPPED" },
				data: { status: "PROCESSING" },
			})
			.catch(() => undefined);

		const rec = await prisma.participantRecording.findUnique({
			where: { id: recordingId },
			include: { segments: { orderBy: { sequenceNumber: "asc" } } },
		});
		if (!rec?.participantId) return { rerun: false };
		const participantId = rec.participantId;
		const segmentsAtClaim = rec.segments.length;

		tmp = await mkdtemp(path.join(tmpdir(), "openside-finalize-"));

		if (rec.container === "pcm") {
			// The parallel raw-PCM mic track becomes a lossless WAV back-linked to
			// the participant's video output. It handles its own errors (a PCM
			// failure never creates a phantom failed audio output).
			await finalizePcmRecording({
				rec: { ...rec, participantId },
				spaceId,
				recordingSessionId,
				tmpDir: tmp,
			});
		} else {
			const watermark = await sessionNeedsWatermark({
				spaceId,
				userId: null,
				selfHosted: session.selfHosted,
			});
			try {
				await finalizeRecording({
					rec: { ...rec, participantId },
					spaceId,
					recordingSessionId,
					tmpDir: tmp,
					watermark,
					targetFps: clampFps(session.targetFps),
				});
			} catch (error) {
				// Storage trouble: keep the track PROCESSING and let the job retry
				// (the next attempt takes the claim over).
				if (error instanceof TransientFinalizeError) throw error;
				console.error(`[Finalize] recording ${rec.id} failed:`, error);
				await failTrack({
					rec: { ...rec, participantId },
					spaceId,
					recordingSessionId,
					message: errorMessage(error),
				});
			}
		}

		// A finished run must never leave its track PROCESSING.
		const leftover = await prisma.participantRecording.findUnique({
			where: { id: recordingId },
			select: { status: true },
		});
		if (leftover?.status === "PROCESSING") {
			await failTrack({
				rec: { ...rec, participantId },
				spaceId,
				recordingSessionId,
				message: "Finalization ended without a result.",
			});
		}

		// Chunks that registered while we were encoding (a slow uplink's tail)
		// aren't in this master - re-open the track for one more pass.
		const segmentsNow = await prisma.recordingSegment.count({
			where: { participantRecordingId: recordingId },
		});
		if (segmentsNow > segmentsAtClaim) {
			const reopened = await prisma.participantRecording.updateMany({
				where: { id: recordingId, status: { in: ["READY", "FAILED"] } },
				data: { status: "UPLOADED" },
			});
			rerun = reopened.count === 1;
		}

		await settleSessionStatus(recordingSessionId, spaceId);
	} finally {
		inFlight.delete(key);
		if (tmp) {
			await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
		}
	}

	if (rerun && !isQueueConfigured()) {
		await requestTrackFinalize(recordingSessionId, recordingId, {
			delayMs: LATE_CHUNK_RERUN_DELAY_MS,
		});
	}
	return { rerun };
}

/**
 * Session-level job (from before per-track jobs, or an explicit kick): fan out
 * to per-track jobs and settle. Never encodes itself, so it can't race a
 * track job over the same track.
 */
export async function finalizeSession(
	recordingSessionId: string,
): Promise<void> {
	await maybeFinalizeSession(recordingSessionId);
}

/**
 * A run that failed. If the track already had a good master (this was a
 * re-run for late chunks), keep it READY with the old output rather than
 * replacing a working recording with a failure.
 */
async function failTrack(args: {
	rec: FinalizeRecordingArgs["rec"];
	spaceId: string;
	recordingSessionId: string;
	message: string;
}): Promise<void> {
	const { rec, message } = args;
	const note = message.slice(0, 2000);
	if (rec.mergedFileKey) {
		await prisma.participantRecording
			.update({
				where: { id: rec.id },
				data: { status: "READY", processingError: `Re-run failed: ${note}` },
			})
			.catch(() => undefined);
		return;
	}
	await prisma.participantRecording
		.update({
			where: { id: rec.id },
			data: { status: "FAILED", processingError: note },
		})
		.catch(() => undefined);
	if (rec.container !== "pcm") {
		await upsertFailedParticipantOutput({
			recordingSessionId: args.recordingSessionId,
			spaceId: args.spaceId,
			rec,
			errorMessage: note,
		}).catch(() => undefined);
	}
}

interface FinalizeRecordingArgs {
	rec: {
		id: string;
		participantId: string;
		type: "AUDIO" | "VIDEO";
		hasVideo: boolean;
		hasAudio: boolean;
		isScreenShare: boolean;
		container: string | null;
		width: number | null;
		height: number | null;
		fps: number | null;
		bitrate: number | null;
		sampleRate: number | null;
		channels: number | null;
		startOffsetMs: number | null;
		expectedSegments: number | null;
		// The previous run's master, when this run rebuilds an existing track.
		mergedFileKey: string | null;
		// Set if an early poster was already extracted from the first chunk; reused
		// here so we don't re-extract at finalize time.
		thumbnailKey: string | null;
		segments: {
			sequenceNumber: number;
			assetKey: string;
			startMs: number;
			durationMs: number;
		}[];
	};
	spaceId: string;
	recordingSessionId: string;
	tmpDir: string;
	/** Burn the DEMO watermark into the master (owner entitlement, not client). */
	watermark: boolean;
	/** Constant frame rate to normalize every video master to (session-level). */
	targetFps: AllowedFps;
}

async function upsertFailedParticipantOutput(args: {
	recordingSessionId: string;
	spaceId: string;
	rec: FinalizeRecordingArgs["rec"];
	errorMessage: string;
}): Promise<void> {
	const { recordingSessionId, spaceId, rec } = args;
	const outputData = {
		recordingSessionId,
		spaceId,
		type: "PER_PARTICIPANT" as const,
		mode: rec.hasVideo ? ("MIXED" as const) : ("AUDIO_ONLY" as const),
		targetParticipantId: rec.participantId,
		sourceRecordingId: rec.id,
		width: rec.width,
		height: rec.height,
		fps: rec.fps,
		bitrate: rec.bitrate,
		sampleRate: rec.sampleRate,
		channels: rec.channels,
		hasVideo: rec.hasVideo,
		hasAudio: rec.hasAudio,
		masterKey: null,
		mimeType: "video/webm",
		durationMs: null,
		fileSize: null,
		status: "FAILED" as const,
		variant: "RAW" as const,
		errorMessage: args.errorMessage.slice(0, 2000),
	};

	const existingOutput = await prisma.finalOutput.findFirst({
		where: { sourceRecordingId: rec.id, variant: "RAW" },
		select: { id: true },
	});

	if (existingOutput) {
		await prisma.finalOutput.update({
			where: { id: existingOutput.id },
			data: outputData,
		});
	} else {
		await prisma.finalOutput.create({ data: outputData });
	}
}

/**
 * Bottom-right "openside.pro" badge burned into DEMO masters only. Fixed
 * fontsize is fine - DEMO capture is capped at 1080p by entitlements. We point
 * drawtext at a bundled font so it renders on the deploy image (which has no
 * system fonts); if the font can't be located we fall back to a fontconfig
 * lookup (works in dev), and if drawtext fails entirely the encode degrades to
 * an un-watermarked master rather than losing the recording.
 */
const WATERMARK_FONT_ARG = watermarkFontPath
	? `fontfile=${escapeFilterPath(watermarkFontPath)}:`
	: "";
// Large, bold, outlined + boxed so it's prominent and not trivially cropped out.
const WATERMARK_FILTER = `drawtext=${WATERMARK_FONT_ARG}text='openside.pro':x=w-tw-28:y=h-th-24:fontsize=44:fontcolor=white:borderw=2:bordercolor=black@0.6:box=1:boxcolor=black@0.45:boxborderw=16`;

/** Every file derived from a master or aligned key (cached download formats). */
function derivedSiblings(key: string): string[] {
	if (!/\.[a-z0-9]+$/i.test(key)) return [];
	return ["mp4", "webm", "mp3", "wav"].map((ext) =>
		key.replace(/\.[a-z0-9]+$/i, `.${ext}`),
	);
}

/**
 * A re-run replaces the master in place, so cached download formats made from
 * the OLD master must go - otherwise downloads keep serving the stale file.
 */
async function invalidateDerivedFiles(
	previousKeys: (string | null | undefined)[],
	keep: (string | null | undefined)[],
): Promise<void> {
	const keepSet = new Set(keep.filter((key): key is string => !!key));
	const stale = new Set<string>();
	for (const key of previousKeys) {
		if (!key) continue;
		if (!keepSet.has(key)) stale.add(key);
		for (const sibling of derivedSiblings(key)) {
			if (!keepSet.has(sibling)) stale.add(sibling);
		}
	}
	if (stale.size === 0) return;
	await deleteObjects([...stale]).catch((error) =>
		console.error(
			"[Finalize] failed to invalidate stale derived files:",
			error,
		),
	);
}

/**
 * Download a track's chunks to disk in order, starting a new part at every
 * chunk that opens a fresh container stream (each recorder restart).
 */
async function downloadParts(
	rec: FinalizeRecordingArgs["rec"],
	ordered: FinalizeRecordingArgs["rec"]["segments"],
	tmpDir: string,
): Promise<{ parts: { rawPath: string; startMs: number }[]; missing: number }> {
	const parts: { rawPath: string; startMs: number }[] = [];
	let current: { rawPath: string; startMs: number } | null = null;
	let missing = 0;
	for (const seg of ordered) {
		const buf = await downloadChunk(seg.assetKey);
		if (!buf) {
			missing++;
			continue;
		}
		if (!current || startsContainer(buf)) {
			current = {
				rawPath: path.join(tmpDir, `${rec.id}-raw-${parts.length}.bin`),
				startMs: seg.startMs,
			};
			parts.push(current);
			await writeFile(current.rawPath, Buffer.alloc(0));
		}
		await appendFile(current.rawPath, buf);
	}
	return { parts, missing };
}

async function finalizeRecording({
	rec,
	spaceId,
	recordingSessionId,
	tmpDir,
	watermark,
	targetFps,
}: FinalizeRecordingArgs): Promise<void> {
	if (rec.segments.length === 0) {
		// The client can mark a recording "complete" with 0 segments if its very
		// last chunk (often its only chunk, for a take under 5s) was still being
		// persisted when it checked whether its upload queue had drained. Give
		// that straggler a few seconds to actually land before condemning the
		// track - re-checking straight from the DB rather than trusting the
		// (possibly stale) `rec.segments` this finalize pass was claimed with.
		const lateSegments = await waitForLateSegments(rec.id, () =>
			prisma.recordingSegment.findMany({
				where: { participantRecordingId: rec.id },
				select: {
					sequenceNumber: true,
					assetKey: true,
					startMs: true,
					durationMs: true,
				},
				orderBy: { sequenceNumber: "asc" },
			}),
		);
		if (lateSegments.length === 0) {
			throw new Error("No segments uploaded");
		}
		rec = { ...rec, segments: lateSegments };
	}

	await prisma.participantRecording.update({
		where: { id: rec.id },
		data: { status: "PROCESSING", processingError: null },
	});

	const kind = recordingTrackKind(rec);
	const ordered = [...rec.segments].sort(
		(a, b) => a.sequenceNumber - b.sequenceNumber,
	);
	// Salvage rather than fail: build from whatever arrived. A missing chunk
	// costs a brief glitch, never the whole track.
	const gapNote = describeSegmentGaps(
		findSegmentGaps(ordered, rec.expectedSegments),
	);
	if (gapNote) {
		console.warn(
			`[Finalize] ${rec.id}: ${gapNote} - salvaging available footage`,
		);
	}

	// 1. Chunks → parts on disk (never the whole recording in memory).
	const { parts, missing } = await downloadParts(rec, ordered, tmpDir);
	if (parts.length === 0) throw new Error("No chunk objects could be read");
	// A re-run must only ever improve the master. With chunks gone (cleaned up
	// by an older build) it would rebuild from a fraction of them - keep the
	// existing master instead.
	if (rec.mergedFileKey && missing > 0) {
		throw new Error(
			`${missing} chunk object(s) are gone; keeping the existing master`,
		);
	}
	const timelineOriginMs = parts[0]?.startMs ?? 0;

	// 2. Lay the parts out on the track's timeline and encode one CFR master
	// (H.264/AAC; audio-only tracks → Opus/WebM). A raw MediaRecorder stream is
	// VFR, which drifts lip-sync and misaligns participants, and a shared screen
	// RESIZES mid-capture - every frame is pinned to one geometry. DEMO masters
	// burn the watermark into the same pass.
	const sizeHint =
		rec.width && rec.height && rec.width > 1 && rec.height > 1
			? { width: rec.width, height: rec.height }
			: null;
	const compose = (withWatermark: boolean) =>
		composeTimeline({
			parts,
			tmpDir,
			id: rec.id,
			fps: targetFps,
			crf: withWatermark ? WATERMARKED_MASTER_CRF : MASTER_CRF,
			extraFilters: withWatermark ? [WATERMARK_FILTER] : [],
			sizeHint,
		});

	let master: ComposedMaster | null = null;
	const notes: string[] = [];
	try {
		master = await compose(watermark);
	} catch (error) {
		console.error(`[Finalize] ${rec.id}: master encode failed:`, error);
		if (watermark) {
			// drawtext missing in a stripped build: an un-watermarked master
			// beats losing the recording.
			try {
				master = await compose(false);
			} catch (retryError) {
				console.error(
					`[Finalize] ${rec.id}: master encode failed without watermark too:`,
					retryError,
				);
			}
		}
	}

	if (missing > 0) {
		notes.push(`${missing} chunk object(s) were missing from storage`);
	}
	if (master?.skippedParts) {
		notes.push(
			`${master.skippedParts} recorder part(s) could not be decoded and were filled with black/silence`,
		);
	}

	let masterPath: string;
	let outExt: "mp4" | "webm";
	let hasVideo = rec.hasVideo;
	let hasAudio = rec.hasAudio;
	let durationMs = ordered.reduce((sum, seg) => sum + (seg.durationMs || 0), 0);
	let geometry: { width: number; height: number } | null = null;

	if (master) {
		masterPath = master.path;
		outExt = master.ext;
		hasVideo = master.hasVideo;
		hasAudio = master.hasAudio;
		durationMs = master.durationMs || durationMs;
		geometry = master.target;
	} else {
		// Encoding failed outright (odd container, etc.) - never lose the
		// recording: remux the first part to WebM, or keep its raw bytes.
		const firstPart = parts[0];
		if (!firstPart) throw new Error("No recorder part to salvage");
		if (parts.length > 1) {
			notes.push(`only the first of ${parts.length} recorder parts was kept`);
		}
		outExt = "webm";
		masterPath = path.join(tmpDir, `${rec.id}-fallback.webm`);
		try {
			await runFfmpeg([
				"-y",
				"-fflags",
				"+genpts",
				"-i",
				firstPart.rawPath,
				"-c",
				"copy",
				masterPath,
			]);
		} catch (error) {
			console.error(
				`[Finalize] remux failed for ${rec.id}, using raw concat:`,
				error,
			);
			masterPath = firstPart.rawPath;
		}
	}

	// 3. Upload the master with the format we actually produced.
	const key = masterKey(
		spaceId,
		recordingSessionId,
		rec.participantId,
		kind,
		outExt,
	);
	await putFileObject(key, masterPath, masterContentType(outExt));
	const masterMime = masterContentType(outExt);
	const fileStat = await stat(masterPath);

	// 3b. Thumbnail (video tracks only). Always replace any early poster with a
	// high-quality image from the completed master. If extraction fails, retain
	// the early thumbnail so cards still have an image to show.
	const generatedThumbKey = hasVideo
		? await generateThumbnail(
				masterPath,
				spaceId,
				recordingSessionId,
				rec.participantId,
				kind,
				tmpDir,
			)
		: null;
	const thumbKey = generatedThumbKey ?? rec.thumbnailKey ?? null;

	// 4. Aligned ("with space") variant for a track that started after the
	// session: black lead-in so it lines up with everyone else's. t=0 of the
	// master is the first part's start, which sits this far into the session.
	const alignedGapMs = Math.max(0, (rec.startOffsetMs ?? 0) + timelineOriginMs);
	let alignedKeyWritten: string | null = null;
	let alignedFailure: string | null = null;
	let alignedStat: { size: number } | null = null;
	if (hasVideo && alignedGapMs >= ALIGNED_MIN_OFFSET_MS) {
		const alignedPath = path.join(tmpDir, `${rec.id}-aligned.mp4`);
		try {
			if (master?.timeline && outExt === "mp4") {
				// The master is our own normalized encode, so a matching black
				// lead-in joins its video with a stream copy - no second full
				// encode - and its audio timeline is shifted sample-exactly.
				await composeAlignedMaster({
					master,
					leadMs: alignedGapMs,
					tmpDir,
					id: rec.id,
					output: alignedPath,
				});
			} else {
				await createAlignedVideo({
					inputPath: masterPath,
					outputPath: alignedPath,
					gapMs: alignedGapMs,
					width: geometry?.width ?? rec.width,
					height: geometry?.height ?? rec.height,
					fps: targetFps,
					hasAudio,
				});
			}
			alignedKeyWritten = alignedKey(
				spaceId,
				recordingSessionId,
				rec.participantId,
				kind,
				"mp4",
			);
			await putFileObject(
				alignedKeyWritten,
				alignedPath,
				masterContentType("mp4"),
			);
			alignedStat = await stat(alignedPath);
		} catch (error) {
			console.error(`[Finalize] aligned output failed for ${rec.id}:`, error);
			alignedFailure = errorMessage(error).slice(0, 2000);
			alignedKeyWritten = null;
		}
	}

	// Cached downloads made from the previous master are stale now.
	if (rec.mergedFileKey) {
		await invalidateDerivedFiles(
			[
				rec.mergedFileKey,
				alignedKey(spaceId, recordingSessionId, rec.participantId, kind, "mp4"),
			],
			[key, alignedKeyWritten],
		);
	}

	const processingError =
		[gapNote, ...notes].filter((note): note is string => !!note).join("; ") ||
		null;

	// 5. Mark the recording ready + create a downloadable FinalOutput. If we
	// salvaged over gaps, keep it READY but record the note so it's diagnosable.
	await prisma.participantRecording.update({
		where: { id: rec.id },
		data: {
			status: "READY",
			mergedFileKey: key,
			thumbnailKey: thumbKey,
			fileSize: BigInt(fileStat.size),
			durationMs,
			mimeType: masterMime,
			// What the master ACTUALLY contains (a camera track recorded with the
			// camera off the whole time is audio-only).
			hasVideo,
			hasAudio,
			// The master's REAL geometry (the client's start-of-capture snapshot
			// is stale once a shared surface resizes).
			...(geometry ? { width: geometry.width, height: geometry.height } : {}),
			processingError,
		},
	});

	const outputData = {
		recordingSessionId,
		spaceId,
		type: "PER_PARTICIPANT" as const,
		mode: hasVideo ? ("MIXED" as const) : ("AUDIO_ONLY" as const),
		targetParticipantId: rec.participantId,
		sourceRecordingId: rec.id,
		width: geometry ? geometry.width : rec.width,
		height: geometry ? geometry.height : rec.height,
		fps: master && hasVideo ? targetFps : rec.fps,
		bitrate: rec.bitrate,
		sampleRate: rec.sampleRate,
		channels: rec.channels,
		hasVideo,
		hasAudio,
		masterKey: key,
		thumbnailKey: thumbKey,
		mimeType: masterMime,
		durationMs,
		fileSize: BigInt(fileStat.size),
		status: "READY" as const,
		variant: "RAW" as const,
		errorMessage: null,
	};

	const existingOutput = await prisma.finalOutput.findFirst({
		where: { sourceRecordingId: rec.id, variant: "RAW" },
		select: { id: true },
	});

	if (existingOutput) {
		await prisma.finalOutput.update({
			where: { id: existingOutput.id },
			data: outputData,
		});
	} else {
		await prisma.finalOutput.create({ data: outputData });
	}

	if (alignedKeyWritten || alignedFailure) {
		const alignedOutputData = alignedKeyWritten
			? {
					...outputData,
					masterKey: alignedKeyWritten,
					mimeType: masterContentType("mp4"),
					durationMs: durationMs + alignedGapMs,
					fileSize: BigInt(alignedStat?.size ?? 0),
					variant: "ALIGNED" as const,
				}
			: {
					...outputData,
					masterKey: null,
					durationMs: null,
					fileSize: null,
					status: "FAILED" as const,
					variant: "ALIGNED" as const,
					errorMessage: alignedFailure,
				};

		const existingAlignedOutput = await prisma.finalOutput.findFirst({
			where: { sourceRecordingId: rec.id, variant: "ALIGNED" },
			select: { id: true },
		});

		if (existingAlignedOutput) {
			await prisma.finalOutput.update({
				where: { id: existingAlignedOutput.id },
				data: alignedOutputData,
			});
		} else {
			await prisma.finalOutput.create({ data: alignedOutputData });
		}
	}

	// Order-independent back-link: if this participant's parallel PCM track has
	// already produced a WAV, attach it to the output(s) we just wrote. If PCM
	// hasn't finalized yet, this is a no-op and finalizePcmRecording performs the
	// link when it runs. Camera tracks only - screen shares have no mic PCM.
	if (!rec.isScreenShare) {
		await linkPcmWavToVideoOutput({
			recordingSessionId,
			spaceId,
			participantId: rec.participantId,
		}).catch((error) =>
			console.error(
				`[Finalize] PCM WAV back-link failed for ${rec.id} (master is safe):`,
				error,
			),
		);
	}

	// Raw chunk objects are NOT deleted here: a straggler chunk may still
	// arrive and rebuild a fuller master. The recovery sweep removes them once
	// the track has been quiet for a day.
}

interface FinalizePcmArgs {
	rec: {
		id: string;
		participantId: string;
		sampleRate: number | null;
		channels: number | null;
		expectedSegments: number | null;
		mergedFileKey: string | null;
		segments: {
			sequenceNumber: number;
			assetKey: string;
			startMs: number;
			durationMs: number;
			sampleRate: number | null;
			bitDepth: number | null;
			channelCount: number | null;
		}[];
	};
	spaceId: string;
	recordingSessionId: string;
	tmpDir: string;
}

/**
 * Canonical 44-byte PCM WAV header. Used only on the manual-header fallback path
 * (if this ffmpeg build can't mux s24le). bitsPerSample=24 is written faithfully
 * so the packed 3-bytes/sample data is interpreted correctly.
 */
function buildWavHeader(params: {
	sampleRate: number;
	channelCount: number;
	bitDepth: number;
	dataSize: number;
}): Buffer {
	const { sampleRate, channelCount, bitDepth, dataSize } = params;
	const blockAlign = channelCount * (bitDepth / 8);
	const byteRate = sampleRate * blockAlign;
	const buf = Buffer.alloc(44);
	buf.write("RIFF", 0);
	buf.writeUInt32LE(36 + dataSize, 4);
	buf.write("WAVE", 8);
	buf.write("fmt ", 12);
	buf.writeUInt32LE(16, 16); // PCM fmt chunk size
	buf.writeUInt16LE(1, 20); // audio format = 1 (integer PCM)
	buf.writeUInt16LE(channelCount, 22);
	buf.writeUInt32LE(sampleRate, 24);
	buf.writeUInt32LE(byteRate, 28);
	buf.writeUInt16LE(blockAlign, 32);
	buf.writeUInt16LE(bitDepth, 34);
	buf.write("data", 36);
	buf.writeUInt32LE(dataSize, 40);
	return buf;
}

/**
 * Manual WAV writer: prepend a hand-built header to the raw PCM and stream the
 * body through (never loads the whole recording into memory). The fallback for
 * when ffmpeg can't handle s24le on this platform.
 */
async function writeWavWithManualHeader(
	rawPath: string,
	wavPath: string,
	fmt: { sampleRate: number; channelCount: number; bitDepth: number },
): Promise<void> {
	const dataSize = (await stat(rawPath)).size;
	const header = buildWavHeader({ ...fmt, dataSize });
	await new Promise<void>((resolve, reject) => {
		const out = createWriteStream(wavPath);
		out.on("error", reject);
		out.on("finish", resolve);
		out.write(header);
		const input = createReadStream(rawPath);
		input.on("error", reject);
		input.on("end", () => out.end());
		input.pipe(out, { end: false });
	});
}

/**
 * Attach a participant's finalized lossless WAV to their video output(s). For
 * PCM-only sessions, create an AUDIO_ONLY output whose WAV is the master; this
 * keeps both WAV and derived MP3 downloads available without any video track.
 */
async function linkPcmWavToVideoOutput(args: {
	recordingSessionId: string;
	spaceId: string;
	participantId: string;
}): Promise<void> {
	const { recordingSessionId, participantId } = args;

	const pcm = await prisma.participantRecording.findFirst({
		where: {
			recordingSessionId,
			participantId,
			container: "pcm",
			mergedFileKey: { not: null },
		},
		select: { mergedFileKey: true },
	});
	if (!pcm?.mergedFileKey) return; // PCM not finalized yet - link happens later

	const session = await prisma.recordingSession.findUnique({
		where: { id: recordingSessionId },
		select: { recordingMode: true },
	});
	if (session?.recordingMode === "AUDIO_ONLY") {
		const pcmRecording = await prisma.participantRecording.findFirst({
			where: {
				recordingSessionId,
				participantId,
				container: "pcm",
			},
			select: {
				id: true,
				sampleRate: true,
				channels: true,
				durationMs: true,
				fileSize: true,
			},
		});
		if (!pcmRecording) return;

		const outputData = {
			recordingSessionId,
			spaceId: args.spaceId,
			type: "PER_PARTICIPANT" as const,
			mode: "AUDIO_ONLY" as const,
			variant: "RAW" as const,
			targetParticipantId: participantId,
			sourceRecordingId: pcmRecording.id,
			sampleRate: pcmRecording.sampleRate,
			channels: pcmRecording.channels,
			hasVideo: false,
			hasAudio: true,
			masterKey: pcm.mergedFileKey,
			audioWavKey: pcm.mergedFileKey,
			mimeType: "audio/wav",
			durationMs: pcmRecording.durationMs,
			fileSize: pcmRecording.fileSize,
			status: "READY" as const,
			errorMessage: null,
		};
		const existing = await prisma.finalOutput.findFirst({
			where: { sourceRecordingId: pcmRecording.id, variant: "RAW" },
			select: { id: true },
		});
		if (existing) {
			await prisma.finalOutput.update({
				where: { id: existing.id },
				data: outputData,
			});
		} else {
			await prisma.finalOutput.create({ data: outputData });
		}
		return;
	}

	// The participant's camera track - even one recorded with the camera off
	// the whole time (an audio-only master still gets the lossless WAV).
	const videoRecordings = await prisma.participantRecording.findMany({
		where: {
			recordingSessionId,
			participantId,
			isScreenShare: false,
			OR: [{ container: null }, { container: { not: "pcm" } }],
		},
		select: { id: true },
	});
	if (videoRecordings.length === 0) return; // video output not ready yet

	await prisma.finalOutput.updateMany({
		where: {
			recordingSessionId,
			sourceRecordingId: { in: videoRecordings.map((r) => r.id) },
		},
		data: { audioWavKey: pcm.mergedFileKey },
	});
}

/** Convert a raw s24le chunk to another rate/channel layout (rare: a later tab
 *  got a different AudioContext rate). */
async function convertPcm(
	buffer: Buffer,
	from: PcmFormat,
	to: PcmFormat,
	tmpDir: string,
): Promise<Buffer> {
	const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const inPath = path.join(tmpDir, `pcm-convert-${stamp}.in.raw`);
	const outPath = path.join(tmpDir, `pcm-convert-${stamp}.out.raw`);
	await writeFile(inPath, buffer);
	await runFfmpeg([
		"-y",
		"-f",
		"s24le",
		"-ar",
		String(from.sampleRate),
		"-ac",
		String(from.channelCount),
		"-i",
		inPath,
		"-f",
		"s24le",
		"-ar",
		String(to.sampleRate),
		"-ac",
		String(to.channelCount),
		outPath,
	]);
	const converted = await readFile(outPath);
	await rm(inPath, { force: true }).catch(() => undefined);
	await rm(outPath, { force: true }).catch(() => undefined);
	return converted;
}

/**
 * Where the participant's video master starts on the shared chunk timeline:
 * the first chunk of their camera track. The WAV is padded to start there too,
 * so it drops into an editor in sync with the video (the PCM capture opens its
 * own mic and starts a few hundred ms after the video recorder).
 */
async function cameraTimelineOrigin(
	recordingSessionId: string,
	participantId: string,
): Promise<number | null> {
	const first = await prisma.recordingSegment.findFirst({
		where: {
			participantRecording: {
				recordingSessionId,
				participantId,
				isScreenShare: false,
				OR: [{ container: null }, { container: { not: "pcm" } }],
			},
		},
		orderBy: { startMs: "asc" },
		select: { startMs: true },
	});
	return first?.startMs ?? null;
}

/** Cap on the lead-in pad: beyond this the timestamps are wrong, not late. */
const MAX_PCM_LEAD_PAD_MS = 10_000;

/**
 * Wrap a participant's raw-PCM mic segments into a lossless WAV master.
 *
 * Places the headerless 24-bit-LE PCM chunks on the track's timeline (gaps
 * become silence), aligns the start with the video master, then muxes a real
 * WAV with `ffmpeg -f s24le -c:a copy` using the stored capture format. Falls
 * back to a hand-written 44-byte header if this ffmpeg build can't handle
 * s24le. Produces NO FinalOutput of its own - it sets an audioWavKey on the
 * participant's video output instead. Never throws: PCM is a best-effort
 * enhancement over the master's lossy audio, so its failure must not fail the
 * session.
 */
async function finalizePcmRecording({
	rec,
	spaceId,
	recordingSessionId,
	tmpDir,
}: FinalizePcmArgs): Promise<void> {
	try {
		if (rec.segments.length === 0) {
			throw new Error("No PCM segments uploaded");
		}

		await prisma.participantRecording.update({
			where: { id: rec.id },
			data: { status: "PROCESSING", processingError: null },
		});

		const ordered = [...rec.segments].sort(
			(a, b) => a.sequenceNumber - b.sequenceNumber,
		);
		const gapNote = describeSegmentGaps(
			findSegmentGaps(ordered, rec.expectedSegments),
		);
		if (gapNote) {
			console.warn(
				`[Finalize] PCM ${rec.id}: ${gapNote} - missing audio becomes silence`,
			);
		}

		// Format comes from the captured chunks (hardware may have ignored the
		// requested 48000), falling back to the recording metadata then defaults.
		const formatOf = (seg: (typeof ordered)[number]): PcmFormat => ({
			sampleRate: seg.sampleRate ?? rec.sampleRate ?? 48000,
			channelCount: seg.channelCount ?? rec.channels ?? 1,
			bitDepth: seg.bitDepth ?? 24,
		});

		const videoOrigin = await cameraTimelineOrigin(
			recordingSessionId,
			rec.participantId,
		);

		const rawPath = path.join(tmpDir, `${rec.id}-raw.pcm`);
		const wavPath = path.join(tmpDir, `${rec.id}-out.wav`);

		// Each run of continuous capture at its measured position, its sample
		// clock fitted to the system clock the video runs on (streamed to disk):
		// a lost chunk or a suspended context becomes silence, and an hour-long
		// take ends as in sync as it started.
		let missingChunks = 0;
		const format = await composePcmTimeline({
			segments: ordered.map((seg) => ({
				sequenceNumber: seg.sequenceNumber,
				startMs: seg.startMs,
				format: formatOf(seg),
				load: async () => {
					const buffer = await downloadChunk(seg.assetKey);
					if (!buffer) missingChunks++;
					return buffer;
				},
			})),
			outPath: rawPath,
			tmpDir,
			originMs: videoOrigin,
			maxLeadPadMs: MAX_PCM_LEAD_PAD_MS,
			convert: (buffer, from, to) => convertPcm(buffer, from, to, tmpDir),
		});
		const { leadPadMs } = format;
		// A re-run must only ever improve the WAV - never rebuild it from a
		// fraction of its chunks.
		if (rec.mergedFileKey && missingChunks > 0) {
			throw new Error(
				`${missingChunks} PCM chunk object(s) are gone; keeping the existing WAV`,
			);
		}
		const { sampleRate, channelCount, bitDepth } = format;

		// s24le = signed 24-bit LE, matching our 3-bytes/sample packing. Verify at
		// runtime and fall back to a hand-written header if the binary differs.
		let wroteWav = false;
		try {
			await runFfmpeg([
				"-y",
				"-f",
				"s24le",
				"-ar",
				String(sampleRate),
				"-ac",
				String(channelCount),
				"-i",
				rawPath,
				"-c:a",
				"copy",
				wavPath,
			]);
			wroteWav = true;
		} catch (error) {
			console.error(
				`[Finalize] PCM ${rec.id}: ffmpeg s24le mux failed, writing WAV header by hand:`,
				error,
			);
		}
		if (!wroteWav) {
			await writeWavWithManualHeader(rawPath, wavPath, {
				sampleRate,
				channelCount,
				bitDepth,
			});
		}

		const wavKey = audioWavKey(spaceId, recordingSessionId, rec.participantId);
		await putFileObject(wavKey, wavPath, "audio/wav");
		// A rebuilt WAV makes the MP3 cached from the old one stale.
		if (rec.mergedFileKey) {
			await invalidateDerivedFiles([rec.mergedFileKey], [wavKey]);
		}

		const fileStat = await stat(wavPath);
		const frameBytes = (bitDepth / 8) * channelCount;
		const durationMs = Math.round(
			(format.bytes / frameBytes / sampleRate) * 1000,
		);

		await prisma.participantRecording.update({
			where: { id: rec.id },
			data: {
				status: "READY",
				mergedFileKey: wavKey,
				fileSize: BigInt(fileStat.size),
				durationMs,
				mimeType: "audio/wav",
				processingError: gapNote,
			},
		});

		console.log(
			`[Finalize] PCM ${rec.id}: wrote lossless WAV ${wavKey} (${sampleRate}Hz / 24-bit / ${channelCount}ch, lead ${Math.round(leadPadMs)}ms, ${format.runs} run(s), drift corrected ${format.correctedMs}ms)`,
		);

		// Back-link to the participant's video output (order-independent).
		await linkPcmWavToVideoOutput({
			recordingSessionId,
			spaceId,
			participantId: rec.participantId,
		});

		// Raw chunks are kept for a day (see the recovery sweep's cleanup) so a
		// straggler can still rebuild a fuller WAV.
	} catch (error) {
		if (error instanceof TransientFinalizeError) throw error;
		// Best-effort: never fail the session over the lossless-audio
		// enhancement, and never replace a WAV that already worked.
		console.error(`[Finalize] PCM ${rec.id} failed:`, error);
		const message = errorMessage(error).slice(0, 2000);
		await prisma.participantRecording
			.update({
				where: { id: rec.id },
				data: rec.mergedFileKey
					? { status: "READY", processingError: `Re-run failed: ${message}` }
					: { status: "FAILED", processingError: message },
			})
			.catch(() => undefined);
	}
}

async function createAlignedVideo({
	inputPath,
	outputPath,
	gapMs,
	width,
	height,
	fps,
	hasAudio,
}: {
	inputPath: string;
	outputPath: string;
	gapMs: number;
	width: number | null;
	height: number | null;
	fps: number | null;
	hasAudio: boolean;
}): Promise<void> {
	const safeWidth = width && width > 0 ? width : 1280;
	const safeHeight = height && height > 0 ? height : 720;
	// `fps` is the session's CFR target (24/30). The black lead-in is generated at
	// this rate and the real segment is resampled to it, so the concatenated
	// output is constant frame rate - matching the plain master exactly.
	const safeFps = fps && fps >= 10 ? Math.round(fps) : DEFAULT_FPS;
	const gapSeconds = Math.max(0.001, gapMs / 1000);

	// CFR H.264/MP4 output, same target as the plain master. yuv420p + faststart
	// for broad player compatibility; aac audio (opus isn't standard in MP4).
	const videoOut = [
		"-fps_mode",
		"cfr",
		"-r",
		String(safeFps),
		"-c:v",
		"libx264",
		"-preset",
		"medium",
		"-crf",
		"18",
		"-pix_fmt",
		"yuv420p",
		"-movflags",
		"+faststart",
	];

	if (!hasAudio) {
		await runFfmpeg([
			"-y",
			"-f",
			"lavfi",
			"-t",
			String(gapSeconds),
			"-i",
			`color=c=black:s=${safeWidth}x${safeHeight}:r=${safeFps}`,
			"-i",
			inputPath,
			"-filter_complex",
			`[0:v]setpts=PTS-STARTPTS[v0];[1:v]scale=${safeWidth}:${safeHeight}:force_original_aspect_ratio=decrease,pad=${safeWidth}:${safeHeight}:(ow-iw)/2:(oh-ih)/2,fps=${safeFps},setpts=PTS-STARTPTS[v1];[v0][v1]concat=n=2:v=1:a=0[v]`,
			"-map",
			"[v]",
			...videoOut,
			outputPath,
		]);
		return;
	}

	await runFfmpeg([
		"-y",
		"-f",
		"lavfi",
		"-t",
		String(gapSeconds),
		"-i",
		`color=c=black:s=${safeWidth}x${safeHeight}:r=${safeFps}`,
		"-f",
		"lavfi",
		"-t",
		String(gapSeconds),
		"-i",
		"anullsrc=channel_layout=stereo:sample_rate=48000",
		"-i",
		inputPath,
		"-filter_complex",
		`[0:v]setpts=PTS-STARTPTS[v0];[1:a]asetpts=PTS-STARTPTS[a0];[2:v]scale=${safeWidth}:${safeHeight}:force_original_aspect_ratio=decrease,pad=${safeWidth}:${safeHeight}:(ow-iw)/2:(oh-ih)/2,fps=${safeFps},setpts=PTS-STARTPTS[v1];[2:a]aresample=48000,asetpts=PTS-STARTPTS[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]`,
		"-map",
		"[v]",
		"-map",
		"[a]",
		...videoOut,
		"-c:a",
		"aac",
		"-b:a",
		"192k",
		outputPath,
	]);
}
