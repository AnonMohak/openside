import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent,
  type Ref,
} from "react";
import {
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SPEEDS = [1, 1.25, 1.5, 2, 0.75];
const HIDE_CONTROLS_MS = 2500;

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}`
    : `${minutes}:${secs}`;
};

/**
 * The recordings player: a native <video> with a minimal custom control bar
 * (play, scrubber, volume, time, speed, fullscreen) that hides while playing.
 * Keyboard: space/k play, ←/→ seek 5s, m mute, f fullscreen.
 */
export interface VideoPlayerHandle {
  /** Current position in seconds, or null if playback never started. */
  getTime: () => number | null;
  /** Jump to `seconds`, bring the player into view, and play. */
  playFrom: (seconds: number) => void;
}

const VideoPlayer = ({
  src,
  ref,
}: {
  src: string;
  ref?: Ref<VideoPlayerHandle>;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [hoverTime, setHoverTime] = useState<{
    x: number;
    time: number;
  } | null>(null);

  useEffect(() => {
    const onChange = () =>
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(
    () => () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    },
    [],
  );

  // Controls stay up while paused; while playing they fade after idle.
  const showControls = () => {
    setControlsVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControlsVisible(false);
      }
    }, HIDE_CONTROLS_MS);
  };

  useImperativeHandle(ref, () => ({
    getTime: () => {
      const video = videoRef.current;
      return video && video.currentTime > 0 ? video.currentTime : null;
    },
    playFrom: (seconds) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = Math.min(
        Math.max(0, seconds),
        video.duration || seconds,
      );
      setCurrentTime(video.currentTime);
      void video.play().catch(() => undefined);
      containerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
      containerRef.current?.focus({ preventScroll: true });
      showControls();
    },
  }));

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
    showControls();
  };

  const seekBy = (delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(
      Math.max(0, video.currentTime + delta),
      video.duration || 0,
    );
    showControls();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) video.volume = 1;
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void containerRef.current?.requestFullscreen().catch(() => undefined);
  };

  const cycleSpeed = () => {
    const next = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(next);
    if (videoRef.current) videoRef.current.playbackRate = SPEEDS[next];
  };

  // Scrubber: map a pointer position on the track to a time.
  const timeAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || !duration) return { x: 0, time: 0 };
    const x = Math.min(Math.max(0, clientX - rect.left), rect.width);
    return { x, time: (x / rect.width) * duration };
  };

  const seekTo = (clientX: number) => {
    const { time } = timeAt(clientX);
    if (videoRef.current) videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const onTrackPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsScrubbing(true);
    seekTo(event.clientX);
  };

  const onTrackPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    setHoverTime(timeAt(event.clientX));
    if (isScrubbing) seekTo(event.clientX);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const key = event.key.toLowerCase();
    if (key === " " || key === "k") togglePlay();
    else if (key === "arrowright") seekBy(5);
    else if (key === "arrowleft") seekBy(-5);
    else if (key === "m") toggleMute();
    else if (key === "f") toggleFullscreen();
    else return;
    event.preventDefault();
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration ? (buffered / duration) * 100 : 0;
  const showBar = controlsVisible || !isPlaying || isScrubbing;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerMove={showControls}
      onPointerLeave={() => isPlaying && setControlsVisible(false)}
      className={cn(
        "relative h-full w-full overflow-hidden bg-black outline-none",
        !showBar && "cursor-none",
      )}
    >
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="metadata"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onPlay={() => {
          setIsPlaying(true);
          showControls();
        }}
        onPause={() => {
          setIsPlaying(false);
          setControlsVisible(true);
        }}
        onWaiting={() => setIsWaiting(true)}
        onPlaying={() => setIsWaiting(false)}
        onCanPlay={() => setIsWaiting(false)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => {
          if (!isScrubbing) setCurrentTime(event.currentTarget.currentTime);
        }}
        onProgress={(event) => {
          const ranges = event.currentTarget.buffered;
          if (ranges.length) setBuffered(ranges.end(ranges.length - 1));
        }}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume);
          setIsMuted(event.currentTarget.muted);
        }}
        className="h-full w-full object-contain"
      />

      {/* Centre play button / buffering spinner */}
      {isWaiting && isPlaying ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="size-9 animate-spin text-white/80" />
        </div>
      ) : (
        !isPlaying && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label="Play"
            className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/15 backdrop-blur-md transition-transform hover:scale-105 cursor-pointer"
          >
            <Play size={22} className="ml-0.5 fill-current" />
          </button>
        )
      )}

      {/* Control bar */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-3 pb-2.5 pt-10 transition-opacity duration-200",
          showBar ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        {/* Scrubber */}
        <div
          ref={trackRef}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={() => setIsScrubbing(false)}
          onPointerLeave={() => setHoverTime(null)}
          className="group/track relative flex h-4 cursor-pointer items-center"
        >
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/20 transition-[height] group-hover/track:h-1.5">
            <div
              className="absolute inset-y-0 left-0 bg-white/30"
              style={{ width: `${bufferedPercent}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 bg-white"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span
            className={cn(
              "pointer-events-none absolute size-3 -translate-x-1/2 rounded-full bg-white shadow transition-transform",
              isScrubbing ? "scale-100" : "scale-0 group-hover/track:scale-100",
            )}
            style={{ left: `${progress}%` }}
          />
          {hoverTime && duration > 0 && (
            <span
              className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md bg-black/80 px-1.5 py-0.5 text-[0.7rem] font-medium tabular-nums text-white"
              style={{ left: hoverTime.x }}
            >
              {formatTime(hoverTime.time)}
            </span>
          )}
        </div>

        {/* Buttons */}
        <div className="mt-1 flex items-center gap-1 text-white">
          <ControlButton
            label={isPlaying ? "Pause" : "Play"}
            onClick={togglePlay}
          >
            {isPlaying ? (
              <Pause size={17} className="fill-current" />
            ) : (
              <Play size={17} className="fill-current" />
            )}
          </ControlButton>

          <div className="group/volume flex items-center">
            <ControlButton
              label={isMuted || volume === 0 ? "Unmute" : "Mute"}
              onClick={toggleMute}
            >
              {isMuted || volume === 0 ? (
                <VolumeX size={17} />
              ) : (
                <Volume2 size={17} />
              )}
            </ControlButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(event) => {
                const video = videoRef.current;
                if (!video) return;
                video.volume = Number(event.target.value);
                video.muted = video.volume === 0;
              }}
              aria-label="Volume"
              className="h-1 w-0 cursor-pointer rounded-full accent-white opacity-0 transition-all duration-200 group-hover/volume:mr-2 group-hover/volume:w-16 group-hover/volume:opacity-100 focus:mr-2 focus:w-16 focus:opacity-100"
            />
          </div>

          <span className="ml-1 text-xs font-medium tabular-nums text-white/85">
            {formatTime(currentTime)}
            <span className="text-white/50"> / {formatTime(duration)}</span>
          </span>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={cycleSpeed}
              aria-label="Playback speed"
              title="Playback speed"
              className="h-7 min-w-10 rounded-md px-1.5 text-xs font-semibold tabular-nums text-white/90 transition-colors hover:bg-white/15 cursor-pointer"
            >
              {SPEEDS[speedIndex]}x
            </button>
            <ControlButton
              label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </ControlButton>
          </div>
        </div>
      </div>
    </div>
  );
};

const ControlButton = ({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-white/15 cursor-pointer"
  >
    {children}
  </button>
);

export default VideoPlayer;
