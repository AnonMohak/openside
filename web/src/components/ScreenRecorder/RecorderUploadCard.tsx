import { cn } from "@/lib/utils";
import { useScreenRecordingContext } from "./ScreenRecordingProvider";

interface RecorderUploadCardProps {
  isClosing: boolean;
}

const RING_RADIUS = 44;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * Shown after Stop, centered over a dimmed page: the take is still
 * uploading, and its project opens on its own once that's done (see
 * ScreenRecordingProvider).
 */
const RecorderUploadCard = ({ isClosing }: RecorderUploadCardProps) => {
  const { recordingState, uploadProgress } = useScreenRecordingContext();
  const isUploading = recordingState === "uploading";
  const percent = isUploading ? uploadProgress : 0;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[95] flex items-center justify-center bg-black/40 px-4 backdrop-blur-[2px]",
        isClosing
          ? "pointer-events-none animate-out fade-out-0 fill-mode-forwards duration-150"
          : "animate-in fade-in-0 duration-200",
      )}
    >
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "w-[320px] max-w-full rounded-3xl border border-call-border/50 bg-call-background px-6 py-7 text-center shadow-2xl",
          isClosing
            ? "animate-out zoom-out-95 fill-mode-forwards duration-150 ease-in"
            : "animate-in zoom-in-95 duration-200 ease-out",
        )}
      >
        <div className="relative mx-auto size-24">
          <svg viewBox="0 0 100 100" className="size-24 -rotate-90">
            <circle
              cx="50"
              cy="50"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="8"
              className="stroke-muted"
            />
            <circle
              cx="50"
              cy="50"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={RING_LENGTH * (1 - percent / 100)}
              className="stroke-foreground transition-[stroke-dashoffset] duration-500 ease-out"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold tabular-nums text-foreground">
            {percent}%
          </span>
        </div>
        <p className="mt-5 text-base font-semibold text-foreground">
          {isUploading ? "Uploading your recording" : "Saving your recording"}
        </p>
        <p className="mt-1 text-sm text-foreground/55">
          Your recording will open as soon as it's done. Keep this tab open.
        </p>
      </div>
    </div>
  );
};

export default RecorderUploadCard;
