/**
 * HOOK: useScreenRecordingManager
 *
 * Single-user screen-recorder orchestration (no sockets, no other
 * participants). End-to-end:
 *   1. Create a RecordingSession (source = SCREEN_RECORDER) on the backend.
 *   2. Create one ParticipantRecording row per track (combined/camera/audio)
 *      during the local 3-2-1 lead-in, then start the local recorders.
 *   3. (Chunks are saved under those rows from the very first one.)
 *   4. Stream every chunk through useChunkUploader → R2 (screen endpoints).
 *   5. On stop, report each track's recorded chunk count, stop the session,
 *      then wait for the upload queue to drain.
 * Pause/resume pauses the local recorders; discard throws the take away
 * (queued chunks dropped, session + storage deleted).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import api from "@/lib/axiosInstance";
import { toast } from "@/lib/toast";
import useChunkUploader from "./useChunkUploader";
import { sendUsageHeartbeat } from "./useUsage";
import useScreenLocalRecording, {
  type ScreenStreams,
  type ScreenTrackType,
} from "./useScreenLocalRecording";
import type { RecordingChunk, RecordingMetadata } from "./useLocalRecording";

export type ScreenRecordingState =
  | "idle"
  | "starting"
  | "countdown"
  | "recording"
  | "paused"
  | "stopping"
  | "uploading"
  | "complete"
  | "error";

const COUNTDOWN_SECONDS = 3;

const SCREEN_ENDPOINTS = {
  scope: "screen" as const,
  presignPath: "/recording/screen/segment/presign",
  segmentPath: "/recording/screen/segment",
};

interface UseScreenRecordingManagerOptions {
  /** Builds the per-track streams at the moment recording begins. */
  buildStreams: () => ScreenStreams;
  /** User-provided title/description, read when the session is created. */
  getInfo?: () => { title: string; description: string };
  /** Layout + camera PiP config, persisted so finalization can reproduce it. */
  getComposition?: () => Record<string, unknown>;
}

interface UseScreenRecordingManagerReturn {
  recordingState: ScreenRecordingState;
  recordingDurationMs: number;
  countdownValue: number | null;
  pendingUploads: number;
  uploadProgress: number;
  error: string | null;
  /** Session id of the last take that finished saving (for "open it" links). */
  completedSessionId: string | null;
  toggleRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  discardRecording: () => Promise<void>;
  /** Throw the current take away and start a fresh one on the same sources. */
  restartRecording: () => Promise<void>;
}

/** How long Stop waits for the upload queue before handing back the UI. */
const UPLOAD_DRAIN_TIMEOUT_MS = 10 * 60 * 1000;

/** A few quick retries for the stop-time calls (a blip shouldn't lose them;
 *  the server's recovery sweep backstops anything that still fails). */
async function withRetries<T>(
  call: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await call();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
  throw lastError;
}

function generateSessionId(): string {
  return `scr_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

// combined + camera are VIDEO rows; audio is an AUDIO row. Built from the
// live tracks before capture starts (the recorder's codec isn't known yet -
// finalization probes the files anyway).
function recordingPayloadFor(trackType: ScreenTrackType, stream: MediaStream) {
  const video = stream.getVideoTracks()[0]?.getSettings();
  const audio = stream.getAudioTracks()[0]?.getSettings();
  return {
    type: trackType === "audio" ? ("AUDIO" as const) : ("VIDEO" as const),
    isScreenShare: trackType === "combined",
    width: video?.width,
    height: video?.height,
    fps: video?.frameRate,
    sampleRate: audio?.sampleRate,
    channels: audio?.channelCount,
    hasAudio: stream.getAudioTracks().length > 0,
    hasVideo: stream.getVideoTracks().length > 0,
  };
}

export default function useScreenRecordingManager({
  buildStreams,
  getInfo,
  getComposition,
}: UseScreenRecordingManagerOptions): UseScreenRecordingManagerReturn {
  const [recordingState, setRecordingState] =
    useState<ScreenRecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(
    null,
  );

  // session client id + backend ids.
  const clientSessionIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const recordingIdsRef = useRef<Partial<Record<ScreenTrackType, string>>>({});
  const metaRef = useRef<Partial<Record<ScreenTrackType, RecordingMetadata>>>(
    {},
  );

  // Chunks that arrived before their recording row id existed.
  const pendingChunksRef = useRef<
    { trackType: ScreenTrackType; chunk: RecordingChunk }[]
  >([]);
  // Set while a take is being discarded: its last chunks are thrown away.
  const discardingRef = useRef(false);

  const countdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  const clearCountdown = useCallback(() => {
    if (countdownTimeoutRef.current) clearTimeout(countdownTimeoutRef.current);
    if (countdownIntervalRef.current)
      clearInterval(countdownIntervalRef.current);
    countdownTimeoutRef.current = null;
    countdownIntervalRef.current = null;
    setCountdownValue(null);
  }, []);

  const uploader = useChunkUploader(undefined, SCREEN_ENDPOINTS);

  // Drain any chunks left from a previous crashed session on mount.
  // Ref-gated: the uploader object's identity changes with its state, and an
  // every-render resume can race enqueue into double-queuing a chunk.
  const resumedOrphansRef = useRef(false);
  useEffect(() => {
    if (resumedOrphansRef.current) return;
    resumedOrphansRef.current = true;
    void uploader.resumeOrphans();
  }, [uploader]);

  const enqueueChunk = useCallback(
    (trackType: ScreenTrackType, chunk: RecordingChunk) => {
      if (discardingRef.current) return;
      const recordingId = recordingIdsRef.current[trackType];
      const sessionId = sessionIdRef.current;
      if (!recordingId || !sessionId) {
        pendingChunksRef.current.push({ trackType, chunk });
        return;
      }
      const meta = metaRef.current[trackType];
      void uploader.enqueue({
        // spaceId / participantSessionId are unused by the screen backend
        // (ownership is the session's userId) - sent as placeholders. Both
        // session-id fields carry the DB RecordingSession id so segment rows
        // reference the same id the storage keys use (the client-generated
        // scr_* id is only the session-create idempotency handle).
        spaceId: "",
        spaceRecordingSessionId: sessionId,
        recordingSessionId: sessionId,
        participantRecordingId: recordingId,
        participantSessionId: "",
        trackType,
        sequenceNumber: chunk.sequenceNumber,
        startMs: chunk.startMs,
        durationMs: chunk.durationMs,
        mimeType: meta?.mimeType ?? "application/octet-stream",
        blob: chunk.blob,
      });
    },
    [uploader],
  );

  const flushPendingChunks = useCallback(() => {
    const pending = pendingChunksRef.current;
    pendingChunksRef.current = [];
    for (const { trackType, chunk } of pending) enqueueChunk(trackType, chunk);
  }, [enqueueChunk]);

  const recorder = useScreenLocalRecording({
    onChunkReady: (trackType, chunk) => enqueueChunk(trackType, chunk),
    onRecordingStart: (metadata) => {
      metaRef.current = metadata;
    },
    onError: (err, trackType) => {
      setError(`${trackType}: ${err.message}`);
      toast.error("Recording failed - please try again.");
      setRecordingState("error");
    },
  });

  const {
    startRecording: startLocal,
    stopRecording: stopLocal,
    pauseRecording: pauseLocal,
    resumeRecording: resumeLocal,
    getMaxTrackSize,
  } = recorder;

  const beginRecording = useCallback(async () => {
    clearCountdown();

    const streams = buildStreams();
    try {
      // The track rows already exist (created during the countdown), so every
      // chunk goes straight to IndexedDB and the upload queue.
      await startLocal(streams);
      setRecordingState("recording");
      flushPendingChunks();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start recording";
      console.error("[ScreenRecordingManager] start failed:", err);
      toast.error("Couldn't start recording - please try again.");
      setError(message);
      setRecordingState("error");
      try {
        await stopLocal();
      } catch {
        /* ignore */
      }
    }
  }, [buildStreams, clearCountdown, startLocal, stopLocal, flushPendingChunks]);

  const startRecording = useCallback(async () => {
    try {
      setRecordingState("starting");
      setError(null);
      setCompletedSessionId(null);
      recordingIdsRef.current = {};
      pendingChunksRef.current = [];

      const clientSessionId = generateSessionId();
      clientSessionIdRef.current = clientSessionId;

      const info = getInfo?.();
      const { data } = await api.post("/recording/screen/session/start", {
        spaceRecordingSessionId: clientSessionId,
        title: info?.title,
        description: info?.description,
        composition: getComposition?.(),
      });
      const sessionId = data.data.id as string;
      sessionIdRef.current = sessionId;

      // One row per track, created BEFORE capture: a failure here aborts the
      // take cleanly instead of mid-recording, and no chunk ever waits in
      // memory for an id it can be saved under.
      try {
        const planned = buildStreams();
        await Promise.all(
          (
            Object.entries(planned) as [ScreenTrackType, MediaStream | null][]
          ).map(async ([trackType, stream]) => {
            if (!stream) return;
            const { data: created } = await api.post(
              "/recording/screen/recording",
              {
                recordingSessionId: sessionId,
                ...recordingPayloadFor(trackType, stream),
              },
            );
            recordingIdsRef.current[trackType] = created.data.id as string;
          }),
        );
      } catch (rowError) {
        await api
          .delete(`/recording/screen/${sessionId}`)
          .catch(() => undefined);
        sessionIdRef.current = null;
        throw rowError;
      }

      // Local 3-2-1 lead-in.
      setRecordingState("countdown");
      setCountdownValue(COUNTDOWN_SECONDS);
      let remaining = COUNTDOWN_SECONDS;
      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return;
        }
        setCountdownValue(remaining);
      }, 1000);

      countdownTimeoutRef.current = setTimeout(() => {
        void beginRecording();
      }, COUNTDOWN_SECONDS * 1000);
    } catch (err) {
      // Out of metered recording credit - show the upgrade CTA, not an error.
      if (
        isAxiosError(err) &&
        err.response?.status === 402 &&
        err.response.data?.data?.code === "USAGE_EXHAUSTED"
      ) {
        toast.error(
          "You're out of recording credit. Upgrade to Pro for 20 hours every month.",
          8000,
        );
        setError("Recording credit used up - upgrade to keep recording.");
        setRecordingState("idle");
        return;
      }
      const message =
        err instanceof Error ? err.message : "Failed to start recording";
      toast.error("Couldn't start recording - please try again.");
      setError(message);
      setRecordingState("error");
    }
  }, [beginRecording, buildStreams, getInfo, getComposition]);

  // Usage heartbeat while recording: credits metered seconds server-side (a
  // crashed tab still counts what ran), warns near the limit, and reacts to a
  // server-forced stop when credit runs out - captured footage is saved.
  // stopRecording is defined below the effect, so it's reached through a ref.
  const stopRecordingRef = useRef<(() => Promise<void>) | null>(null);
  const usageWarnedRef = useRef(false);
  // Paused takes keep heartbeating: the server meters an ACTIVE session either
  // way, and a forced stop must still reach a paused recorder.
  const isCapturing =
    recordingState === "recording" || recordingState === "paused";
  useEffect(() => {
    if (!isCapturing || !sessionIdRef.current) return;
    const sessionId = sessionIdRef.current;
    usageWarnedRef.current = false;

    let cancelled = false;
    const tick = async () => {
      try {
        const usage = await sendUsageHeartbeat(sessionId);
        if (cancelled || !usage) return;

        if (usage.exhausted) {
          toast.error(
            "Recording credit used up - recording stopped. Everything captured was saved. Upgrade to Pro for 20 hours every month.",
            10000,
          );
          void stopRecordingRef.current?.();
          return;
        }

        if (usage.warning && !usageWarnedRef.current) {
          usageWarnedRef.current = true;
          const minutesLeft = Math.max(
            1,
            Math.ceil((usage.remaining ?? 0) / 60),
          );
          toast.error(
            `About ${minutesLeft} min of recording credit left - the recording will stop and save automatically when it runs out.`,
            10000,
          );
        }
      } catch {
        // Transient network error - the server-side sweep still meters.
      }
    };

    void tick();
    const interval = setInterval(() => void tick(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isCapturing]);

  // Cancelled during the lead-in (before capture began): nothing was recorded,
  // so delete the session outright instead of leaving an empty STOPPED row
  // that would later surface as a FAILED recording in the list.
  const cancelCountdown = useCallback(
    async (nextState: ScreenRecordingState = "idle") => {
      clearCountdown();
      if (sessionIdRef.current) {
        await api
          .delete(`/recording/screen/${sessionIdRef.current}`)
          .catch(() => undefined);
        sessionIdRef.current = null;
        clientSessionIdRef.current = null;
      }
      setRecordingState(nextState);
    },
    [clearCountdown],
  );

  const stopRecording = useCallback(async () => {
    if (recordingState === "countdown") {
      await cancelCountdown();
      return;
    }

    const sessionId = sessionIdRef.current;
    const stopSession = () =>
      sessionId
        ? api
            .post(`/recording/screen/session/${sessionId}/stop`, {})
            .catch(() => undefined)
        : Promise.resolve(undefined);

    try {
      setRecordingState("stopping");
      const recordedCounts = await stopLocal();
      flushPendingChunks();

      // Report how many chunks each track RECORDED, right away. The server
      // completes a track when the last of them lands, so a slow uplink can't
      // cut the end off (reporting the uploaded count used to do exactly that).
      await Promise.allSettled(
        (
          Object.entries(recordingIdsRef.current) as [ScreenTrackType, string][]
        ).map(([trackType, recordingId]) => {
          // Report the LARGEST frame size seen, not the one snapshotted at
          // start: a shared surface resizes mid-capture (tab switch, window
          // resize), and finalization pins the master to this geometry.
          const size = getMaxTrackSize(trackType);
          return withRetries(() =>
            api.post(`/recording/screen/recording/${recordingId}/complete`, {
              expectedSegments: recordedCounts[trackType] ?? 0,
              ...(size ? { width: size.width, height: size.height } : {}),
            }),
          );
        }),
      );

      // Stop metering now; processing starts on its own once every chunk is in.
      await stopSession();

      setRecordingState("uploading");
      const drained = await uploader.waitUntilDrained(UPLOAD_DRAIN_TIMEOUT_MS);
      if (!drained) {
        // Still trickling in: the queue (and IndexedDB, if the tab closes)
        // keeps going, and the server finishes the take when they land.
        toast.error(
          "Some parts of the recording are still uploading - it will finish processing automatically.",
          8000,
        );
      }

      setCompletedSessionId(sessionId);
      setRecordingState("complete");
      recordingIdsRef.current = {};
      sessionIdRef.current = null;
      clientSessionIdRef.current = null;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to stop recording";
      console.error("[ScreenRecordingManager] stop failed:", err);
      // Whatever went wrong client-side, the session must not stay ACTIVE
      // (it would keep metering usage until the recovery sweep reaps it).
      await stopSession();
      toast.error("Couldn't save the recording - please try again.");
      setError(message);
      setRecordingState("error");
    }
  }, [
    recordingState,
    cancelCountdown,
    stopLocal,
    flushPendingChunks,
    uploader,
    getMaxTrackSize,
  ]);
  stopRecordingRef.current = stopRecording;

  const toggleRecording = useCallback(() => {
    // Ignore presses while a transition is mid-flight.
    if (
      ["starting", "countdown", "stopping", "uploading"].includes(
        recordingState,
      )
    ) {
      return;
    }
    if (recordingState === "recording" || recordingState === "paused") {
      void stopRecording();
      return;
    }
    void startRecording();
  }, [recordingState, startRecording, stopRecording]);

  // Paused time isn't metered: tell the server so its clock stops too.
  const notifyPaused = useCallback((paused: boolean) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    void withRetries(() =>
      api.post(
        `/recording/screen/session/${sessionId}/${paused ? "pause" : "resume"}`,
        {},
      ),
    ).catch(() => undefined);
  }, []);

  const pauseRecording = useCallback(() => {
    if (recordingState !== "recording") return;
    pauseLocal();
    setRecordingState("paused");
    notifyPaused(true);
  }, [recordingState, pauseLocal, notifyPaused]);

  const resumeRecording = useCallback(() => {
    if (recordingState !== "paused") return;
    resumeLocal();
    setRecordingState("recording");
    notifyPaused(false);
  }, [recordingState, resumeLocal, notifyPaused]);

  // Throw the current take away: stop capture without uploading the tail,
  // drop whatever is still queued, then delete the session (rows + storage).
  // A restart goes straight to "starting", so the recorder never flashes idle.
  const discardTake = useCallback(
    async (restarting: boolean) => {
      const nextState = restarting ? "starting" : "idle";
      if (recordingState === "countdown") {
        await cancelCountdown(nextState);
        return;
      }
      if (recordingState !== "recording" && recordingState !== "paused") return;

      const sessionId = sessionIdRef.current;
      discardingRef.current = true;
      setRecordingState(restarting ? "starting" : "stopping");
      try {
        await stopLocal();
      } catch {
        /* ignore - the take is being thrown away */
      }
      pendingChunksRef.current = [];
      if (sessionId) {
        await uploader.discardSession(sessionId);
        await api
          .delete(`/recording/screen/${sessionId}`)
          .catch(() => undefined);
      }
      recordingIdsRef.current = {};
      sessionIdRef.current = null;
      clientSessionIdRef.current = null;
      discardingRef.current = false;
      setError(null);
      setRecordingState(nextState);
    },
    [recordingState, cancelCountdown, stopLocal, uploader],
  );

  const discardRecording = useCallback(() => discardTake(false), [discardTake]);

  const restartRecording = useCallback(async () => {
    if (
      recordingState !== "recording" &&
      recordingState !== "paused" &&
      recordingState !== "countdown"
    ) {
      return;
    }
    await discardTake(true);
    void startRecording();
  }, [recordingState, discardTake, startRecording]);

  // Clear timers on unmount.
  useEffect(() => () => clearCountdown(), [clearCountdown]);

  // Upload progress across all tracks.
  const totalChunks =
    recorder.chunkCounts.combined +
    recorder.chunkCounts.camera +
    recorder.chunkCounts.audio;
  const uploadedChunks = Math.max(0, totalChunks - uploader.pendingCount);
  const uploadProgress =
    totalChunks > 0 ? Math.round((uploadedChunks / totalChunks) * 100) : 0;

  return {
    recordingState,
    recordingDurationMs: recorder.recordingDurationMs,
    countdownValue,
    pendingUploads: uploader.pendingCount,
    uploadProgress,
    error,
    completedSessionId,
    toggleRecording,
    pauseRecording,
    resumeRecording,
    discardRecording,
    restartRecording,
  };
}
