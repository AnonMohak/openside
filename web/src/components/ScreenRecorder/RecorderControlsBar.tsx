import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Pause, Play, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScreenRecordingContext } from "./ScreenRecordingProvider";

const formatDuration = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

type ConfirmAction = "restart" | "delete";

const CONFIRM_COPY: Record<ConfirmAction, { title: string; action: string }> = {
  restart: { title: "Restart this take?", action: "Restart" },
  delete: { title: "Delete this take?", action: "Delete" },
};

interface RecorderControlsBarProps {
  isClosing: boolean;
}

/**
 * The take's controls, docked on the left edge: stop, timer, pause / resume,
 * restart and delete. Shown greyed out while setting up and come alive once
 * Start is pressed; restart and delete throw the take away, so they ask first.
 */
const RecorderControlsBar = ({ isClosing }: RecorderControlsBarProps) => {
  const {
    recordingState,
    recordingDurationMs,
    stopRecording,
    pauseRecording,
    resumeRecording,
    restartRecording,
    discardRecording,
  } = useScreenRecordingContext();
  const [confirming, setConfirming] = useState<ConfirmAction | null>(null);

  const isCapturing =
    recordingState === "recording" || recordingState === "paused";
  const isPaused = recordingState === "paused";
  const isStarting =
    recordingState === "starting" || recordingState === "countdown";
  const isSaving =
    recordingState === "stopping" || recordingState === "uploading";

  // A take that ended can't be restarted or deleted any more.
  useEffect(() => {
    if (!isCapturing && !isStarting) setConfirming(null);
  }, [isCapturing, isStarting]);

  const handleConfirm = () => {
    const action = confirming;
    setConfirming(null);
    if (action === "restart") void restartRecording();
    if (action === "delete") void discardRecording();
  };

  // Before Start (and after a take is saved) the bar is just a grey preview.
  const isLive = isCapturing || isStarting || isSaving;

  // Upload progress has its own card (RecorderUploadCard); the timer just
  // holds the take's length.
  const timer =
    isCapturing || isSaving ? formatDuration(recordingDurationMs) : "0:00";

  return (
    // The outer box only positions; the inner one only animates, so the
    // scale never fights the vertical centering transform.
    <div
      className={cn(
        "fixed left-4 top-1/2 z-[95] -translate-y-1/2 select-none",
        isClosing && "pointer-events-none",
      )}
    >
      <div
        className={cn(
          "relative flex w-14 flex-col items-center gap-1.5 rounded-[22px] border border-white/10 bg-neutral-900 p-2 text-white shadow-2xl",
          isClosing
            ? "animate-out fade-out-0 zoom-out-95 fill-mode-forwards duration-150 ease-in"
            : "animate-in fade-in-0 zoom-in-95 duration-200 ease-out",
          !isLive && "border-white/5 bg-neutral-800/90",
        )}
      >
        <button
          type="button"
          onClick={stopRecording}
          disabled={!isCapturing}
          aria-label="Stop and save"
          title="Stop and save"
          className="mb-0.5 flex size-10 cursor-pointer items-center justify-center rounded-[14px] bg-white/10 transition-colors enabled:hover:bg-white/15 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <Loader2 size={16} className="animate-spin text-white/70" />
          ) : (
            <span
              className={cn(
                "size-4 rounded-[5px] transition-colors",
                isLive ? "bg-red-500" : "bg-white/25",
              )}
            />
          )}
        </button>

        <span
          className={cn(
            "mb-0.5 text-xs font-semibold tabular-nums",
            isPaused && "animate-pulse text-amber-400",
            (isStarting || isSaving) && "text-white/60",
            !isLive && "text-white/30",
          )}
        >
          {timer}
        </span>

        <BarButton
          label={isPaused ? "Resume" : "Pause"}
          onClick={isPaused ? resumeRecording : pauseRecording}
          disabled={!isCapturing}
        >
          {isPaused ? (
            <Play size={16} className="fill-current" />
          ) : (
            <Pause size={16} className="fill-current" />
          )}
        </BarButton>
        <BarButton
          label="Restart"
          onClick={() => setConfirming("restart")}
          disabled={!isCapturing}
          active={confirming === "restart"}
        >
          <RotateCcw size={16} />
        </BarButton>
        <BarButton
          label="Delete"
          onClick={() => setConfirming("delete")}
          disabled={!isCapturing && recordingState !== "countdown"}
          active={confirming === "delete"}
        >
          <Trash2 size={16} />
        </BarButton>

        {confirming && (
          <div className="absolute bottom-0 left-full ml-3 w-52 rounded-2xl border border-call-border bg-call-background p-3 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150">
            <p className="text-sm font-medium text-foreground">
              {CONFIRM_COPY[confirming].title}
            </p>
            <p className="mt-0.5 text-xs text-foreground/50">
              What's recorded so far will be lost.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="h-8 flex-1 cursor-pointer rounded-lg bg-primary text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="h-8 flex-1 cursor-pointer rounded-lg bg-red-500 text-xs font-medium text-white transition-colors hover:bg-red-600"
              >
                {CONFIRM_COPY[confirming].action}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface BarButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}

const BarButton = ({
  label,
  onClick,
  disabled = false,
  active = false,
  children,
}: BarButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className={cn(
      "flex size-9 items-center justify-center rounded-xl text-white/70 transition-colors",
      disabled
        ? "cursor-not-allowed opacity-40"
        : "cursor-pointer hover:bg-white/10 hover:text-white",
      active && "bg-white/10 text-white",
    )}
  >
    {children}
  </button>
);

export default RecorderControlsBar;
