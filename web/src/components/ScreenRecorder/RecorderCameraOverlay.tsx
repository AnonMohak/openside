import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Circle,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Square,
  Trash2,
  VideoOff,
} from "lucide-react";
import useDraggable from "@/hooks/useDraggable";
import { cn } from "@/lib/utils";
import { useLocalMedia } from "./LocalMediaProvider";
import {
  useScreenRecordingContext,
  type PipShape,
} from "./ScreenRecordingProvider";

const formatDuration = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

const SHAPE_OPTIONS: { value: PipShape; label: string; icon: ReactNode }[] = [
  { value: "circle", label: "Circle", icon: <Circle size={15} /> },
  { value: "square", label: "Square", icon: <Square size={15} /> },
];

/**
 * The camera bubble (bottom-right to start, draggable anywhere) with the
 * take's controls under it once recording: pause / stop / delete. Starting
 * lives in the settings card. In screen-only layout there's no camera, so
 * only the controls show.
 */
interface RecorderCameraOverlayProps {
  isClosing: boolean;
}

const RecorderCameraOverlay = ({ isClosing }: RecorderCameraOverlayProps) => {
  const { cameraStream, toggleCamera } = useLocalMedia();
  const {
    recordingState,
    isActive,
    recordingDurationMs,
    uploadProgress,
    stopRecording,
    pauseRecording,
    resumeRecording,
    discardRecording,
    layout,
    cameraSize,
    setCameraSize,
    cameraShape,
    setCameraShape,
  } = useScreenRecordingContext();
  const { ref, style, isDragging, handleProps } = useDraggable<HTMLDivElement>({
    corner: "bottom-right",
  });
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const isCapturing =
    recordingState === "recording" || recordingState === "paused";
  const isPaused = recordingState === "paused";
  const isStarting =
    recordingState === "starting" || recordingState === "countdown";
  const isSaving =
    recordingState === "stopping" || recordingState === "uploading";

  // A take that ended (stopped or deleted) can't be deleted any more.
  useEffect(() => {
    if (!isCapturing && !isStarting) setIsConfirmingDelete(false);
  }, [isCapturing, isStarting]);

  const showsCamera = layout !== "screen";
  const isBig = cameraSize === "big";

  const renderControls = () => {
    if (isConfirmingDelete) {
      return (
        <div className="flex items-center gap-2 pl-2">
          <span className="text-xs font-medium text-foreground">
            Delete this take?
          </span>
          <button
            type="button"
            onClick={() => setIsConfirmingDelete(false)}
            className="h-8 cursor-pointer rounded-full bg-muted px-3 text-xs font-medium text-foreground transition-colors hover:bg-primary-hover"
          >
            Keep
          </button>
          <button
            type="button"
            onClick={() => {
              setIsConfirmingDelete(false);
              void discardRecording();
            }}
            className="h-8 cursor-pointer rounded-full bg-red-500 px-3 text-xs font-medium text-white transition-colors hover:bg-red-600"
          >
            Delete
          </button>
        </div>
      );
    }

    if (isCapturing || isStarting) {
      return (
        <>
          <span className="flex items-center gap-1.5 px-2 text-xs font-medium tabular-nums text-foreground">
            <span
              className={cn(
                "size-2 rounded-full",
                isStarting
                  ? "bg-foreground/40"
                  : isPaused
                    ? "bg-amber-400"
                    : "animate-pulse bg-red-500",
              )}
            />
            {isStarting ? "Starting…" : formatDuration(recordingDurationMs)}
          </span>
          <ControlButton
            label={isPaused ? "Resume" : "Pause"}
            onClick={isPaused ? resumeRecording : pauseRecording}
            disabled={!isCapturing}
          >
            {isPaused ? (
              <Play size={15} className="fill-current" />
            ) : (
              <Pause size={15} className="fill-current" />
            )}
          </ControlButton>
          <ControlButton
            label="Stop and save"
            onClick={stopRecording}
            disabled={!isCapturing}
            variant="stop"
          >
            <Square size={13} className="fill-current" />
          </ControlButton>
          <ControlButton
            label="Delete recording"
            onClick={() => setIsConfirmingDelete(true)}
            disabled={recordingState === "starting"}
          >
            <Trash2 size={15} />
          </ControlButton>
        </>
      );
    }

    if (isSaving) {
      const percent = recordingState === "uploading" ? uploadProgress : 0;
      return (
        <div className="flex w-44 flex-col gap-1.5 px-2 py-1">
          <div className="flex items-center justify-between text-xs font-medium text-foreground">
            <span>Saving…</span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    // The outer box only positions (and is dragged); the inner one only
    // animates, so the open/close scale never mixes with the drag offset.
    <div
      ref={ref}
      style={style}
      {...handleProps}
      className={cn(
        "group/camera fixed z-[90] touch-none select-none",
        isClosing && "pointer-events-none",
        isDragging ? "cursor-grabbing" : "cursor-grab",
      )}
    >
      <div
        className={cn(
          "flex flex-col items-center gap-2",
          isClosing
            ? "animate-out fade-out-0 zoom-out-95 fill-mode-forwards duration-150 ease-in"
            : "animate-in fade-in-0 zoom-in-95 duration-200 ease-out",
        )}
      >
        {/* Shape + size, above the camera on hover. They're part of the
          take's layout, so they're gone while recording. */}
        {showsCamera && !isActive && (
          <div className="flex items-center gap-0.5 rounded-full border border-call-border bg-call-background p-1 opacity-0 shadow-lg transition-opacity duration-150 group-hover/camera:opacity-100 has-[:focus-visible]:opacity-100">
            {SHAPE_OPTIONS.map((option) => (
              <CameraToolButton
                key={option.value}
                label={option.label}
                active={cameraShape === option.value}
                onClick={() => setCameraShape(option.value)}
              >
                {option.icon}
              </CameraToolButton>
            ))}
            <span className="mx-0.5 h-4 w-px bg-call-border" />
            <CameraToolButton
              label={isBig ? "Make smaller" : "Make bigger"}
              onClick={() => setCameraSize(isBig ? "normal" : "big")}
            >
              {isBig ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </CameraToolButton>
          </div>
        )}
        {showsCamera && (
          <div
            className={cn(
              "relative overflow-hidden border border-call-border bg-neutral-900 shadow-2xl transition-[width,border-radius] duration-200",
              cameraShape === "circle" ? "rounded-full" : "rounded-3xl",
              "aspect-square",
              isBig ? "w-72" : "w-52",
            )}
          >
            {cameraStream ? (
              <PreviewVideo stream={cameraStream} />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-white/70">
                <VideoOff size={20} />
                <p className="text-xs">Camera is off</p>
                {!isActive && (
                  <button
                    type="button"
                    onClick={() => void toggleCamera().catch(() => undefined)}
                    className="cursor-pointer rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
                  >
                    Turn on camera
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {isActive && (
          <div className="flex items-center gap-1.5 rounded-full border border-call-border bg-call-background p-1.5 shadow-xl animate-in fade-in slide-in-from-bottom-1 duration-150">
            {renderControls()}
          </div>
        )}
      </div>
    </div>
  );
};

const PreviewVideo = ({ stream }: { stream: MediaStream }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
    void el.play().catch(() => undefined);
  }, [stream]);

  // Muted: a local preview must never play the mic back (feedback).
  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
    />
  );
};

interface CameraToolButtonProps {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}

const CameraToolButton = ({
  label,
  onClick,
  active = false,
  children,
}: CameraToolButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    title={label}
    className={cn(
      "flex size-7 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors",
      active ? "bg-muted" : "hover:bg-primary-hover",
    )}
  >
    {children}
  </button>
);

interface ControlButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "stop";
  children: ReactNode;
}

const ControlButton = ({
  label,
  onClick,
  disabled = false,
  variant = "default",
  children,
}: ControlButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className={cn(
      "flex size-9 items-center justify-center rounded-full transition-colors",
      disabled
        ? "cursor-not-allowed bg-muted text-foreground opacity-50"
        : variant === "stop"
          ? "cursor-pointer bg-red-500 text-white hover:bg-red-600"
          : "cursor-pointer bg-muted text-foreground hover:bg-primary-hover",
    )}
  >
    {children}
  </button>
);

export default RecorderCameraOverlay;
