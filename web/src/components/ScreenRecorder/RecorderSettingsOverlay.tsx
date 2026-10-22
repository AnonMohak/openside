import { useState, type ReactNode } from "react";
import {
  AppWindow,
  ChevronsUpDown,
  CircleUserRound,
  Monitor,
  RectangleHorizontal,
} from "lucide-react";
import { BsFillRecordCircleFill } from "react-icons/bs";
import {
  FiCheckSquare,
  FiChevronDown,
  FiChevronUp,
  FiSquare,
  FiVideo,
  FiVideoOff,
} from "react-icons/fi";
import { RiMicLine, RiMicOffLine } from "react-icons/ri";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/shared/ui/dropdown-menu";
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

  const handleCameraSelect = (deviceId: string) => {
    void selectCamera(deviceId).catch(() => undefined);
    if (layout === "screen") handleLayoutChange("screen-camera");
  };

  // The camera button adds/drops the bubble on a screen take; camera only
  // can't drop its one source.
  const handleCameraToggle = () =>
    handleLayoutChange(layout === "screen" ? "screen-camera" : "screen");

  const handleMicrophoneSelect = (deviceId: string) => {
    void selectMicrophone(deviceId)
      .then(() => {
        if (!isMicrophoneEnabled) return toggleMicrophone();
      })
      .catch(() => undefined);
  };

  // A toolbar docked bottom-center, like a dock: Record first, then what to
  // record, then mic and camera as in a space's control bar. Menus open upward from it.
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

        <SourceMenu value={source} onChange={handleSourceChange} />
        <SplitMediaControl
          icon={isMicrophoneEnabled ? <RiMicLine /> : <RiMicOffLine />}
          label={
            isMicrophoneEnabled ? "Turn off microphone" : "Turn on microphone"
          }
          active={isMicrophoneEnabled}
          onToggle={() => void toggleMicrophone().catch(() => undefined)}
          menuLabel="Microphone options"
          deviceHeading="Input Device"
          devices={microphoneDevices}
          selectedId={microphoneId}
          fallbackName="Default microphone"
          onSelect={handleMicrophoneSelect}
        />
        <SplitMediaControl
          icon={layout === "screen" ? <FiVideoOff /> : <FiVideo />}
          label={layout === "screen" ? "Turn on camera" : "Turn off camera"}
          active={layout !== "screen"}
          onToggle={handleCameraToggle}
          toggleDisabled={layout === "camera"}
          menuLabel="Camera options"
          deviceHeading="Camera"
          devices={cameraDevices}
          selectedId={cameraId}
          fallbackName="Default camera"
          onSelect={handleCameraSelect}
        />
      </div>
    </div>
  );
};

// Same look as the space's disabled controls.
const DISABLED_CONTROL_CLASS =
  "cursor-not-allowed border-dashed border-foreground/20 bg-transparent text-foreground/30 hover:bg-transparent";

interface SplitMediaControlProps {
  icon: ReactNode;
  label: string;
  active: boolean;
  onToggle: () => void;
  toggleDisabled?: boolean;
  menuLabel: string;
  deviceHeading: string;
  devices: MediaDeviceInfo[];
  selectedId: string;
  fallbackName: string;
  onSelect: (deviceId: string) => void;
}

/**
 * The space control bar's mic / camera control: an on-off button with a
 * chevron that opens the device menu (a submenu listing the devices).
 */
const SplitMediaControl = ({
  icon,
  label,
  active,
  onToggle,
  toggleDisabled = false,
  menuLabel,
  deviceHeading,
  devices,
  selectedId,
  fallbackName,
  onSelect,
}: SplitMediaControlProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const activeName = deviceName(devices, selectedId, fallbackName);

  return (
    <div className="flex items-stretch gap-0.5">
      <button
        type="button"
        onClick={onToggle}
        disabled={toggleDisabled}
        aria-label={label}
        title={label}
        className={cn(
          "flex min-h-11 w-11 items-center justify-center rounded-l-xl border text-lg font-medium transition-all duration-200",
          toggleDisabled
            ? DISABLED_CONTROL_CLASS
            : active
              ? "cursor-pointer border-call-border bg-primary hover:bg-muted"
              : "cursor-pointer border-red-400/10 bg-red-400/20 text-red-400 hover:bg-red-400/40",
        )}
      >
        {icon}
      </button>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={menuLabel}
            className={cn(
              "flex min-h-11 w-6 cursor-pointer items-center justify-center rounded-r-xl border text-base font-medium transition-all duration-200",
              active
                ? isOpen
                  ? "border-call-border bg-muted"
                  : "border-call-border bg-primary hover:bg-muted"
                : isOpen
                  ? "border-red-400/10 bg-red-400/40 text-red-400"
                  : "border-red-400/10 bg-red-400/20 text-red-400 hover:bg-red-400/40",
            )}
          >
            {isOpen ? <FiChevronUp /> : <FiChevronDown />}
          </button>
        </DropdownMenuTrigger>
        {/* z-[100]: above the recorder overlays (z-[90]). */}
        <DropdownMenuContent
          align="start"
          alignOffset={-46}
          collisionPadding={8}
          side="top"
          sideOffset={8}
          className="z-[100] w-[250px] overflow-visible rounded-xl border-call-border bg-call-background p-1.5"
        >
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="rounded-lg px-2 py-1.5 focus:bg-primary-hover data-[state=open]:bg-primary-hover">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-normal text-foreground">
                  {deviceHeading}
                </p>
                <p className="mt-0.5 truncate text-[0.7rem] text-foreground/55">
                  {activeName}
                </p>
              </div>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent
              sideOffset={12}
              collisionPadding={8}
              className="z-[100] w-[250px] rounded-xl border-call-border bg-call-background p-1"
            >
              {devices.length === 0 ? (
                <DropdownMenuItem
                  disabled
                  className="cursor-default rounded-lg px-3 py-2 text-foreground/50"
                >
                  No devices found
                </DropdownMenuItem>
              ) : (
                <DropdownMenuRadioGroup value={selectedId}>
                  {devices.map((device, index) => (
                    <DropdownMenuRadioItem
                      key={device.deviceId || index}
                      value={device.deviceId}
                      onSelect={(event) => {
                        event.preventDefault();
                        onSelect(device.deviceId);
                      }}
                      className="max-w-[250px] cursor-pointer rounded-lg px-2.5 py-1.5 pl-2.5 text-sm font-normal focus:bg-primary-hover [&>span:first-child]:hidden"
                    >
                      {device.deviceId === selectedId ? (
                        <FiCheckSquare className="size-4" />
                      ) : (
                        <FiSquare className="size-4" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {cleanDeviceLabel(device.label) ||
                          `Device ${index + 1}`}
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

interface SelectOption<T extends string> {
  value: T;
  label: string;
  icon: ReactNode;
}

/** What to record - styled like the space control bar's menus. */
const SourceMenu = ({
  value,
  onChange,
}: {
  value: RecordSource;
  onChange: (value: RecordSource) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const selected =
    SOURCE_OPTIONS.find((option) => option.value === value) ??
    SOURCE_OPTIONS[0];

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="What to record"
          className={cn(
            "flex min-h-11 w-40 cursor-pointer items-center gap-2.5 rounded-xl border border-call-border px-3 text-sm font-medium text-foreground outline-none transition-all duration-200",
            isOpen ? "bg-muted" : "bg-primary hover:bg-muted",
          )}
        >
          <span className="shrink-0 text-foreground/70">{selected.icon}</span>
          <span className="min-w-0 flex-1 truncate text-left">
            {selected.label}
          </span>
          <ChevronsUpDown size={14} className="shrink-0 text-foreground/40" />
        </button>
      </DropdownMenuTrigger>
      {/* z-[100]: above the recorder overlays (z-[90]). */}
      <DropdownMenuContent
        align="start"
        collisionPadding={8}
        side="top"
        sideOffset={8}
        className="z-[100] w-[220px] rounded-xl border-call-border bg-call-background p-1"
      >
        <DropdownMenuRadioGroup value={value}>
          {SOURCE_OPTIONS.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              onSelect={() => {
                if (option.value !== value) onChange(option.value);
              }}
              className="cursor-pointer rounded-lg px-2.5 py-1.5 pl-2.5 text-sm font-normal focus:bg-primary-hover [&>span:first-child]:hidden"
            >
              {option.value === value ? (
                <FiCheckSquare className="size-4" />
              ) : (
                <FiSquare className="size-4" />
              )}
              <span className="text-foreground/60">{option.icon}</span>
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default RecorderSettingsOverlay;
