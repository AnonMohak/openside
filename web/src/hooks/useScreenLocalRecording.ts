/**
 * HOOK: useScreenLocalRecording
 *
 * Single-user screen-recorder capture. Records up to two local tracks:
 *   1. combined - screen video + mic/system audio (the master you'd watch)
 *   2. camera   - webcam video (+ mic when there's no screen)
 *
 * PARTS:
 * Each track records in "parts" - one MediaRecorder per part, each a
 * self-contained stream (its first chunk carries a fresh container header).
 * Every part's chunks continue the track's one sequence on one timeline, and
 * the server lays the parts out end to end (see media-compose.ts). A new part
 * starts when:
 *   - the encoder dies mid-take (the next part walks down the codec ladder),
 *   - a source track ends (e.g. a mic unplugged - recording carries on with
 *     what's still live),
 *   - the take is paused and resumed (a paused span is simply not recorded),
 *   - the part has run for ROTATE_PART_MS, so a chunk lost in transit can only
 *     damage the rest of its own part, never the whole take.
 *
 * TIMING:
 * Chunk offsets run on a "recorded" clock - performance.now() (monotonic,
 * immune to clock adjustments) minus paused time - so parts on either side of
 * a pause sit back to back with no gap to pad.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSupportedAudioMimeTypes,
  getSupportedVideoMimeTypes,
  startRecorderWithFallback,
} from "@/lib/recorderCodecs";
import type { LocalChunk, RecordingMetadata } from "./useLocalRecording";

export type ScreenTrackType = "combined" | "camera" | "audio";

/** Per-track input streams. A track is skipped if its stream is null. */
export interface ScreenStreams {
  combined: MediaStream | null;
  camera: MediaStream | null;
  audio: MediaStream | null;
}

interface UseScreenLocalRecordingOptions {
  onChunkReady?: (trackType: ScreenTrackType, chunk: LocalChunk) => void;
  onRecordingStart?: (
    metadata: Partial<Record<ScreenTrackType, RecordingMetadata>>,
  ) => void;
  /** A track's recorder couldn't run at all, even after retries. */
  onError?: (error: Error, trackType: ScreenTrackType) => void;
  chunkIntervalMs?: number;
}

interface TrackSize {
  width: number;
  height: number;
}

interface UseScreenLocalRecordingReturn {
  isRecording: boolean;
  isPaused: boolean;
  recordingDurationMs: number;
  chunkCounts: Record<ScreenTrackType, number>;
  startRecording: (streams: ScreenStreams) => Promise<void>;
  /** Stops every recorder; resolves with how many chunks each one emitted. */
  stopRecording: () => Promise<Record<ScreenTrackType, number>>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  /** Largest frame size seen on a video track over the whole take (see the
   *  dimension sampler below). Valid until the next startRecording(). */
  getMaxTrackSize: (trackType: ScreenTrackType) => TrackSize | null;
}

/** What a track's video is for - it decides how many bits it's worth. */
type VideoRole = "screen" | "pip" | "camera";

/**
 * Upload size is what decides how long Stop waits, so each role gets only the
 * bits it needs. Screen content (text, flat UI) compresses far better than a
 * camera; a camera that ends up as a small PiP needs very little.
 */
function videoBitrateFor(
  role: VideoRole,
  width?: number,
  height?: number,
): number {
  if (role === "pip") return 2000000;
  const pixels = width && height ? width * height : 1280 * 720;
  if (role === "screen") {
    if (pixels >= 3840 * 2160) return 10000000;
    if (pixels >= 2560 * 1440) return 6000000;
    if (pixels >= 1920 * 1080) return 4000000;
    return 2500000;
  }
  if (pixels >= 3840 * 2160) return 16000000;
  if (pixels >= 2560 * 1440) return 10000000;
  if (pixels >= 1920 * 1080) return 6000000;
  return 4000000;
}

/** Short side a PiP camera is captured at: it never shows bigger than this. */
const PIP_CAMERA_SHORT_SIDE = 720;

/**
 * Capture the camera at PiP size for the take; returns a restore for after it.
 * The camera is also the live preview, so it's put back when the take ends.
 */
async function capPipCamera(track: MediaStreamTrack): Promise<() => void> {
  const { width, height } = track.getSettings();
  if (!width || !height || Math.min(width, height) <= PIP_CAMERA_SHORT_SIDE) {
    return () => undefined;
  }
  const original = track.getConstraints();
  const scale = PIP_CAMERA_SHORT_SIDE / Math.min(width, height);
  try {
    await track.applyConstraints({
      ...original,
      width: { ideal: Math.round(width * scale) },
      height: { ideal: Math.round(height * scale) },
      aspectRatio: { ideal: width / height },
    });
  } catch (error) {
    // The server sizes the PiP down anyway; this only saves upload.
    console.warn("[ScreenRecording] couldn't cap the PiP camera:", error);
    return () => undefined;
  }
  return () => {
    if (track.readyState !== "live") return;
    void track.applyConstraints(original).catch(() => undefined);
  };
}

const AUDIO_BITRATE = 128000;
const TRACK_TYPES: ScreenTrackType[] = ["combined", "camera", "audio"];
/** A part this old is rotated, bounding what one lost chunk can damage. */
const ROTATE_PART_MS = 10 * 60 * 1000;
/** Retries when no codec at all could start for a track. */
const MAX_FATAL_RETRIES = 3;
const FATAL_RETRY_DELAY_MS = 2000;
/** onstop can fail to fire on a recorder whose encoder crashed. */
const STOP_TIMEOUT_MS = 3000;

const emptyCounts = (): Record<ScreenTrackType, number> => ({
  combined: 0,
  camera: 0,
  audio: 0,
});

/**
 * MediaRecorder only captures the first audio track of a stream, so several
 * (mic + system audio) are mixed down to one via the Web Audio API. Returns
 * the stream to record and a cleanup that closes the mixer.
 */
function mixAudioTracks(stream: MediaStream): {
  stream: MediaStream;
  close: () => void;
} {
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length <= 1) return { stream, close: () => undefined };

  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctx();
  // Created after the countdown, not in the click itself - make sure it runs.
  void ctx.resume().catch(() => undefined);
  const dest = ctx.createMediaStreamDestination();
  for (const track of audioTracks) {
    ctx.createMediaStreamSource(new MediaStream([track])).connect(dest);
  }
  return {
    stream: new MediaStream([
      ...stream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]),
    close: () => void ctx.close().catch(() => undefined),
  };
}

function stopRecorder(recorder: MediaRecorder | null): Promise<void> {
  if (!recorder || recorder.state === "inactive") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timeout);
      resolve();
    };
    // onstop fires after the final ondataavailable, so the last chunk is
    // captured before we resolve.
    const timeout = setTimeout(done, STOP_TIMEOUT_MS);
    recorder.addEventListener("stop", done, { once: true });
    try {
      recorder.stop();
    } catch {
      done();
    }
  });
}

interface RecorderPart {
  recorder: MediaRecorder | null;
  mimeType: string;
  /** Recorded-clock start of the chunk being captured now. */
  chunkStart: number;
  startedAt: number;
  stopped: boolean;
  /** No codec could start (or the encoder died) - this part records nothing. */
  dead: boolean;
  cleanup: () => void;
}

interface TrackState {
  type: ScreenTrackType;
  videoRole: VideoRole;
  /** The track's source stream (before any audio mixing). */
  source: MediaStream;
  part: RecorderPart | null;
  sequence: number;
  /** Codecs that died mid-take on this track; later parts skip them. */
  failedMimes: Set<string>;
  fatalRetries: number;
  /** Every part start/stop runs in order, so two can't interleave. */
  chain: Promise<void>;
}

export default function useScreenLocalRecording(
  options: UseScreenLocalRecordingOptions = {},
): UseScreenLocalRecordingReturn {
  const { chunkIntervalMs = 5000 } = options;
  // Callbacks via a ref: recorder event handlers live far longer than a render.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [chunkCounts, setChunkCounts] =
    useState<Record<ScreenTrackType, number>>(emptyCounts);

  const activeRef = useRef(false);
  // Undoes the PiP camera cap (see capPipCamera).
  const restoreCameraRef = useRef<() => void>(() => undefined);
  const tracksRef = useRef<Partial<Record<ScreenTrackType, TrackState>>>({});
  const metadataRef = useRef<
    Partial<Record<ScreenTrackType, RecordingMetadata>>
  >({});
  const startTimeRef = useRef<number>(0);
  // Paused time so far, and when the current pause began (null while running).
  const pausedTotalRef = useRef<number>(0);
  const pausedAtRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  // Milliseconds of actual capture since start - frozen while paused.
  const recordedMs = useCallback((): number => {
    const now = performance.now();
    const pausedNow =
      pausedAtRef.current === null ? 0 : now - pausedAtRef.current;
    return now - startTimeRef.current - pausedTotalRef.current - pausedNow;
  }, []);

  // The largest frame size each video track has reported. A screen capture
  // RESIZES mid-recording whenever the shared surface changes shape (switching
  // tabs, resizing/maximizing the shared window, a display-scale change), and
  // finalization has to know the biggest geometry to normalize the master to.
  // (Sampled, not event-driven: MediaStreamTrack has no reliable resize event.)
  const maxSizeRef = useRef<Partial<Record<ScreenTrackType, TrackSize>>>({});
  const sizeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sampleTrackSizes = useCallback(() => {
    for (const type of TRACK_TYPES) {
      const track = tracksRef.current[type]?.source.getVideoTracks()[0];
      if (!track || track.readyState !== "live") continue;
      const { width, height } = track.getSettings();
      if (!width || !height) continue;
      const current = maxSizeRef.current[type];
      if (!current || width * height > current.width * current.height) {
        maxSizeRef.current[type] = { width, height };
      }
    }
  }, []);

  const getMaxTrackSize = useCallback(
    (trackType: ScreenTrackType): TrackSize | null =>
      maxSizeRef.current[trackType] ?? null,
    [],
  );

  useEffect(() => {
    if (isRecording) {
      sizeIntervalRef.current = setInterval(sampleTrackSizes, 1000);
    } else if (sizeIntervalRef.current) {
      clearInterval(sizeIntervalRef.current);
      sizeIntervalRef.current = null;
    }
    return () => {
      if (sizeIntervalRef.current) clearInterval(sizeIntervalRef.current);
    };
  }, [isRecording, sampleTrackSizes]);

  useEffect(() => {
    if (isRecording && !isPaused) {
      durationIntervalRef.current = setInterval(() => {
        setRecordingDurationMs(recordedMs());
      }, 100);
    } else if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    return () => {
      if (durationIntervalRef.current)
        clearInterval(durationIntervalRef.current);
    };
  }, [isRecording, isPaused, recordedMs]);

  const runOnTrack = useCallback(
    (track: TrackState, op: () => Promise<void>): Promise<void> => {
      const next = track.chain.then(op).catch((error) => {
        console.error(`[ScreenRecording] ${track.type} part op failed:`, error);
      });
      track.chain = next;
      return next;
    },
    [],
  );

  const emitChunk = useCallback(
    (track: TrackState, part: RecorderPart, blob: Blob) => {
      const now = recordedMs();
      const chunk: LocalChunk = {
        blob,
        sequenceNumber: track.sequence,
        startMs: Math.max(0, part.chunkStart),
        durationMs: Math.max(0, now - part.chunkStart),
        timestamp: performance.now(),
        mimeType: part.mimeType,
      };
      track.sequence += 1;
      part.chunkStart = now;
      const sequence = track.sequence;
      setChunkCounts((prev) => ({ ...prev, [track.type]: sequence }));
      optionsRef.current.onChunkReady?.(track.type, chunk);
    },
    [recordedMs],
  );

  // Forward refs so part handlers can reach the logic defined below.
  const rotateRef = useRef<(track: TrackState) => void>(() => undefined);
  const retryAfterFatalRef = useRef<
    (track: TrackState, part: RecorderPart, error: Error) => void
  >(() => undefined);

  /** Start a part on the track's live source tracks (null if none are left). */
  const startPart = useCallback(
    (track: TrackState): RecorderPart | null => {
      const live = track.source
        .getTracks()
        .filter((sourceTrack) => sourceTrack.readyState === "live");
      if (live.length === 0) return null;

      const mixed = mixAudioTracks(new MediaStream(live));
      const stream = mixed.stream;
      const hasVideo = stream.getVideoTracks().length > 0;
      const video = stream.getVideoTracks()[0]?.getSettings() ?? {};
      const audio = stream.getAudioTracks()[0]?.getSettings() ?? {};
      const videoBitrate = videoBitrateFor(
        track.videoRole,
        video.width,
        video.height,
      );

      const ladder = hasVideo
        ? getSupportedVideoMimeTypes()
        : getSupportedAudioMimeTypes();
      const candidates = ladder.filter(
        (candidate) =>
          !candidate.mimeType || !track.failedMimes.has(candidate.mimeType),
      );

      const part: RecorderPart = {
        recorder: null,
        mimeType: "",
        chunkStart: recordedMs(),
        startedAt: performance.now(),
        stopped: false,
        dead: false,
        cleanup: () => undefined,
      };

      // A source track ending (a mic unplugged) leaves this part recording a
      // dead track: move to a new part on whatever is still live.
      const onEnded = () => {
        if (track.part === part && !part.stopped) rotateRef.current(track);
      };
      for (const sourceTrack of live) {
        sourceTrack.addEventListener("ended", onEnded);
      }
      part.cleanup = () => {
        for (const sourceTrack of live) {
          sourceTrack.removeEventListener("ended", onEnded);
        }
        mixed.close();
      };

      const started = startRecorderWithFallback({
        stream,
        candidates,
        recorderOptions: hasVideo
          ? {
              videoBitsPerSecond: videoBitrate,
              audioBitsPerSecond: AUDIO_BITRATE,
            }
          : { audioBitsPerSecond: AUDIO_BITRATE },
        timesliceMs: chunkIntervalMs,
        handlers: {
          onActiveRecorder: (recorder, candidate) => {
            part.recorder = recorder;
            part.mimeType = recorder.mimeType || candidate.mimeType;
            part.chunkStart = recordedMs();
            if (!metadataRef.current[track.type]) {
              metadataRef.current[track.type] = {
                container: candidate.container,
                codec: candidate.codec,
                width: video.width,
                height: video.height,
                fps: video.frameRate,
                bitrate: hasVideo ? videoBitrate : AUDIO_BITRATE,
                sampleRate: audio.sampleRate,
                channels: audio.channelCount,
                hasAudio: stream.getAudioTracks().length > 0,
                hasVideo,
                mimeType: part.mimeType,
              };
            }
          },
          onFirstData: () => {
            track.fatalRetries = 0;
          },
          onData: (blob) => emitChunk(track, part, blob),
          onMidSessionFailure: (error) => {
            if (part.stopped) return;
            console.warn(
              `[ScreenRecording] ${track.type} encoder failed mid-take:`,
              error,
            );
            if (part.mimeType) track.failedMimes.add(part.mimeType);
            rotateRef.current(track);
          },
          onFatal: (error) => {
            part.dead = true;
            if (part.stopped) return;
            retryAfterFatalRef.current(track, part, error);
          },
        },
      });
      if (!started) part.dead = true;
      return part;
    },
    [chunkIntervalMs, emitChunk, recordedMs],
  );

  const stopPart = useCallback(async (part: RecorderPart | null) => {
    if (!part || part.stopped) return;
    part.stopped = true;
    await stopRecorder(part.recorder);
    part.cleanup();
  }, []);

  /** New part first, then stop the old one: the overlap is trimmed when the
   *  take is finalized, while a gap would be lost footage. */
  const replacePart = useCallback(
    async (track: TrackState) => {
      if (!activeRef.current || pausedAtRef.current !== null) return;
      const current = track.part;
      const next = startPart(track);
      track.part = next;
      await stopPart(current);
      // No codec could even construct (onFatal fired before this part was
      // current, so it couldn't schedule its own retry).
      if (next?.dead && track.part === next) {
        retryAfterFatalRef.current(
          track,
          next,
          new Error("No recorder could start"),
        );
      }
    },
    [startPart, stopPart],
  );

  rotateRef.current = (track: TrackState) => {
    void runOnTrack(track, () => replacePart(track));
  };

  retryAfterFatalRef.current = (
    track: TrackState,
    part: RecorderPart,
    error: Error,
  ) => {
    if (track.part !== part) return;
    if (track.fatalRetries >= MAX_FATAL_RETRIES) {
      console.error(
        `[ScreenRecording] no recorder could start for ${track.type}:`,
        error,
      );
      optionsRef.current.onError?.(error, track.type);
      return;
    }
    track.fatalRetries += 1;
    setTimeout(() => {
      void runOnTrack(track, async () => {
        if (track.part !== part || !activeRef.current) return;
        // A failed codec isn't necessarily permanent (a busy hardware
        // encoder) - give the whole ladder another go.
        track.failedMimes.clear();
        await replacePart(track);
      });
    }, FATAL_RETRY_DELAY_MS);
  };

  // Rotate long-running parts.
  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      if (pausedAtRef.current !== null) return;
      const now = performance.now();
      for (const track of Object.values(tracksRef.current)) {
        if (track.part && now - track.part.startedAt >= ROTATE_PART_MS) {
          rotateRef.current(track);
        }
      }
    }, 15_000);
    return () => clearInterval(interval);
  }, [isRecording]);

  const startRecording = useCallback(
    async (streams: ScreenStreams) => {
      if (activeRef.current) return;

      const tracks: Partial<Record<ScreenTrackType, TrackState>> = {};
      for (const type of TRACK_TYPES) {
        const source = streams[type];
        if (!source || source.getTracks().length === 0) continue;
        tracks[type] = {
          type,
          // Under a screen take the camera is only the PiP.
          videoRole:
            type === "combined"
              ? "screen"
              : streams.combined
                ? "pip"
                : "camera",
          source,
          part: null,
          sequence: 0,
          failedMimes: new Set(),
          fatalRetries: 0,
          chain: Promise.resolve(),
        };
      }
      if (Object.keys(tracks).length === 0) {
        throw new Error("No tracks to record");
      }

      const pipTrack = tracks.camera?.source.getVideoTracks()[0];
      restoreCameraRef.current =
        tracks.camera?.videoRole === "pip" && pipTrack
          ? await capPipCamera(pipTrack)
          : () => undefined;

      activeRef.current = true;
      tracksRef.current = tracks;
      metadataRef.current = {};
      maxSizeRef.current = {};
      startTimeRef.current = performance.now();
      pausedTotalRef.current = 0;
      pausedAtRef.current = null;
      setChunkCounts(emptyCounts());

      await Promise.all(
        Object.values(tracks).map((track) =>
          runOnTrack(track, () => replacePart(track)),
        ),
      );

      // Every track failed outright - nothing is being recorded.
      if (
        Object.values(tracks).every((track) => !track.part || track.part.dead)
      ) {
        activeRef.current = false;
        for (const track of Object.values(tracks)) await stopPart(track.part);
        tracksRef.current = {};
        restoreCameraRef.current();
        restoreCameraRef.current = () => undefined;
        throw new Error("No recorder could start");
      }

      sampleTrackSizes();
      setRecordingDurationMs(0);
      setIsPaused(false);
      setIsRecording(true);
      optionsRef.current.onRecordingStart?.(metadataRef.current);
    },
    [replacePart, runOnTrack, sampleTrackSizes, stopPart],
  );

  const stopRecording = useCallback(async (): Promise<
    Record<ScreenTrackType, number>
  > => {
    const tracks = Object.values(tracksRef.current);
    const counts = (): Record<ScreenTrackType, number> => {
      const result = emptyCounts();
      for (const track of tracks) result[track.type] = track.sequence;
      return result;
    };
    if (!activeRef.current) return counts();

    // Last sample while the tracks are still live - a resize in the final
    // second still has to make it into the finalizer's target geometry.
    sampleTrackSizes();
    activeRef.current = false;

    await Promise.all(
      tracks.map((track) =>
        runOnTrack(track, async () => {
          const part = track.part;
          track.part = null;
          await stopPart(part);
        }),
      ),
    );

    restoreCameraRef.current();
    restoreCameraRef.current = () => undefined;

    // Close an open pause so the clock is final.
    if (pausedAtRef.current !== null) {
      pausedTotalRef.current += performance.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
    setIsRecording(false);
    setIsPaused(false);
    return counts();
  }, [runOnTrack, sampleTrackSizes, stopPart]);

  // Pausing ends each track's part (its last chunk flushes) and resuming
  // starts a new one: the paused span is never recorded, and the recorded
  // clock puts the next part right where the last one ended.
  const pauseRecording = useCallback(() => {
    if (!activeRef.current || pausedAtRef.current !== null) return;
    for (const track of Object.values(tracksRef.current)) {
      void runOnTrack(track, async () => {
        const part = track.part;
        track.part = null;
        await stopPart(part);
      });
    }
    pausedAtRef.current = performance.now();
    setRecordingDurationMs(recordedMs());
    setIsPaused(true);
  }, [recordedMs, runOnTrack, stopPart]);

  const resumeRecording = useCallback(() => {
    if (!activeRef.current || pausedAtRef.current === null) return;
    pausedTotalRef.current += performance.now() - pausedAtRef.current;
    pausedAtRef.current = null;
    for (const track of Object.values(tracksRef.current)) {
      void runOnTrack(track, () => replacePart(track));
    }
    setIsPaused(false);
  }, [replacePart, runOnTrack]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      activeRef.current = false;
      for (const track of Object.values(tracksRef.current)) {
        const part = track.part;
        track.part = null;
        if (!part) continue;
        part.stopped = true;
        try {
          if (part.recorder?.state !== "inactive") part.recorder?.stop();
        } catch {
          /* already stopped */
        }
        part.cleanup();
      }
    };
  }, []);

  return {
    isRecording,
    isPaused,
    recordingDurationMs,
    chunkCounts,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    getMaxTrackSize,
  };
}
