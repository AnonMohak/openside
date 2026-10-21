/**
 * HOOK: useScreenLocalRecording
 *
 * Single-user screen-recorder capture. Records up to THREE local tracks:
 *   1. combined - screen video + mic audio (the master you'd watch)
 *   2. camera   - webcam video only (separate, for flexible compositing later)
 *   3. audio    - mic only (for audio replacement / overdub)
 *
 * Each track is an independent MediaRecorder emitting timed chunks, mirroring
 * the Space recorder (useLocalRecording) but driven from explicit per-track
 * MediaStreams instead of a single stream. Timing uses performance.now() so a
 * clock adjustment can't corrupt the segment timeline.
 *
 * Pausing pauses every recorder at once. MediaRecorder leaves the paused span
 * out of the encoded media, so chunk timing runs on a "recorded" clock that
 * stops while paused too - otherwise the finalizer would read the pause as a
 * capture break and pad it with silence, pushing audio out of sync.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { firstSupportedVideoMime } from "@/lib/recorderCodecs";
import type { RecordingChunk, RecordingMetadata } from "./useLocalRecording";

export type ScreenTrackType = "combined" | "camera" | "audio";

/** Per-track input streams. A track is skipped if its stream is null. */
export interface ScreenStreams {
  combined: MediaStream | null;
  camera: MediaStream | null;
  audio: MediaStream | null;
}

interface UseScreenLocalRecordingOptions {
  onChunkReady?: (trackType: ScreenTrackType, chunk: RecordingChunk) => void;
  onRecordingStart?: (
    metadata: Partial<Record<ScreenTrackType, RecordingMetadata>>,
  ) => void;
  onRecordingStop?: (counts: Record<ScreenTrackType, number>) => void;
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
  stopRecording: () => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  /** Largest frame size seen on a video track over the whole take (see the
   *  dimension sampler below). Valid until the next startRecording(). */
  getMaxTrackSize: (trackType: ScreenTrackType) => TrackSize | null;
}

function getBestAudioMimeType() {
  const types = [
    { mimeType: "audio/webm;codecs=opus", codec: "opus", container: "webm" },
    { mimeType: "audio/webm", codec: "opus", container: "webm" },
    { mimeType: "audio/mp4", codec: "aac", container: "mp4" },
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type.mimeType)) return type;
  }
  return { mimeType: "", codec: "unknown", container: "webm" };
}

// Shared H.264-first ladder with the correct 4K level (see recorderCodecs).
// NOTE: this standalone screen recorder drives THREE concurrent recorders
// through one start path, so it uses the preferred codec but does NOT yet run
// the combined recorder's full runtime EncodingError fallback loop - deferred to
// avoid destabilizing the multi-recorder start. See the space recorder
// (useLocalRecording) for the full fallback implementation.
function getBestVideoMimeType() {
  return firstSupportedVideoMime();
}

function videoBitrateFor(width?: number, height?: number): number {
  if (!width || !height) return 4000000;
  const pixels = width * height;
  if (pixels >= 3840 * 2160) return 20000000;
  if (pixels >= 2560 * 1440) return 12000000;
  if (pixels >= 1920 * 1080) return 8000000;
  if (pixels >= 1280 * 720) return 5000000;
  return 4000000;
}

const AUDIO_BITRATE = 128000;
const TRACK_TYPES: ScreenTrackType[] = ["combined", "camera", "audio"];

// MediaRecorder only captures the first audio track of a stream, so when a
// stream carries multiple (e.g. mic + system audio for the screen) we mix them
// down to one track via the Web Audio API. The created AudioContext is pushed
// to `contexts` so it can be closed when recording stops.
function mixAudioTracks(
  stream: MediaStream,
  contexts: AudioContext[],
): MediaStream {
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length <= 1) return stream;

  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctx();
  const dest = ctx.createMediaStreamDestination();
  for (const track of audioTracks) {
    ctx.createMediaStreamSource(new MediaStream([track])).connect(dest);
  }
  contexts.push(ctx);
  return new MediaStream([
    ...stream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);
}

export default function useScreenLocalRecording(
  options: UseScreenLocalRecordingOptions = {},
): UseScreenLocalRecordingReturn {
  const {
    onChunkReady,
    onRecordingStart,
    onRecordingStop,
    onError,
    chunkIntervalMs = 5000,
  } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [chunkCounts, setChunkCounts] = useState<Record<ScreenTrackType, number>>({
    combined: 0,
    camera: 0,
    audio: 0,
  });

  const recordersRef = useRef<Partial<Record<ScreenTrackType, MediaRecorder>>>({});
  const audioContextsRef = useRef<AudioContext[]>([]);
  const startTimeRef = useRef<number>(0);
  // Paused time so far, and when the current pause began (null while running).
  const pausedTotalRef = useRef<number>(0);
  const pausedAtRef = useRef<number | null>(null);
  const sequenceRef = useRef<Record<ScreenTrackType, number>>({
    combined: 0,
    camera: 0,
    audio: 0,
  });
  const chunkStartRef = useRef<Record<ScreenTrackType, number>>({
    combined: 0,
    camera: 0,
    audio: 0,
  });
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Milliseconds of actual capture since start - frozen while paused.
  const recordedMs = useCallback((): number => {
    const now = performance.now();
    const pausedNow = pausedAtRef.current === null ? 0 : now - pausedAtRef.current;
    return now - startTimeRef.current - pausedTotalRef.current - pausedNow;
  }, []);

  // Live video tracks + the largest frame size each has reported. A screen
  // capture RESIZES mid-recording whenever the shared surface changes shape
  // (switching tabs, resizing/maximizing the shared window, a display-scale
  // change), and MediaRecorder encodes that as a mid-stream resolution switch.
  // Finalization has to know the biggest geometry to normalize the master to,
  // so we sample getSettings() instead of trusting the size at start.
  // (Sampled, not event-driven: MediaStreamTrack has no reliable resize event.)
  const videoTracksRef = useRef<Partial<Record<ScreenTrackType, MediaStreamTrack>>>({});
  const maxSizeRef = useRef<Partial<Record<ScreenTrackType, TrackSize>>>({});
  const sizeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sampleTrackSizes = useCallback(() => {
    for (const type of TRACK_TYPES) {
      const track = videoTracksRef.current[type];
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
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    };
  }, [isRecording, isPaused, recordedMs]);

  const buildRecorder = useCallback(
    (
      trackType: ScreenTrackType,
      stream: MediaStream,
      recorderOptions: MediaRecorderOptions,
    ): MediaRecorder => {
      const recorder = new MediaRecorder(stream, recorderOptions);

      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0) return;
        const now = recordedMs();
        const seq = sequenceRef.current[trackType];
        const chunk: RecordingChunk = {
          blob: event.data,
          sequenceNumber: seq,
          startMs: chunkStartRef.current[trackType],
          durationMs: now - chunkStartRef.current[trackType],
          timestamp: performance.now(),
        };
        sequenceRef.current[trackType] = seq + 1;
        chunkStartRef.current[trackType] = now;
        setChunkCounts((prev) => ({ ...prev, [trackType]: seq + 1 }));
        onChunkReady?.(trackType, chunk);
      };

      recorder.onerror = () => {
        onError?.(new Error(`${trackType} MediaRecorder error`), trackType);
      };

      return recorder;
    },
    [onChunkReady, onError, recordedMs],
  );

  const startRecording = useCallback(
    async (streams: ScreenStreams) => {
      if (isRecording) return;

      const metadata: Partial<Record<ScreenTrackType, RecordingMetadata>> = {};
      const recorders: Partial<Record<ScreenTrackType, MediaRecorder>> = {};

      try {
        // Reset counters.
        sequenceRef.current = { combined: 0, camera: 0, audio: 0 };
        setChunkCounts({ combined: 0, camera: 0, audio: 0 });
        videoTracksRef.current = {};
        maxSizeRef.current = {};

        // 1. COMBINED (screen video + mic + system audio, mixed to one track)
        if (streams.combined && streams.combined.getVideoTracks().length > 0) {
          const s = mixAudioTracks(streams.combined, audioContextsRef.current);
          const screenTrack = s.getVideoTracks()[0];
          if (screenTrack) videoTracksRef.current.combined = screenTrack;
          const v = screenTrack?.getSettings() ?? {};
          const a = s.getAudioTracks()[0]?.getSettings() ?? {};
          const mime = getBestVideoMimeType();
          const bitrate = videoBitrateFor(v.width, v.height);
          const recorder = buildRecorder("combined", s, {
            mimeType: mime.mimeType || undefined,
            videoBitsPerSecond: bitrate,
            audioBitsPerSecond: AUDIO_BITRATE,
          });
          recorders.combined = recorder;
          metadata.combined = {
            container: mime.container,
            codec: mime.codec,
            width: v.width,
            height: v.height,
            fps: v.frameRate,
            bitrate,
            sampleRate: a.sampleRate,
            channels: a.channelCount,
            hasAudio: s.getAudioTracks().length > 0,
            hasVideo: true,
            mimeType: recorder.mimeType,
          };
        }

        // 2. CAMERA (webcam video + mic audio)
        if (streams.camera && streams.camera.getVideoTracks().length > 0) {
          const s = streams.camera;
          const cameraTrack = s.getVideoTracks()[0];
          if (cameraTrack) videoTracksRef.current.camera = cameraTrack;
          const v = cameraTrack?.getSettings() ?? {};
          const a = s.getAudioTracks()[0]?.getSettings() ?? {};
          const hasAudio = s.getAudioTracks().length > 0;
          const mime = getBestVideoMimeType();
          const bitrate = videoBitrateFor(v.width, v.height);
          const recorder = buildRecorder("camera", s, {
            mimeType: mime.mimeType || undefined,
            videoBitsPerSecond: bitrate,
            audioBitsPerSecond: AUDIO_BITRATE,
          });
          recorders.camera = recorder;
          metadata.camera = {
            container: mime.container,
            codec: mime.codec,
            width: v.width,
            height: v.height,
            fps: v.frameRate,
            bitrate,
            sampleRate: a.sampleRate,
            channels: a.channelCount,
            hasAudio,
            hasVideo: true,
            mimeType: recorder.mimeType,
          };
        }

        // 3. AUDIO (mic only)
        if (streams.audio && streams.audio.getAudioTracks().length > 0) {
          const s = streams.audio;
          const a = s.getAudioTracks()[0]?.getSettings() ?? {};
          const mime = getBestAudioMimeType();
          const recorder = buildRecorder("audio", s, {
            mimeType: mime.mimeType || undefined,
            audioBitsPerSecond: AUDIO_BITRATE,
          });
          recorders.audio = recorder;
          metadata.audio = {
            container: mime.container,
            codec: mime.codec,
            sampleRate: a.sampleRate,
            channels: a.channelCount,
            bitrate: AUDIO_BITRATE,
            hasAudio: true,
            hasVideo: false,
            mimeType: recorder.mimeType,
          };
        }

        if (Object.keys(recorders).length === 0) {
          throw new Error("No tracks to record");
        }

        recordersRef.current = recorders;

        // Start all recorders on the same timeline.
        startTimeRef.current = performance.now();
        pausedTotalRef.current = 0;
        pausedAtRef.current = null;
        for (const type of TRACK_TYPES) {
          chunkStartRef.current[type] = 0;
          recorders[type]?.start(chunkIntervalMs);
        }

        sampleTrackSizes();
        setRecordingDurationMs(0);
        setIsPaused(false);
        setIsRecording(true);
        onRecordingStart?.(metadata);
      } catch (error) {
        const err =
          error instanceof Error ? error : new Error("Failed to start recording");
        // Best-effort cleanup of anything that started.
        for (const type of TRACK_TYPES) {
          try {
            if (recorders[type]?.state === "recording") recorders[type]?.stop();
          } catch {
            /* ignore */
          }
        }
        recordersRef.current = {};
        audioContextsRef.current.forEach((c) => void c.close().catch(() => {}));
        audioContextsRef.current = [];
        onError?.(err, "combined");
        throw err;
      }
    },
    [
      isRecording,
      chunkIntervalMs,
      buildRecorder,
      onRecordingStart,
      onError,
      sampleTrackSizes,
    ],
  );

  const stopRecording = useCallback(async (): Promise<void> => {
    return new Promise((resolve) => {
      const recorders = recordersRef.current;
      const active = TRACK_TYPES.filter(
        (t) => recorders[t] && recorders[t]?.state !== "inactive",
      );

      if (!isRecording || active.length === 0) {
        resolve();
        return;
      }

      // Last sample while the tracks are still live - a resize in the final
      // second still has to make it into the finalizer's target geometry.
      sampleTrackSizes();

      let stopped = 0;
      const onOneStopped = () => {
        stopped += 1;
        if (stopped < active.length) return;

        // Close an open pause so the clock is final for any last chunk.
        if (pausedAtRef.current !== null) {
          pausedTotalRef.current += performance.now() - pausedAtRef.current;
          pausedAtRef.current = null;
        }
        setIsRecording(false);
        setIsPaused(false);
        recordersRef.current = {};
        audioContextsRef.current.forEach((c) => void c.close().catch(() => {}));
        audioContextsRef.current = [];
        videoTracksRef.current = {};
        onRecordingStop?.({ ...sequenceRef.current });
        resolve();
      };

      for (const type of active) {
        const recorder = recorders[type];
        if (!recorder) continue;
        recorder.onstop = onOneStopped;
        try {
          recorder.stop();
        } catch {
          onOneStopped();
        }
      }
    });
  }, [isRecording, onRecordingStop, sampleTrackSizes]);

  const pauseRecording = useCallback(() => {
    if (!isRecording || pausedAtRef.current !== null) return;
    for (const type of TRACK_TYPES) {
      const recorder = recordersRef.current[type];
      if (recorder?.state === "recording") recorder.pause();
    }
    pausedAtRef.current = performance.now();
    setRecordingDurationMs(recordedMs());
    setIsPaused(true);
  }, [isRecording, recordedMs]);

  const resumeRecording = useCallback(() => {
    if (!isRecording || pausedAtRef.current === null) return;
    pausedTotalRef.current += performance.now() - pausedAtRef.current;
    pausedAtRef.current = null;
    for (const type of TRACK_TYPES) {
      const recorder = recordersRef.current[type];
      if (recorder?.state === "paused") recorder.resume();
    }
    setIsPaused(false);
  }, [isRecording]);

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
