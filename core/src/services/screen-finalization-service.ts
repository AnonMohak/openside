/**
 * Screen-recorder finalization.
 *
 * When a SCREEN_RECORDER session has stopped and all of its track recordings
 * finished uploading, we stitch each track's chunks into a master file and
 * register the result keys on the session's `outputs`:
 *   - screen : the `combined` track (screen video + mic audio), if any
 *   - camera : the `camera` track (webcam video), if any
 *   - both   : screen with the camera composited as a bottom-right PiP, matching
 *              the size/shape/corner the user picked (stored in `composition`)
 *
 * Chunk stitching mirrors the Space finalizer: MediaRecorder timeslices are
 * byte-fragments of one stream, so concatenating them in order reconstructs the
 * capture. Video masters are then re-encoded to CFR H.264/MP4 - the client's
 * codec ladder is H.264-first (mp4/mkv containers), which ffmpeg's WebM muxer
 * rejects, so the old `-c copy` → .webm remux failed for most real recordings
 * and silently degraded to a non-seekable raw concat. Missing chunks are
 * salvaged (gap logged, footage kept) instead of failing the track.
 */

import { spawn } from "node:child_process";
import { appendFile, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "../db/index.ts";
import { ffmpegPath, withThreadLimit } from "../lib/ffmpeg-path.ts";
import {
	type TimelinePart,
	composeTimeline,
	startsContainer,
} from "../lib/media-compose.ts";
import {
	enqueueFinalize,
	getFinalizeJobState,
	isQueueConfigured,
} from "../lib/queue.ts";
import {
	describeSegmentGaps,
	findSegmentGaps,
	waitForLateSegments,
} from "../lib/segment-gaps.ts";
import { evenDim, probeMedia, sizeFilter } from "../lib/video-geometry.ts";
import { escapeFilterPath, watermarkFontPath } from "../lib/watermark-font.ts";
import { sessionNeedsWatermark } from "./entitlements-service.ts";
import { getObjectBuffer, putFileObject } from "./storage-service.ts";
import { reconcileRecordedSeconds } from "./usage-service.ts";

/** Bottom-right "openside.pro" badge burned into DEMO masters only. Points
 *  drawtext at a bundled font so it renders on the deploy image (no system
 *  fonts); see watermark-font.ts. */
const WATERMARK_FONT_ARG = watermarkFontPath
	? `fontfile=${escapeFilterPath(watermarkFontPath)}:`
	: "";
// Large, bold, outlined + boxed so it's prominent and not trivially cropped out.
function watermarkFilter(x: string): string {
	return `drawtext=${WATERMARK_FONT_ARG}text='openside.pro':x=${x}:y=h-th-24:fontsize=44:fontcolor=white:borderw=2:bordercolor=black@0.6:box=1:boxcolor=black@0.45:boxborderw=16`;
}
const WATERMARK_FILTER = watermarkFilter("w-tw-28");
// The "both" composite parks the camera PiP in the bottom-right - exactly over
// the masters' badge - so the composite re-stamps its own at the bottom-LEFT,
// where nothing covers it.
const WATERMARK_FILTER_LEFT = watermarkFilter("28");

const inFlight = new Set<string>();
const FFMPEG_TIMEOUT_MS =
	Number(process.env.SCREEN_FFMPEG_TIMEOUT_MS) || 2 * 60 * 60 * 1000;

/**
 * Kick off screen-recorder finalization through the same worker queue used by
 * space recordings.
 *
 * Fallback policy: run in-process ONLY when no queue is configured (local/dev).
 * When a queue IS configured but the enqueue fails (Redis outage), we do NOT run
 * ffmpeg in-process - that would overload the API fleet. The session is left for
 * finalization recovery to retry.
 */
async function triggerScreenFinalize(
	sessionId: string,
	delayMs = 0,
): Promise<void> {
	if (!isQueueConfigured()) {
		console.warn(
			`[ScreenFinalize] Redis not configured; finalizing ${sessionId} in API process`,
		);
		setTimeout(() => void finalizeScreenSession(sessionId), delayMs);
		return;
	}

	try {
		await enqueueFinalize(sessionId, { delayMs });
		console.log(
			`[ScreenFinalize] queued session ${sessionId} for worker finalization`,
		);
	} catch (error) {
		console.error(
			`[ScreenFinalize] enqueue failed for ${sessionId} (queue configured); leaving for recovery:`,
			error,
		);
	}
}

interface Composition {
	layout?: "screen" | "camera" | "screen-camera";
	cameraSize?: "normal" | "big";
	cameraShape?: "square" | "rectangle" | "circle";
	/** Flipped horizontally, like a mirror. */
	cameraMirror?: boolean;
	cameraCorner?: string; // currently always "bottom-right"
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function runFfmpeg(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn(ffmpegPath, withThreadLimit(args), {
			stdio: ["ignore", "ignore", "pipe"],
		});
		let stderr = "";
		const timeout = setTimeout(() => {
			proc.kill("SIGKILL");
			reject(new Error(`ffmpeg timed out after ${FFMPEG_TIMEOUT_MS}ms`));
		}, FFMPEG_TIMEOUT_MS);
		proc.stderr.on("data", (d) => {
			stderr += d.toString();
		});
		proc.on("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});
		proc.on("close", (code) => {
			clearTimeout(timeout);
			code === 0
				? resolve()
				: reject(new Error(`ffmpeg ${code}: ${stderr.slice(-2000)}`));
		});
	});
}

type MasterExt = "mp4" | "webm";

function screenKey(
	userId: string,
	sessionId: string,
	kind: string,
	ext: MasterExt,
): string {
	return `screen/${userId}/sessions/${sessionId}/${kind}/master.${ext}`;
}

function masterContentType(ext: MasterExt): string {
	return ext === "mp4" ? "video/mp4" : "video/webm";
}

type Role = "screen" | "camera" | "audio";

function roleOf(rec: { hasVideo: boolean; isScreenShare: boolean }): Role {
	if (!rec.hasVideo) return "audio";
	return rec.isScreenShare ? "screen" : "camera";
}

interface MasterInfo {
	role: Role;
	/** The master on local disk. */
	path: string;
	ext: MasterExt;
	width: number | null;
	height: number | null;
	fps: number | null;
	durationMs: number;
	/** True when the file on disk is guaranteed to be one fixed frame size. */
	pinned: boolean;
	/** Salvage notes (gaps, undecodable parts) for the track's row. */
	note: string | null;
}

/** Chunk downloads kept in flight ahead of the one being written. */
const DOWNLOAD_CONCURRENCY = 6;
/** Session CFR fallback when the capture didn't report a usable rate. */
const DEFAULT_FPS = 30;
const MASTER_CRF = 18;
const WATERMARKED_MASTER_CRF = 20;
/** The camera under a screen take is only ever a PiP (at most ~30% of the
 *  screen's height), so its intermediate master never needs more than this. */
const PIP_CAMERA_MAX_SHORT_SIDE = 720;

function isMissingObject(error: unknown): boolean {
	const e = error as {
		name?: string;
		$metadata?: { httpStatusCode?: number };
	} | null;
	return (
		e?.name === "NoSuchKey" ||
		e?.name === "NotFound" ||
		e?.$metadata?.httpStatusCode === 404
	);
}

/** A chunk's bytes, or null if the object is gone (it becomes a gap). A
 *  storage error that outlasts the retries throws, so the job is retried. */
async function downloadChunk(key: string): Promise<Buffer | null> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await getObjectBuffer(key);
		} catch (error) {
			if (isMissingObject(error)) return null;
			if (attempt >= 2) {
				throw new Error(`Chunk download failed: ${errorMessage(error)}`);
			}
			await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
		}
	}
}

/**
 * Download a track's chunks - several at a time, written in order - and split
 * them into recorder parts: every chunk that opens a fresh container is a
 * recorder restart (codec fallback, lost device, pause, periodic rotation).
 * Never holds more than a few chunks in memory.
 */
async function downloadParts(
	recId: string,
	ordered: { assetKey: string; startMs: number }[],
	tmpDir: string,
): Promise<{ parts: TimelinePart[]; missing: number }> {
	const parts: TimelinePart[] = [];
	let current: TimelinePart | null = null;
	let missing = 0;

	const pending: Promise<Buffer | null>[] = [];
	let next = 0;
	const fill = () => {
		while (next < ordered.length && pending.length < DOWNLOAD_CONCURRENCY) {
			const download = downloadChunk(ordered[next]?.assetKey ?? "");
			// Awaited below in order; this only keeps a failure that's still
			// queued behind an earlier one from going unhandled.
			download.catch(() => undefined);
			pending.push(download);
			next++;
		}
	};
	fill();

	for (const seg of ordered) {
		const buf = await pending.shift();
		fill();
		if (!buf) {
			missing++;
			continue;
		}
		if (!current || startsContainer(buf)) {
			current = {
				rawPath: path.join(tmpDir, `${recId}-raw-${parts.length}.bin`),
				startMs: seg.startMs,
			};
			parts.push(current);
			await writeFile(current.rawPath, Buffer.alloc(0));
		}
		await appendFile(current.rawPath, buf);
	}
	return { parts, missing };
}

/**
 * Build one track's master on local disk: its chunks → recorder parts → one
 * CFR H.264/AAC timeline (the meeting pipeline's composer: gaps filled, audio
 * drift-corrected, every frame pinned to one size). Not uploaded - the caller
 * decides whether it's an output or just a composite input.
 */
async function buildMaster(
	rec: {
		id: string;
		hasVideo: boolean;
		isScreenShare: boolean;
		width: number | null;
		height: number | null;
		fps: number | null;
		expectedSegments: number | null;
		segments: {
			sequenceNumber: number;
			assetKey: string;
			startMs: number;
			durationMs: number;
		}[];
	},
	tmpDir: string,
	opts: {
		watermark: boolean;
		/** Flip horizontally (the camera's mirror view). */
		mirror: boolean;
		maxShortSide: number;
		maxFps: number;
	},
): Promise<MasterInfo | null> {
	let segments = rec.segments;
	if (segments.length === 0) {
		// The client can mark a recording "complete" with 0 segments if its very
		// last chunk (often its only chunk, for a take under 5s) was still being
		// persisted when it reported. Give that straggler a few seconds to land
		// before condemning the track - re-checking straight from the DB rather
		// than trusting the (possibly stale) segments this pass was claimed with.
		segments = await waitForLateSegments(rec.id, () =>
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
		if (segments.length === 0) {
			await prisma.participantRecording.update({
				where: { id: rec.id },
				data: { status: "FAILED", processingError: "No segments uploaded" },
			});
			return null;
		}
	}

	await prisma.participantRecording.update({
		where: { id: rec.id },
		data: { status: "PROCESSING", processingError: null },
	});

	const role = roleOf(rec);
	const ordered = [...segments].sort(
		(a, b) => a.sequenceNumber - b.sequenceNumber,
	);
	// Salvage rather than fail: build from whatever arrived. A missing chunk
	// costs a glitch in its part, never the whole track.
	const notes: string[] = [];
	const gapNote = describeSegmentGaps(
		findSegmentGaps(ordered, rec.expectedSegments),
	);
	if (gapNote) {
		console.warn(
			`[ScreenFinalize] ${rec.id}: ${gapNote} - salvaging available footage`,
		);
		notes.push(gapNote);
	}

	const { parts, missing } = await downloadParts(rec.id, ordered, tmpDir);
	if (parts.length === 0) throw new Error("No chunk objects could be read");
	if (missing > 0) {
		notes.push(`${missing} chunk object(s) were missing from storage`);
	}

	const fps = Math.min(
		rec.fps && rec.fps >= 10 ? Math.round(rec.fps) : DEFAULT_FPS,
		opts.maxFps,
	);
	const sizeHint =
		rec.width && rec.height && rec.width > 1 && rec.height > 1
			? { width: rec.width, height: rec.height }
			: null;
	// Mirror first so the DEMO badge isn't flipped with the picture.
	const extraFilters = [
		...(opts.mirror ? ["hflip"] : []),
		...(opts.watermark ? [WATERMARK_FILTER] : []),
	];
	console.log(
		`[ScreenFinalize] building ${rec.id} role=${role} segments=${ordered.length} parts=${parts.length} fps=${fps}${opts.watermark ? " (watermark)" : ""}`,
	);

	try {
		const master = await composeTimeline({
			parts,
			tmpDir,
			id: rec.id,
			fps,
			crf: opts.watermark ? WATERMARKED_MASTER_CRF : MASTER_CRF,
			extraFilters,
			sizeHint,
			maxShortSide: opts.maxShortSide,
			timeoutMs: FFMPEG_TIMEOUT_MS,
		});
		if (master.skippedParts > 0) {
			notes.push(
				`${master.skippedParts} recorder part(s) could not be decoded and were filled with black/silence`,
			);
		}
		return {
			role,
			path: master.path,
			ext: master.ext,
			width: master.target?.width ?? null,
			height: master.target?.height ?? null,
			fps,
			durationMs: master.durationMs,
			pinned: master.target !== null,
			note: notes.length > 0 ? notes.join("; ") : null,
		};
	} catch (error) {
		console.error(
			`[ScreenFinalize] ${rec.id}: master encode failed, salvaging the first part:`,
			error,
		);
	}

	// Encoding failed outright: never lose the recording - remux the first
	// part to WebM, or keep its raw bytes.
	const firstPart = parts[0];
	if (!firstPart) throw new Error("No recorder part to salvage");
	if (parts.length > 1) {
		notes.push(`only the first of ${parts.length} recorder parts was kept`);
	}
	const fallbackPath = path.join(tmpDir, `${rec.id}-fallback.webm`);
	let salvagedPath = fallbackPath;
	try {
		await runFfmpeg([
			"-y",
			"-fflags",
			"+genpts",
			"-i",
			firstPart.rawPath,
			"-c",
			"copy",
			fallbackPath,
		]);
	} catch (error) {
		console.error(
			`[ScreenFinalize] remux failed for ${rec.id}, using raw bytes:`,
			error,
		);
		salvagedPath = firstPart.rawPath;
	}
	const probe = await probeMedia(salvagedPath);
	return {
		role,
		path: salvagedPath,
		ext: "webm",
		width: probe.size?.width ?? rec.width,
		height: probe.size?.height ?? rec.height,
		fps: rec.fps,
		durationMs:
			probe.durationMs ??
			ordered.reduce((sum, seg) => sum + (seg.durationMs || 0), 0),
		pinned: false,
		note: notes.join("; "),
	};
}

/** Upload a master as one of the take's outputs and settle its track row. */
async function publishMaster(
	recId: string,
	master: MasterInfo,
	userId: string,
	sessionId: string,
): Promise<{ key: string; durationMs: number }> {
	const key = screenKey(userId, sessionId, master.role, master.ext);
	const contentType = masterContentType(master.ext);
	await putFileObject(key, master.path, contentType);
	const fileStat = await stat(master.path);
	await prisma.participantRecording.update({
		where: { id: recId },
		data: {
			status: "READY",
			mergedFileKey: key,
			fileSize: BigInt(fileStat.size),
			durationMs: master.durationMs,
			mimeType: contentType,
			// The master's REAL geometry and rate (the client's start-of-capture
			// snapshot is stale once the shared surface resizes).
			...(master.pinned
				? { width: master.width, height: master.height, fps: master.fps }
				: {}),
			processingError: master.note,
		},
	});
	return { key, durationMs: master.durationMs };
}

/** A track that only fed the composite: done, but with no file of its own. */
async function settleCompositeInput(
	recId: string,
	master: MasterInfo,
): Promise<void> {
	await prisma.participantRecording.update({
		where: { id: recId },
		data: {
			status: "READY",
			mergedFileKey: null,
			durationMs: master.durationMs,
			processingError: master.note,
		},
	});
}

/**
 * Build a rounded-rect alpha expr for geq (W,H = plane dims, r = radius px).
 * NOTE: this is embedded inside a single-quoted filter option (a='…'), so the
 * single quotes already protect commas - they must NOT be backslash-escaped.
 */
function roundedAlphaExpr(r: number): string {
	// alpha = 0 only in the four corners outside the quarter-circle of radius r.
	const tl = `lt(X,${r})*lt(Y,${r})*gt(hypot(${r}-X,${r}-Y),${r})`;
	const tr = `gt(X,W-${r})*lt(Y,${r})*gt(hypot(X-(W-${r}),${r}-Y),${r})`;
	const bl = `lt(X,${r})*gt(Y,H-${r})*gt(hypot(${r}-X,Y-(H-${r})),${r})`;
	const br = `gt(X,W-${r})*gt(Y,H-${r})*gt(hypot(X-(W-${r}),Y-(H-${r})),${r})`;
	return `if(gt(${tl}+${tr}+${bl}+${br},0),0,255)`;
}

/**
 * Composite the camera master onto the screen master as a bottom-right PiP.
 *
 * `fast` is the fallback path: it keeps the rounded-corner camera (the `geq`
 * pass is cheap - it only runs on the small camera image, not the full frame)
 * but uses a quicker VP9 preset. The quality path can time out on long/high-res
 * recordings, so callers retry in fast mode to still produce a combined output.
 */
async function composeBoth(
	screen: MasterInfo,
	camera: MasterInfo,
	comp: Composition,
	userId: string,
	sessionId: string,
	tmpDir: string,
	watermark: boolean,
	fast = false,
): Promise<{ key: string; durationMs: number } | null> {
	const baseH = screen.height && screen.height > 0 ? screen.height : 1080;
	const aspect = comp.cameraShape === "rectangle" ? 16 / 9 : 1;
	const camH = Math.round((comp.cameraSize === "big" ? 0.3 : 0.22) * baseH);
	const camW = Math.round(camH * aspect);
	const margin = Math.round(0.03 * baseH);
	// A circle is a square whose corner radius is half its side.
	const radius =
		comp.cameraShape === "circle"
			? Math.floor(camH / 2)
			: Math.max(2, Math.round(0.12 * camH));
	// Screen capture is variable-frame-rate; normalize both inputs to a constant
	// fps before overlay (and force CFR output) so the merged video isn't laggy.
	const fps = screen.fps && screen.fps >= 10 ? Math.round(screen.fps) : 30;

	const aspectStr = aspect.toFixed(6);
	// Rounded corners via per-pixel alpha. Runs on the small scaled camera only,
	// so it's cheap - kept on both the quality and fast paths for consistency.
	const camChain = `[1:v]crop='min(iw,ih*${aspectStr})':'min(ih,iw/${aspectStr})',${comp.cameraMirror ? "hflip," : ""}scale=${camW}:${camH},fps=${fps},setpts=PTS-STARTPTS,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${roundedAlphaExpr(radius)}'[cam];`;
	// A re-encoded screen master is already one fixed size; a remuxed/raw-concat
	// fallback master is not, so re-pin it here or the overlay pass reproduces
	// the same mid-stream-resize corruption.
	const basePin =
		!screen.pinned && screen.width && screen.height
			? `${sizeFilter({ width: evenDim(screen.width), height: evenDim(screen.height) })},`
			: "";
	const filter =
		// format=yuv420p: the geq/rgba path yields gbrap, which encoders reject.
		// DEMO composites re-stamp the badge AFTER the overlay (bottom-left): the
		// screen master's own badge sits under the PiP and would be hidden.
		`[0:v]${basePin}fps=${fps},setpts=PTS-STARTPTS[base];${camChain}[base][cam]overlay=main_w-overlay_w-${margin}:main_h-overlay_h-${margin}:format=auto,format=yuv420p${watermark ? `,${WATERMARK_FILTER_LEFT}` : ""}[v]`;

	const outPath = path.join(tmpDir, `${sessionId}-both.mp4`);
	console.log(
		`[ScreenFinalize] composing both for ${sessionId} (${fast ? "fast" : "quality"}): screen=${screen.width}x${screen.height} camera=${camW}x${camH} fps=${fps} shape=${comp.cameraShape ?? "square"} sizeMode=${comp.cameraSize ?? "normal"}`,
	);
	await runFfmpeg([
		"-y",
		"-i",
		screen.path,
		"-i",
		camera.path,
		"-filter_complex",
		filter,
		"-map",
		"[v]",
		"-map",
		"0:a?",
		"-r",
		String(fps),
		"-fps_mode",
		"cfr",
		"-af",
		"aresample=async=1:first_pts=0",
		"-c:v",
		"libx264",
		"-preset",
		fast ? "veryfast" : "medium",
		"-crf",
		fast ? "23" : "18",
		"-pix_fmt",
		"yuv420p",
		"-movflags",
		"+faststart",
		"-c:a",
		"aac",
		"-b:a",
		"192k",
		outPath,
	]);

	const key = screenKey(userId, sessionId, "both", "mp4");
	await putFileObject(key, outPath, masterContentType("mp4"));
	console.log(`[ScreenFinalize] composed both for ${sessionId}: ${key}`);
	const { durationMs } = await probeMedia(outPath);
	return { key, durationMs: durationMs ?? screen.durationMs };
}

export async function finalizeScreenSession(
	sessionId: string,
	{
		finalAttempt = true,
	}: {
		/** False while the queue still has retries left: a failure then throws
		 *  (so it's retried) instead of settling the take as FAILED or partial. */
		finalAttempt?: boolean;
	} = {},
): Promise<void> {
	if (inFlight.has(sessionId)) return;
	inFlight.add(sessionId);
	let tmp: string | null = null;

	try {
		const session = await prisma.recordingSession.findUnique({
			where: { id: sessionId },
			include: {
				participantRecordings: {
					include: { segments: { orderBy: { sequenceNumber: "asc" } } },
				},
			},
		});

		if (!session || session.source !== "SCREEN_RECORDER" || !session.userId) {
			console.warn(
				`[ScreenFinalize] ${sessionId} skipped: missing/non-screen session`,
			);
			return;
		}
		if (session.status === "READY") {
			console.log(
				`[ScreenFinalize] ${sessionId} skipped: status=${session.status}`,
			);
			return;
		}
		if (!["STOPPED", "PROCESSING", "FAILED"].includes(session.status)) {
			console.log(
				`[ScreenFinalize] ${sessionId} skipped: status=${session.status}`,
			);
			return;
		}

		console.log(
			`[ScreenFinalize] starting ${sessionId}: status=${session.status} recordings=${session.participantRecordings.length}`,
			session.participantRecordings.map((r) => ({
				id: r.id,
				screen: r.isScreenShare,
				hasVideo: r.hasVideo,
				hasAudio: r.hasAudio,
				complete: r.isComplete,
				segments: r.segments.length,
				width: r.width,
				height: r.height,
				fps: r.fps,
			})),
		);

		await prisma.recordingSession.update({
			where: { id: sessionId },
			data: { status: "PROCESSING" },
		});

		tmp = await mkdtemp(path.join(tmpdir(), "openside-screen-"));
		const comp = (session.composition as Composition | null) ?? {};
		console.log(`[ScreenFinalize] ${sessionId} composition`, comp);

		// Owner entitlement, resolved server-side once per session.
		const watermark = await sessionNeedsWatermark({
			spaceId: null,
			userId: session.userId,
			selfHosted: session.selfHosted,
		});

		// "Both" composite - produce it whenever both tracks exist unless the
		// saved layout explicitly says this was not a screen+camera recording.
		const recs = session.participantRecordings;
		const screenRec = recs.find((rec) => roleOf(rec) === "screen");
		const cameraRec = recs.find((rec) => roleOf(rec) === "camera");
		const wantsBoth =
			Boolean(screenRec && cameraRec) &&
			(comp.layout === undefined || comp.layout === "screen-camera");

		// Older takes also recorded a mic-only track. No output uses it (the
		// sound comes from the screen or camera track), so skip the work; its
		// chunks go with the shared day-later cleanup.
		for (const rec of recs) {
			if (roleOf(rec) !== "audio") continue;
			await prisma.participantRecording.update({
				where: { id: rec.id },
				data: { status: "READY", processingError: null },
			});
		}

		// Screen and camera build in parallel. A camera that's only a PiP
		// is built small - it never shows bigger than ~30% of the screen.
		const limits = {
			watermark,
			maxShortSide: session.videoResolution,
			maxFps: session.targetFps,
		};
		const build = async (
			rec: (typeof recs)[number] | undefined,
			opts: Parameters<typeof buildMaster>[2],
		): Promise<MasterInfo | null> => {
			if (!rec) return null;
			try {
				return await buildMaster(rec, tmp as string, opts);
			} catch (error) {
				const message = errorMessage(error);
				console.error(
					`[ScreenFinalize] track ${rec.id} failed for ${sessionId}:`,
					error,
				);
				// Retry the whole take before giving up on a track - most failures
				// here are transient (a storage read, a worker under pressure).
				if (!finalAttempt) throw error;
				await prisma.participantRecording
					.update({
						where: { id: rec.id },
						data: { status: "FAILED", processingError: message.slice(0, 2000) },
					})
					.catch(() => undefined);
				return null;
			}
		};
		const [screen, camera] = await Promise.all([
			build(screenRec, { ...limits, mirror: false }),
			build(cameraRec, {
				// The composite applies the PiP's own mirror; a camera-only take
				// is mirrored here.
				...limits,
				watermark: watermark && !wantsBoth,
				mirror: !wantsBoth && Boolean(comp.cameraMirror),
				maxShortSide: wantsBoth
					? Math.min(session.videoResolution, PIP_CAMERA_MAX_SHORT_SIDE)
					: session.videoResolution,
			}),
		]);

		console.log(
			`[ScreenFinalize] ${sessionId} masters`,
			Object.fromEntries(
				Object.entries({ screen, camera }).map(([role, master]) => [
					role,
					master
						? {
								width: master.width,
								height: master.height,
								fps: master.fps,
								durationMs: master.durationMs,
								parts: master.note,
							}
						: null,
				]),
			),
		);

		const outputs: Record<string, { key: string; durationMs: number }> = {};

		let both: { key: string; durationMs: number } | null = null;
		if (wantsBoth && screen && camera) {
			try {
				both = await composeBoth(
					screen,
					camera,
					comp,
					session.userId,
					sessionId,
					tmp,
					watermark,
				);
			} catch (error) {
				// Retry once in fast mode so the user still gets a combined video
				// instead of only the split tracks.
				console.error(
					`[ScreenFinalize] composite failed for ${sessionId}, retrying fast:`,
					error,
				);
				try {
					both = await composeBoth(
						screen,
						camera,
						comp,
						session.userId,
						sessionId,
						tmp,
						watermark,
						true,
					);
				} catch (retryError) {
					console.error(
						`[ScreenFinalize] fast composite also failed for ${sessionId}:`,
						retryError,
					);
					if (!finalAttempt) throw retryError;
				}
			}
		} else {
			console.log(
				`[ScreenFinalize] ${sessionId} skipping both: layout=${comp.layout ?? "missing"} hasScreen=${Boolean(screen)} hasCamera=${Boolean(camera)}`,
			);
		}

		if (both && screen && camera && screenRec && cameraRec) {
			// The combined video is the only output: the screen and camera
			// masters were just its inputs and are never uploaded. Their raw
			// chunks stay for a day (the shared cleanup removes them) so a
			// straggler chunk can still rebuild a fuller video.
			outputs.both = both;
			await settleCompositeInput(screenRec.id, screen);
			await settleCompositeInput(cameraRec.id, camera);
		} else {
			// No combined output (single track, or the composite failed) - keep
			// whatever separate masters exist so the recording is viewable.
			if (screen && screenRec) {
				const published = await publishMaster(
					screenRec.id,
					screen,
					session.userId,
					sessionId,
				);
				outputs.screen = published;
				outputs.screenAligned = published;
			}
			if (camera && cameraRec) {
				outputs.camera = await publishMaster(
					cameraRec.id,
					camera,
					session.userId,
					sessionId,
				);
			}
		}

		if (Object.keys(outputs).length === 0) {
			await prisma.recordingSession.update({
				where: { id: sessionId },
				data: { status: "FAILED", outputs: outputs as never },
			});
			console.error(
				`[ScreenFinalize] Session ${sessionId} failed: no outputs were produced.`,
			);
			return;
		}

		await prisma.recordingSession.update({
			where: { id: sessionId },
			data: { status: "READY", outputs: outputs as never },
		});

		// Bill what was actually recorded if the meter came up short (pause is
		// the client's word; the video's length is the proof).
		const recordedMs = Math.max(
			...Object.values(outputs).map((output) => output.durationMs || 0),
		);
		await reconcileRecordedSeconds(sessionId, recordedMs / 1000).catch(
			(error) =>
				console.error(
					`[ScreenFinalize] usage reconcile failed for ${sessionId}:`,
					error,
				),
		);
		console.log(
			`[ScreenFinalize] Session ${sessionId} ready.`,
			Object.keys(outputs),
		);

		// Chunks that landed while this pass ran aren't in it: go again.
		const usedSegments = new Map(
			session.participantRecordings.map((rec) => [rec.id, rec.segments.length]),
		);
		const arrived = await prisma.recordingSegment.groupBy({
			by: ["participantRecordingId"],
			where: { participantRecordingId: { in: [...usedSegments.keys()] } },
			_count: { _all: true },
		});
		const missedLate = arrived.some(
			(row) =>
				row._count._all > (usedSegments.get(row.participantRecordingId) ?? 0),
		);
		if (missedLate) {
			console.log(
				`[ScreenFinalize] ${sessionId}: chunks arrived during finalize - re-running`,
			);
			await reopenScreenSession(sessionId);
		}
	} catch (error) {
		const message = errorMessage(error);
		console.error(`[ScreenFinalize] Session ${sessionId} failed:`, error);
		if (!finalAttempt) {
			// Stays PROCESSING; the queue runs it again.
			throw error;
		}
		await prisma.recordingSession
			.update({ where: { id: sessionId }, data: { status: "FAILED" } })
			.catch(() => undefined);
		await prisma.participantRecording
			.updateMany({
				where: { recordingSessionId: sessionId, status: "PROCESSING" },
				data: { status: "FAILED", processingError: message.slice(0, 2000) },
			})
			.catch(() => undefined);
	} finally {
		inFlight.delete(sessionId);
		if (tmp)
			await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
	}
}

/** Finalize once the session is stopped and all its recordings are complete. */
export async function maybeFinalizeScreenSession(
	sessionId: string,
): Promise<void> {
	const session = await prisma.recordingSession.findUnique({
		where: { id: sessionId },
		select: {
			source: true,
			status: true,
			participantRecordings: {
				select: {
					id: true,
					isComplete: true,
					uploadedSegments: true,
					expectedSegments: true,
					status: true,
				},
			},
		},
	});

	if (!session || session.source !== "SCREEN_RECORDER") {
		console.warn(
			`[ScreenFinalize] maybe ${sessionId}: session missing or not screen recorder`,
		);
		return;
	}
	if (session.status !== "STOPPED") {
		console.log(
			`[ScreenFinalize] maybe ${sessionId}: waiting for STOPPED, status=${session.status}`,
		);
		return;
	}
	const recs = session.participantRecordings;
	if (recs.length === 0) {
		console.log(`[ScreenFinalize] maybe ${sessionId}: no track recordings yet`);
		return;
	}
	if (!recs.every((r) => r.isComplete)) {
		console.log(
			`[ScreenFinalize] maybe ${sessionId}: waiting for complete tracks`,
			recs.map((r) => ({
				id: r.id,
				status: r.status,
				complete: r.isComplete,
				uploaded: r.uploadedSegments,
				expected: r.expectedSegments,
			})),
		);
		return;
	}

	console.log(
		`[ScreenFinalize] maybe ${sessionId}: all tracks complete, triggering finalization`,
	);
	await triggerScreenFinalize(sessionId);
}

/**
 * Recovery backstop for a take that should be processing but isn't: its job
 * was lost (enqueue failed, Redis restarted) or its worker died mid-encode
 * (deploy, OOM, scale-down) and left it PROCESSING. A live job is left alone;
 * one that exhausted its retries is settled as FAILED instead of re-run
 * forever.
 */
export async function recoverScreenFinalize(sessionId: string): Promise<void> {
	if (!isQueueConfigured()) {
		if (inFlight.has(sessionId)) return;
		void finalizeScreenSession(sessionId);
		return;
	}

	const state = await getFinalizeJobState(sessionId).catch(
		() => "pending" as const,
	);
	if (state === "pending" || state === "unconfigured") return;

	if (state === "failed") {
		await prisma.recordingSession.updateMany({
			where: { id: sessionId, status: { in: ["STOPPED", "PROCESSING"] } },
			data: { status: "FAILED" },
		});
		return;
	}

	console.warn(
		`[ScreenFinalize] ${sessionId} had no live finalize job - re-queuing`,
	);
	await triggerScreenFinalize(sessionId);
}

/** Late chunks re-finalize after this pause, so a burst lands in one pass. */
const STRAGGLER_FINALIZE_DELAY_MS = 30 * 1000;

/**
 * A chunk landed after the take was finalized (a crashed tab's buffer
 * uploaded later, a slow uplink): re-open it and rebuild the video with it,
 * instead of silently ignoring it.
 */
export async function reopenScreenSession(sessionId: string): Promise<void> {
	const reopened = await prisma.recordingSession.updateMany({
		where: {
			id: sessionId,
			source: "SCREEN_RECORDER",
			status: { in: ["READY", "FAILED", "PROCESSING"] },
		},
		data: { status: "STOPPED" },
	});
	if (reopened.count !== 1) return;
	await triggerScreenFinalize(sessionId, STRAGGLER_FINALIZE_DELAY_MS);
}
