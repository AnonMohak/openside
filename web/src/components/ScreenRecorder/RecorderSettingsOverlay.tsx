import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AppWindow,
  Check,
  ChevronsUpDown,
  CircleUserRound,
  Mic,
  MicOff,
  Monitor,
  RectangleHorizontal,
  Video,
  VideoOff,
} from "lucide-react";
import { BsFillRecordCircleFill } from "react-icons/bs";
import { cleanDeviceLabel, sortMediaDevices } from "@/lib/mediaDevices";
import { cn } from "@/lib/utils";
import { useLocalMedia, type ScreenSurface } from "./LocalMediaProvider";
import {
  useScreenRecordingContext,
  type ScreenRecorderLayout,
} from "./ScreenRecordingProvider";

type RecordSource = ScreenSurface | "camera";

const SOURCE_OPTIONS: SelectOption<RecordSource>[] = [
  { value: "monitor", label: "Full screen", icon: <Monitor size={16} /> },
  { value: "window", label: "Window", icon: <AppWindow size={16} /> },
  {
    value: "browser",
    label: "Current tab",
    icon: <RectangleHorizontal size={16} />,
  },
  {
    value: "camera",
    label: "Camera only",
    icon: <CircleUserRound size={16} />,
  },
];

const CAMERA_OFF = "__off__";
const MIC_OFF = "__off__";

/** Device pickers resolve "" (not chosen yet) to the OS default / first. */
const resolveDeviceId = (devices: MediaDeviceInfo[], activeId: string) => {
  if (devices.some((device) => device.deviceId === activeId)) return activeId;
  return (
    devices.find((device) => device.deviceId === "default")?.deviceId ??
    devices[0]?.deviceId ??
    ""
  );
};

const deviceName = (
  devices: MediaDeviceInfo[],
  deviceId: string,
  fallback: string,
) => {
  const device = devices.find((item) => item.deviceId === deviceId);
  return (device && cleanDeviceLabel(device.label)) || fallback;
};

interface RecorderSettingsOverlayProps {
  isClosing: boolean;
}

/**
 * The recorder's settings toolbar, docked bottom-center, with the Start button
 * at its end. Everything here shapes the take, so the panel hides it while one is
 * live.
 */
const RecorderSettingsOverlay = ({
  isClosing,
}: RecorderSettingsOverlayProps) => {
  const {
    isCameraEnabled,
    isMicrophoneEnabled,
    isScreenShareEnabled,
    toggleCamera,
    toggleMicrophone,
    stopScreenShare,
    microphoneDevices: rawMicrophoneDevices,
    cameraDevices: rawCameraDevices,
    activeMicrophoneId,
    activeCameraId,
    selectMicrophone,
    selectCamera,
  } = useLocalMedia();
  const { startRecording, layout, setLayout, screenSurface, setScreenSurface } =
    useScreenRecordingContext();
  const microphoneDevices = sortMediaDevices(rawMicrophoneDevices);
  const cameraDevices = sortMediaDevices(rawCameraDevices);
  const source: RecordSource = layout === "camera" ? "camera" : screenSurface;
  const selectedSource =
    SOURCE_OPTIONS.find((option) => option.value === source) ??
    SOURCE_OPTIONS[0];
  const cameraOptions: SelectOption<string>[] = [
    // Camera only can't drop the camera.
    ...(layout !== "camera"
      ? [
          {
            value: CAMERA_OFF,
            label: "No camera",
            icon: <VideoOff size={15} />,
          },
        ]
      : []),
    ...cameraDevices.map((device, index) => ({
      value: device.deviceId,
      label: cleanDeviceLabel(device.label) || `Camera ${index + 1}`,
      icon: <Video size={15} />,
    })),
  ];
  const microphoneOptions: SelectOption<string>[] = [
    { value: MIC_OFF, label: "No microphone", icon: <MicOff size={15} /> },
    ...microphoneDevices.map((device, index) => ({
      value: device.deviceId,
      label: cleanDeviceLabel(device.label) || `Microphone ${index + 1}`,
      icon: <Mic size={15} />,
    })),
  ];
  const cameraId = resolveDeviceId(cameraDevices, activeCameraId);
  const microphoneId = resolveDeviceId(microphoneDevices, activeMicrophoneId);

  // A layout owns its sources: the camera turns on when the layout shows it
  // and off when it doesn't, and "camera only" drops the screen share - so we
  // never keep (or record) a stream the user can't see.
  const handleLayoutChange = (next: ScreenRecorderLayout) => {
    const nextShowsCamera = next !== "screen";
    if (nextShowsCamera !== isCameraEnabled) {
      void toggleCamera().catch(() => undefined);
    }
    if (next === "camera" && isScreenShareEnabled) void stopScreenShare();
    setLayout(next);
  };

  // The source picks the screen surface (or camera only); the camera picker
  // decides whether a screen take gets the camera bubble.
  const handleSourceChange = (next: RecordSource) => {
    if (next === "camera") {
      handleLayoutChange("camera");
      return;
    }
    if (next !== screenSurface && isScreenShareEnabled) void stopScreenShare();
    setScreenSurface(next);
    if (layout === "camera") handleLayoutChange("screen-camera");
  };

  const handleCameraChange = (deviceId: string) => {
    if (deviceId === CAMERA_OFF) {
      handleLayoutChange("screen");
      return;
    }
    void selectCamera(deviceId).catch(() => undefined);
    if (layout === "screen") handleLayoutChange("screen-camera");
  };

  const handleMicrophoneChange = (deviceId: string) => {
    if (deviceId === MIC_OFF) {
      if (isMicrophoneEnabled) void toggleMicrophone();
      return;
    }
    void selectMicrophone(deviceId)
      .then(() => {
        if (!isMicrophoneEnabled) return toggleMicrophone();
      })
      .catch(() => undefined);
  };

  // A toolbar docked bottom-center, like a dock: Record first, then what to
  // record, the camera and mic. Menus open upward from it.
  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 z-[90] w-max max-w-[calc(100vw-32px)] -translate-x-1/2",
        isClosing && "pointer-events-none",
      )}
    >
      <div
        className={cn(
          "relative flex select-none flex-wrap items-center justify-center gap-1.5 rounded-[20px] border border-call-border/50 bg-call-background p-2 shadow-2xl",
          isClosing
            ? "animate-out fade-out-0 zoom-out-95 fill-mode-forwards duration-150 ease-in"
            : "animate-in fade-in-0 zoom-in-95 duration-200 ease-out",
        )}
      >
        <button
          type="button"
          onClick={() => void startRecording()}
          aria-label="Start recording"
          // Same as the space's Record button.
          className="flex h-11 w-[98px] cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-red-500 bg-red-500 text-sm font-medium text-white transition-all duration-200 hover:border-red-600 hover:bg-red-600"
        >
          <BsFillRecordCircleFill className="size-4 text-white" />
          Record
        </button>

        <span className="mx-1 h-8 w-px bg-call-border/60 max-sm:hidden" />

        <ToolbarSelect
          caption="Record"
          icon={selectedSource.icon}
          text={selectedSource.label}
          value={source}
          options={SOURCE_OPTIONS}
          onChange={handleSourceChange}
          className="w-40"
        />
        <ToolbarSelect
          caption="Camera"
          icon={
            layout === "screen" ? (
              <VideoOff size={15} className="text-red-500" />
            ) : (
              <Video size={15} />
            )
          }
          text={
            layout === "screen"
              ? "No camera"
              : cameraDevices.length === 0
                ? "No camera found"
                : deviceName(cameraDevices, cameraId, "Camera")
          }
          value={layout === "screen" ? CAMERA_OFF : cameraId}
          options={cameraOptions}
          onChange={handleCameraChange}
          disabled={cameraOptions.length === 0}
          className="w-52"
        />
        <ToolbarSelect
          caption="Microphone"
          icon={
            isMicrophoneEnabled ? (
              <Mic size={15} />
            ) : (
              <MicOff size={15} className="text-red-500" />
            )
          }
          text={
            isMicrophoneEnabled
              ? deviceName(microphoneDevices, microphoneId, "Microphone")
              : "No microphone"
          }
          value={isMicrophoneEnabled ? microphoneId : MIC_OFF}
          options={microphoneOptions}
          onChange={handleMicrophoneChange}
          className="w-52"
        />
      </div>
    </div>
  );
};

/** A toolbar control: a small caption over the current value. */
const ChipBody = ({
  icon,
  caption,
  text,
}: {
  icon: ReactNode;
  caption: string;
  text: string;
}) => (
  <>
    <span className="shrink-0 text-foreground/50">{icon}</span>
    <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
      <span className="text-[11px] text-foreground/50">{caption}</span>
      <span className="truncate text-[13px] font-medium text-foreground">
        {text}
      </span>
    </span>
    <ChevronsUpDown size={14} className="shrink-0 text-foreground/40" />
  </>
);

interface SelectOption<T extends string> {
  value: T;
  label: string;
  icon: ReactNode;
}

interface ToolbarSelectProps<T extends string> {
  caption: string;
  /** The chip's icon and text: the current choice. */
  icon: ReactNode;
  text: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}

/** A toolbar chip that opens a menu of options upward. */
const ToolbarSelect = <T extends string>({
  caption,
  icon,
  text,
  value,
  options,
  onChange,
  disabled = false,
  className,
}: ToolbarSelectProps<T>) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={caption}
        className={cn(
          "flex h-11 w-full items-center gap-2.5 rounded-xl px-3 transition-colors",
          disabled
            ? "cursor-not-allowed bg-primary opacity-50"
            : isOpen
              ? "cursor-pointer bg-muted"
              : "cursor-pointer bg-primary hover:bg-muted",
        )}
      >
        <ChipBody icon={icon} caption={caption} text={text} />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={caption}
          className="absolute bottom-full left-0 z-10 mb-2 flex w-64 min-w-full flex-col gap-0.5 rounded-xl border border-call-border/50 bg-call-background p-1 shadow-xl animate-in fade-in-0 zoom-in-95 duration-100"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  setIsOpen(false);
                  if (!isSelected) onChange(option.value);
                }}
                className={cn(
                  "flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors",
                  isSelected
                    ? "bg-primary font-medium text-foreground"
                    : "text-foreground/80 hover:bg-primary hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "shrink-0",
                    isSelected ? "text-foreground" : "text-foreground/50",
                  )}
                >
                  {option.icon}
                </span>
                <span className="min-w-0 flex-1 truncate text-left">
                  {option.label}
                </span>
                {isSelected && (
                  <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                    <Check size={11} strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RecorderSettingsOverlay;
