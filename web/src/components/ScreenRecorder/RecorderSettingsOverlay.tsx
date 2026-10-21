import type { ReactNode } from "react";
import {
  ChevronsUpDown,
  Mic,
  MicOff,
  Monitor,
  PictureInPicture2,
  Video,
} from "lucide-react";
import { BsRecordCircleFill } from "react-icons/bs";
import { useNavigate } from "react-router-dom";
import { cleanDeviceLabel, sortMediaDevices } from "@/lib/mediaDevices";
import { cn } from "@/lib/utils";
import { useLocalMedia } from "./LocalMediaProvider";
import {
  useScreenRecordingContext,
  type ScreenRecorderLayout,
} from "./ScreenRecordingProvider";

const LAYOUT_OPTIONS: {
  value: ScreenRecorderLayout;
  label: string;
  icon: ReactNode;
}[] = [
  {
    value: "screen-camera",
    label: "Both",
    icon: <PictureInPicture2 size={18} />,
  },
  { value: "screen", label: "Screen", icon: <Monitor size={18} /> },
  { value: "camera", label: "Camera", icon: <Video size={18} /> },
];

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
 * The recorder's settings card, pinned top-right, with the Start button at its
 * foot. Everything here shapes the take, so the panel hides it while one is
 * live.
 */
const RecorderSettingsOverlay = ({
  isClosing,
}: RecorderSettingsOverlayProps) => {
  const navigate = useNavigate();
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
  const {
    closeRecorder,
    recordingState,
    error,
    completedSessionId,
    startRecording,
    layout,
    setLayout,
  } = useScreenRecordingContext();
  const microphoneDevices = sortMediaDevices(rawMicrophoneDevices);
  const cameraDevices = sortMediaDevices(rawCameraDevices);
  const showsCamera = layout !== "screen";
  const cameraId = resolveDeviceId(cameraDevices, activeCameraId);
  const microphoneId = resolveDeviceId(microphoneDevices, activeMicrophoneId);
  const isComplete = recordingState === "complete" && !!completedSessionId;

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

  const handleViewRecording = () => {
    if (!completedSessionId) return;
    navigate(`/dashboard/project/screen/${completedSessionId}`);
    closeRecorder();
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

  // Pinned top-right, below the dashboard header (h-14) so it doesn't cover
  // its buttons.
  return (
    <div
      className={cn(
        "fixed right-4 top-[72px] z-[90] w-[320px]",
        isClosing && "pointer-events-none",
      )}
    >
      <div
        className={cn(
          "select-none rounded-2xl border border-call-border bg-call-background shadow-2xl",
          isClosing
            ? "animate-out fade-out-0 zoom-out-95 fill-mode-forwards duration-150 ease-in"
            : "animate-in fade-in-0 zoom-in-95 duration-200 ease-out",
        )}
      >
        <div className="border-b border-call-border px-5 py-4">
          <p className="text-[15px] font-semibold text-foreground">
            Screen recorder
          </p>
          <p className="mt-0.5 text-[13px] text-foreground/50">
            Pick what to record, then hit start.
          </p>
        </div>

        <div className="flex flex-col gap-5 p-5">
          <Field label="Layout">
            <div className="grid grid-cols-3 gap-2">
              {LAYOUT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleLayoutChange(option.value)}
                  aria-pressed={option.value === layout}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-medium transition-colors",
                    option.value === layout
                      ? "border-foreground bg-muted text-foreground"
                      : "border-transparent bg-primary text-foreground/60 hover:bg-muted hover:text-foreground",
                  )}
                >
                  {option.icon}
                  {option.label}
                </button>
              ))}
            </div>
          </Field>

          {showsCamera && (
            <Field label="Camera">
              <DeviceSelect
                icon={<Video size={15} />}
                label="Camera"
                text={
                  cameraDevices.length === 0
                    ? "No camera found"
                    : deviceName(cameraDevices, cameraId, "Camera")
                }
                value={cameraId}
                onChange={(deviceId) =>
                  void selectCamera(deviceId).catch(() => undefined)
                }
                disabled={cameraDevices.length === 0}
              >
                {cameraDevices.length === 0 && (
                  <option value="">No camera found</option>
                )}
                {cameraDevices.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {cleanDeviceLabel(device.label) || `Camera ${index + 1}`}
                  </option>
                ))}
              </DeviceSelect>
            </Field>
          )}

          <Field label="Microphone">
            <DeviceSelect
              icon={
                isMicrophoneEnabled ? (
                  <Mic size={15} />
                ) : (
                  <MicOff size={15} className="text-red-500" />
                )
              }
              label="Microphone"
              text={
                isMicrophoneEnabled
                  ? deviceName(microphoneDevices, microphoneId, "Microphone")
                  : "No microphone"
              }
              value={isMicrophoneEnabled ? microphoneId : MIC_OFF}
              onChange={handleMicrophoneChange}
            >
              <option value={MIC_OFF}>No microphone</option>
              {microphoneDevices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {cleanDeviceLabel(device.label) || `Microphone ${index + 1}`}
                </option>
              ))}
            </DeviceSelect>
          </Field>
        </div>

        <div className="flex flex-col gap-2 border-t border-call-border p-4">
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="button"
            onClick={() => void startRecording()}
            className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-red-500 text-sm font-semibold text-white transition-colors hover:bg-red-600"
          >
            <BsRecordCircleFill size={16} />
            {isComplete ? "Record again" : "Start recording"}
          </button>
          {isComplete && (
            <button
              type="button"
              onClick={handleViewRecording}
              className="h-10 cursor-pointer rounded-xl bg-primary text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              View last recording
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-2">
    <p className="text-xs font-medium text-foreground/50">{label}</p>
    {children}
  </div>
);

interface DeviceSelectProps {
  icon: ReactNode;
  label: string;
  /** What the row shows: the chosen device's name. */
  text: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** <option>s. The native <select> sits invisibly over the row, so the row
   *  shows the chosen device and clicking anywhere opens the OS picker. */
  children: ReactNode;
}

const DeviceSelect = ({
  icon,
  label,
  text,
  value,
  onChange,
  disabled = false,
  children,
}: DeviceSelectProps) => (
  <div
    className={cn(
      "relative flex h-10 items-center gap-2.5 rounded-xl bg-primary px-3 text-[13px] text-foreground transition-colors",
      disabled ? "opacity-50" : "hover:bg-muted",
    )}
  >
    <span className="shrink-0 text-foreground/50">{icon}</span>
    <span className="min-w-0 flex-1 truncate">{text}</span>
    <ChevronsUpDown size={14} className="shrink-0 text-foreground/40" />
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      aria-label={label}
      className="absolute inset-0 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
    >
      {children}
    </select>
  </div>
);

export default RecorderSettingsOverlay;
