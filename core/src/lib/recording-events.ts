/**
 * Server-originated recording start/stop broadcasts.
 *
 * Clients used to announce start/stop over an unauthenticated socket event, so
 * anyone with a room code could stop someone else's recording, and a host whose
 * socket was down silently failed to start anyone. Now the authenticated API (and
 * every server-side stop path: usage exhaustion, space end, the abandoned-session
 * reaper) publishes here after the database change commits.
 *
 * The socket server registers the publisher at boot. Processes without sockets
 * (the media worker) never register one, so publishing there is a no-op.
 */

/** Synced 3-2-1 lead-in every participant counts down before capturing. */
export const RECORDING_COUNTDOWN_MS = 3000;

export interface RecordingStartedPayload {
	sessionId: string;
	spaceRecordingSessionId: string;
	/** Server-clock instant every participant's recorder starts at. */
	startedAt: number;
	countdownMs: number;
	videoResolution: number;
	audioSampleRate: number;
	noiseSuppression: boolean;
	autoGainControl: boolean;
	echoCancellation: boolean;
	recordingMode: "VIDEO_AND_AUDIO" | "AUDIO_ONLY";
}

interface RecordingEventPublisher {
	started(roomId: string, payload: RecordingStartedPayload): void;
	stopped(roomId: string, sessionId: string): void;
}

let publisher: RecordingEventPublisher | null = null;

export function setRecordingEventPublisher(next: RecordingEventPublisher) {
	publisher = next;
}

/**
 * One formula for the start instant everywhere (live broadcast, join-room
 * replay, the client's active-session poll), so a late joiner lands on exactly
 * the same timeline as everyone who saw the original broadcast.
 */
export function buildRecordingStartedPayload(session: {
	id: string;
	spaceRecordingSessionId: string;
	startedAt: Date;
	videoResolution: number;
	audioSampleRate: number;
	noiseSuppression: boolean;
	autoGainControl: boolean;
	echoCancellation: boolean;
	recordingMode: string;
}): RecordingStartedPayload {
	return {
		sessionId: session.id,
		spaceRecordingSessionId: session.spaceRecordingSessionId,
		startedAt: session.startedAt.getTime() + RECORDING_COUNTDOWN_MS,
		countdownMs: RECORDING_COUNTDOWN_MS,
		videoResolution: session.videoResolution,
		audioSampleRate: session.audioSampleRate,
		noiseSuppression: session.noiseSuppression,
		autoGainControl: session.autoGainControl,
		echoCancellation: session.echoCancellation,
		recordingMode:
			session.recordingMode === "AUDIO_ONLY" ? "AUDIO_ONLY" : "VIDEO_AND_AUDIO",
	};
}

export function publishRecordingStarted(
	roomId: string | null | undefined,
	payload: RecordingStartedPayload,
) {
	if (!roomId) return;
	try {
		publisher?.started(roomId, payload);
	} catch (error) {
		console.error("[RecordingEvents] start broadcast failed:", error);
	}
}

export function publishRecordingStopped(
	roomId: string | null | undefined,
	sessionId: string,
) {
	if (!roomId) return;
	try {
		publisher?.stopped(roomId, sessionId);
	} catch (error) {
		console.error("[RecordingEvents] stop broadcast failed:", error);
	}
}
