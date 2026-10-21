import { useEffect, useRef, type ReactNode } from "react";
import { Circle, Maximize2, Minimize2, Square, VideoOff } from "lucide-react";
import useDraggable from "@/hooks/useDraggable";
import { cn } from "@/lib/utils";
import { useLocalMedia } from "./LocalMediaProvider";
import {
  useScreenRecordingContext,
  type PipShape,
} from "./ScreenRecordingProvider";

const SHAPE_OPTIONS: { value: PipShape; label: string; icon: ReactNode }[] = [
  { value: "circle", label: "Circle", icon: <Circle size={15} /> },
  { value: "square", label: "Square", icon: <Square size={15} /> },
];

/**
 * The camera bubble: bottom-right to start, draggable anywhere. Shape and size
 * sit above it on hover while setting up; the take's controls live in the
 * left-hand bar.
 */
interface RecorderCameraOverlayProps {
  isClosing: boolean;
}

const RecorderCameraOverlay = ({ isClosing }: RecorderCameraOverlayProps) => {
  const { cameraStream, toggleCamera } = useLocalMedia();
  const {
    isActive,
    layout,
    cameraSize,
    setCameraSize,
    cameraShape,
    setCameraShape,
  } = useScreenRecordingContext();
  const { ref, style, isDragging, handleProps } = useDraggable<HTMLDivElement>({
    corner: "bottom-right",
  });

  const showsCamera = layout !== "screen";
  const isBig = cameraSize === "big";

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
      // Mirrored, like looking in a mirror (the final video is flipped too).
      className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-cover"
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

export default RecorderCameraOverlay;
