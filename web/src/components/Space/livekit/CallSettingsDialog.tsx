import {
  useLocalParticipant,
  useMediaDeviceSelect,
  useRoomContext,
} from "@livekit/components-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useTheme } from "next-themes";
import {
  LocalAudioTrack,
  LocalVideoTrack,
  Track,
  type Room,
} from "livekit-client";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Headphones,
  Loader2,
  Monitor,
  Moon,
  Play,
  ScanFace,
  Square,
  Sun,
  X,
} from "lucide-react";
import { BsRecordCircle } from "react-icons/bs";
import {
  FiCheckSquare,
  FiSettings,
  FiSquare,
  FiVideo,
  FiVideoOff,
} from "react-icons/fi";
import { RiMicLine, RiVolumeUpLine } from "react-icons/ri";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/shared/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  applyAudioOutput,
  canSelectAudioOutput,
  cleanDeviceLabel,
  sortMediaDevices,
} from "@/lib/mediaDevices";
import { markLocalMediaAction } from "@/lib/localMediaIntent";
import { areCallSoundsEnabled, setCallSoundsEnabled } from "@/lib/callSounds";
import {
  setPreviewCamera,
  shouldPreviewCamera,
} from "@/lib/cameraPreviewPreference";
import {
  applyCameraBackground,
  backgroundKey,
  isCameraBackgroundSupported,
  loadCustomImage,
  loadSavedBackground,
  prepareCustomImage,
  saveBackground,
  type CameraBackground,
} from "@/lib/cameraBackgrounds";
import { getOrCreateSessionId } from "@/utils/ParticipantSessionId";
import { useGetMe } from "@/hooks/useUserQuery";
import { useGetSpaceByJoinCode, useUpdateSpace } from "@/hooks/useSpace";
import { useRenameSelf } from "@/hooks/useParticipant";
import { SETTINGS_MUTATION_KEY } from "@/hooks/useProfile";
import { useIsMutating } from "@tanstack/react-query";
import RecordingSettings from "@/components/settings/RecordingSettings";
import Switch from "@/components/shared/ui/switch";
import BackgroundOptionsGrid from "./BackgroundOptions";
import LowLightBadge from "../ui/LowLightBadge";
import { useLowLight } from "@/hooks/useLowLight";
import { useIsAudioOnlyCall } from "./AudioOnlyMode";
import { useRecordingContext } from "../recording/RecordingProvider";

export type SettingsTab = "general" | "audio" | "video" | "recording";

const TABS: { id: SettingsTab; label: string; icon: ReactNode }[] = [
  { id: "general", label: "General", icon: <FiSettings className="size-4" /> },
  { id: "audio", label: "Audio", icon: <RiMicLine className="size-4" /> },
  { id: "video", label: "Video", icon: <FiVideo className="size-4" /> },
  {
    id: "recording",
    label: "Recording",
    icon: <BsRecordCircle className="size-4" />,
  },
];

const TAB_DESCRIPTIONS: Record<SettingsTab, string> = {
  general: "Your space, your name, and how the call looks and sounds.",
  audio: "Pick your mic and speaker, and check how you sound.",
  video: "Choose a camera and set up your background.",
  recording: "How your recordings are captured.",
};

const MAX_NAME_LENGTH = 60;

type SaveState = "idle" | "saving" | "saved" | "error";

type SelectableKind = "audioinput" | "audiooutput" | "videoinput";

interface CallSettingsDialogProps {
  initialTab?: SettingsTab;
  roomCode: string;
  isHost: boolean;
  usingHeadphones: boolean;
  onHeadphonesChange: (usingHeadphones: boolean) => void;
  outputVolume: number;
  onOutputVolumeChange: (volume: number) => void;
  onTurnOnCamera: () => void;
  onClose: () => void;
}

// Echo cancellation only takes effect on a fresh capture, so re-open the live
// mic with the new setting (same device). Future captures pick it up from the
// room defaults.
const applyEchoCancellation = async (room: Room, echoCancellation: boolean) => {
  room.options.audioCaptureDefaults = {
    ...room.options.audioCaptureDefaults,
    echoCancellation,
  };
  const micTrack = room.localParticipant.getTrackPublication(
    Track.Source.Microphone,
  )?.track;
  if (!(micTrack instanceof LocalAudioTrack)) return;

  const deviceId = micTrack.mediaStreamTrack.getSettings().deviceId;
  const wasMuted = micTrack.isMuted;
  markLocalMediaAction();
  await micTrack.restartTrack({
    ...room.options.audioCaptureDefaults,
    // Without a device id LiveKit restarts with bare `audio: true`, dropping
    // every other constraint - so always name one.
    deviceId: deviceId ? { exact: deviceId } : "default",
    echoCancellation,
  });
  // A restart hands back an enabled track; a muted mic must stay silent.
  if (wasMuted) micTrack.mediaStreamTrack.enabled = false;
};

// Live input level (0-100) of a mic track, for the meter.
const useAudioLevel = (track: MediaStreamTrack | null | undefined) => {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!track || track.readyState !== "live") {
      setLevel(0);
      return;
    }
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.75;
    const source = context.createMediaStreamSource(new MediaStream([track]));
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;

    const poll = () => {
      analyser.getByteFrequencyData(data);
      const average = data.reduce((sum, value) => sum + value, 0) / data.length;
      // Same curve as the mic menu's meter so both read alike.
      const curved = Math.pow(average / 255, 1.2);
      setLevel(Math.min(100, Math.round(curved * 100 * 4)));
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void context.close();
    };
  }, [track]);

  return level;
};

const CallSettingsDialog = ({
  initialTab = "general",
  roomCode,
  isHost,
  usingHeadphones,
  onHeadphonesChange,
  outputVolume,
  onOutputVolumeChange,
  onTurnOnCamera,
  onClose,
}: CallSettingsDialogProps) => {
  const room = useRoomContext();
  const { localParticipant, isCameraEnabled, isMicrophoneEnabled } =
    useLocalParticipant();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const { data: user } = useGetMe();
  const { data: space } = useGetSpaceByJoinCode(roomCode);
  // Recording preferences live on the account - guests don't have one.
  const tabs = user ? TABS : TABS.filter((item) => item.id !== "recording");
  const isAudioOnly = useIsAudioOnlyCall();
  // Settings are snapshotted per recording - changing them mid-recording
  // would leave participants capturing with mismatched settings.
  const { recordingState } = useRecordingContext();
  const isRecordingActive = (
    ["starting", "countdown", "recording", "stopping"] as const
  ).some((state) => state === recordingState);

  // Autosave status for the sidebar: an edit waiting out its debounce or any
  // settings request in flight reads as "Saving…".
  const [pendingForms, setPendingForms] = useState<Record<string, boolean>>({});
  const setFormPending = useCallback((id: string, pending: boolean) => {
    setPendingForms((current) =>
      current[id] === pending ? current : { ...current, [id]: pending },
    );
  }, []);
  const [lastSaveOk, setLastSaveOk] = useState<boolean | null>(null);
  const savingCount = useIsMutating({ mutationKey: SETTINGS_MUTATION_KEY });
  const [hasSaved, setHasSaved] = useState(false);
  if (savingCount > 0 && !hasSaved) setHasSaved(true);
  const saveStatus: SaveState =
    savingCount > 0 || Object.values(pendingForms).some(Boolean)
      ? "saving"
      : lastSaveOk === false
        ? "error"
        : hasSaved
          ? "saved"
          : "idle";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // A device menu open inside the dialog handles its own Esc.
      if (
        event.key === "Escape" &&
        !document.querySelector("[data-radix-popper-content-wrapper]")
      ) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // ---- Devices ------------------------------------------------------------
  // requestPermissions: the dialog is an explicit "show me my devices" moment,
  // so asking for access here (to get labeled lists) is expected.
  const microphone = useMediaDeviceSelect({
    kind: "audioinput",
    requestPermissions: true,
  });
  const speaker = useMediaDeviceSelect({ kind: "audiooutput" });
  const camera = useMediaDeviceSelect({
    kind: "videoinput",
    requestPermissions: true,
  });
  const microphoneDevices = useMemo(
    () => sortMediaDevices(microphone.devices),
    [microphone.devices],
  );
  const speakerDevices = useMemo(
    () => sortMediaDevices(speaker.devices),
    [speaker.devices],
  );
  const cameraDevices = useMemo(
    () => sortMediaDevices(camera.devices),
    [camera.devices],
  );

  const selectDevice = async (kind: SelectableKind, deviceId: string) => {
    const select =
      kind === "audioinput"
        ? microphone.setActiveMediaDevice
        : kind === "audiooutput"
          ? speaker.setActiveMediaDevice
          : camera.setActiveMediaDevice;
    // A switch restarts the published track - not a host mute.
    markLocalMediaAction();
    try {
      await select(
        deviceId,
        deviceId === "default" ? undefined : { exact: true },
      );
    } catch {
      // A stale id (unplugged / re-enumerated) - let the browser pick the
      // closest match instead.
      try {
        await select(deviceId);
      } catch (error) {
        console.error(`Unable to switch ${kind} device:`, error);
      }
    }
  };

  // ---- Audio --------------------------------------------------------------
  const micTrack = isMicrophoneEnabled
    ? localParticipant.getTrackPublication(Track.Source.Microphone)?.track
        ?.mediaStreamTrack
    : null;
  const micLevel = useAudioLevel(micTrack);

  const speakerTestRef = useRef<HTMLAudioElement>(null);
  const [isTestingSpeaker, setIsTestingSpeaker] = useState(false);
  const toggleSpeakerTest = async () => {
    const audio = speakerTestRef.current;
    if (!audio) return;
    if (isTestingSpeaker) {
      audio.pause();
      audio.currentTime = 0;
      setIsTestingSpeaker(false);
      return;
    }
    audio.src = "/audio/my_name_is_pink.mp3";
    audio.volume = outputVolume / 100;
    try {
      await applyAudioOutput(audio, speaker.activeDeviceId);
      audio.onended = () => setIsTestingSpeaker(false);
      await audio.play();
      setIsTestingSpeaker(true);
    } catch (error) {
      console.error("Unable to play speaker test:", error);
    }
  };
  useEffect(() => {
    if (speakerTestRef.current) {
      speakerTestRef.current.volume = outputVolume / 100;
    }
  }, [outputVolume]);

  const [isApplyingHeadphones, setIsApplyingHeadphones] = useState(false);
  const setHeadphones = async (next: boolean) => {
    if (next === usingHeadphones || isApplyingHeadphones) return;
    onHeadphonesChange(next);
    try {
      // Pre-join reads the same key, so the answer carries over.
      localStorage.setItem("prejoin-headphones", next ? "1" : "0");
    } catch {
      // Ignore storage failures.
    }
    setIsApplyingHeadphones(true);
    try {
      await applyEchoCancellation(room, !next);
    } catch (error) {
      console.error("Unable to update echo cancellation:", error);
    } finally {
      setIsApplyingHeadphones(false);
    }
  };

  // ---- Video --------------------------------------------------------------
  const cameraPublicationTrack = localParticipant.getTrackPublication(
    Track.Source.Camera,
  )?.track;
  const liveCameraTrack =
    isCameraEnabled && cameraPublicationTrack instanceof LocalVideoTrack
      ? cameraPublicationTrack
      : null;
  const selfViewRef = useRef<HTMLVideoElement>(null);
  const isLowLight = useLowLight(
    tab === "video" ? liveCameraTrack?.mediaStreamTrack : null,
  );
  useEffect(() => {
    const video = selfViewRef.current;
    if (!video || !liveCameraTrack) return;
    liveCameraTrack.attach(video);
    return () => {
      liveCameraTrack.detach(video);
    };
  }, [liveCameraTrack, tab]);

  const [isBackgroundSupported, setIsBackgroundSupported] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void isCameraBackgroundSupported().then((supported) => {
      if (!cancelled) setIsBackgroundSupported(supported);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const [background, setBackground] =
    useState<CameraBackground>(loadSavedBackground);
  const [customImageUrl, setCustomImageUrl] = useState(loadCustomImage);
  const [pendingBackgroundKey, setPendingBackgroundKey] = useState<
    string | null
  >(null);
  const backgroundFileRef = useRef<HTMLInputElement>(null);

  // Saved for the next camera turn-on; applied live when the camera is on.
  const selectBackground = async (
    next: CameraBackground,
    imageUrl = customImageUrl,
  ) => {
    setBackground(next);
    saveBackground(next);
    if (!liveCameraTrack) return;
    setPendingBackgroundKey(next.kind === "none" ? null : backgroundKey(next));
    try {
      await applyCameraBackground(liveCameraTrack, next, imageUrl);
    } catch (error) {
      console.error("Unable to apply camera background:", error);
    } finally {
      setPendingBackgroundKey(null);
    }
  };

  const handleBackgroundUpload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const url = await prepareCustomImage(file);
      setCustomImageUrl(url);
      await selectBackground({ kind: "custom" }, url);
    } catch (error) {
      console.error("Unable to use that image as a background:", error);
    }
  };

  // ---- General ------------------------------------------------------------
  const { theme, setTheme } = useTheme();
  const [soundsEnabled, setSoundsEnabled] = useState(areCallSoundsEnabled);
  const [previewCamera, setPreviewCameraState] = useState(shouldPreviewCamera);

  // ---- Building blocks ----------------------------------------------------
  const renderDeviceSelect = (
    kind: SelectableKind,
    devices: MediaDeviceInfo[],
    activeDeviceId: string,
    fallback: string,
  ) => {
    const selectedId = devices.some((d) => d.deviceId === activeDeviceId)
      ? activeDeviceId
      : (devices.find((d) => d.deviceId === "default")?.deviceId ??
        devices[0]?.deviceId ??
        "");
    const selected = devices.find((d) => d.deviceId === selectedId);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="group flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-call-border bg-call-background px-3 py-2.5 text-left transition-colors hover:bg-primary-hover data-[state=open]:bg-primary-hover"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              {cleanDeviceLabel(selected?.label ?? "") || fallback}
            </span>
            <ChevronDown className="size-4 shrink-0 text-foreground/50 transition-transform duration-150 group-data-[state=open]:rotate-180" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className="z-[110] w-(--radix-dropdown-menu-trigger-width) rounded-xl border-call-border bg-call-background p-1.5"
        >
          {devices.length === 0 ? (
            <DropdownMenuItem
              disabled
              className="cursor-default rounded-lg px-3 py-2 text-foreground/50"
            >
              No devices found
            </DropdownMenuItem>
          ) : (
            <DropdownMenuRadioGroup
              value={selectedId}
              onValueChange={(deviceId) => void selectDevice(kind, deviceId)}
            >
              {devices.map((device, index) => (
                <DropdownMenuRadioItem
                  key={device.deviceId}
                  value={device.deviceId}
                  className="cursor-pointer rounded-lg px-2.5 py-1.5 pl-2.5 text-sm font-normal focus:bg-primary-hover [&>span:first-child]:hidden"
                >
                  {device.deviceId === selectedId ? (
                    <FiCheckSquare className="size-4" />
                  ) : (
                    <FiSquare className="size-4" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {cleanDeviceLabel(device.label) ||
                      `${fallback} ${index + 1}`}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const renderSegmented = <T extends string>(
    value: T,
    options: { value: T; label: string; icon?: ReactNode }[],
    onChange: (value: T) => void,
    disabled = false,
  ) => (
    <div className="flex items-center gap-0.5 rounded-lg border border-call-border bg-call-background p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            value === option.value
              ? "bg-primary-hover text-foreground shadow-sm"
              : "text-foreground/55 hover:text-foreground",
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );

  const renderLevelMeter = () => {
    const count = 32;
    const activeCount = Math.round((micLevel / 100) * count);
    return (
      <div
        className="grid flex-1 grid-cols-[repeat(32,1fr)] gap-[3px]"
        aria-hidden
      >
        {Array.from({ length: count }).map((_, index) => {
          const isActive = index < activeCount;
          const hue = Math.round(52 + (90 * index) / (count - 1));
          return (
            <span
              key={index}
              className={cn(
                "h-2 rounded-full transition-colors duration-75",
                !isActive && "bg-foreground/12",
              )}
              style={
                isActive
                  ? { backgroundColor: `hsl(${hue}, 85%, 55%)` }
                  : undefined
              }
            />
          );
        })}
      </div>
    );
  };

  // ---- Tabs ---------------------------------------------------------------
  const renderAudioTab = () => (
    <>
      <SettingsGroup label="Microphone">
        <SettingsCard>
          <SettingsRow
            title="Input device"
            description={
              isMicrophoneEnabled
                ? "Speak to check the level."
                : "Unmute to see your input level."
            }
            control={
              !isMicrophoneEnabled && (
                <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[0.7rem] font-medium text-red-500">
                  Muted
                </span>
              )
            }
          >
            {renderDeviceSelect(
              "audioinput",
              microphoneDevices,
              microphone.activeDeviceId,
              "Microphone",
            )}
            <div className="flex items-center gap-3 px-0.5">
              <RiMicLine className="size-4 shrink-0 text-foreground/45" />
              {renderLevelMeter()}
            </div>
          </SettingsRow>
          <SettingsRow
            icon={<Headphones className="size-4" />}
            title="Wearing headphones?"
            description="Headphones turn echo cancellation off so you sound clearer. On speakers it stays on to stop echo."
            control={renderSegmented(
              usingHeadphones ? "yes" : "no",
              [
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ],
              (value) => void setHeadphones(value === "yes"),
              isApplyingHeadphones,
            )}
          />
        </SettingsCard>
      </SettingsGroup>

      <SettingsGroup label="Speaker">
        <SettingsCard>
          <SettingsRow
            title="Output device"
            description={
              canSelectAudioOutput
                ? null
                : "This browser plays call audio through your system's default output."
            }
            control={
              <button
                type="button"
                onClick={() => void toggleSpeakerTest()}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                  isTestingSpeaker
                    ? "border-brand/40 bg-brand/15 text-foreground"
                    : "border-call-border bg-call-background text-foreground/80 hover:bg-primary-hover",
                )}
              >
                {isTestingSpeaker ? (
                  <Square className="size-3.5 fill-current" />
                ) : (
                  <Play className="size-3.5 fill-current" />
                )}
                {isTestingSpeaker ? "Stop" : "Test"}
              </button>
            }
          >
            {canSelectAudioOutput &&
              renderDeviceSelect(
                "audiooutput",
                speakerDevices,
                speaker.activeDeviceId,
                "Speaker",
              )}
          </SettingsRow>
          <SettingsRow title="Call volume">
            <div className="flex items-center gap-3 px-0.5">
              <RiVolumeUpLine className="size-4 shrink-0 text-foreground/45" />
              <input
                type="range"
                min={0}
                max={100}
                value={outputVolume}
                onChange={(event) =>
                  onOutputVolumeChange(Number(event.target.value))
                }
                aria-label="Call volume"
                className="volume-slider h-1.5 min-w-0 flex-1 cursor-pointer"
                style={
                  { "--volume-progress": `${outputVolume}%` } as CSSProperties
                }
              />
              <span className="w-9 shrink-0 text-right text-xs tabular-nums text-foreground/60">
                {outputVolume}%
              </span>
            </div>
          </SettingsRow>
        </SettingsCard>
      </SettingsGroup>
    </>
  );

  const renderVideoTab = () => {
    const cameraLabel =
      cleanDeviceLabel(
        cameraDevices.find((d) => d.deviceId === camera.activeDeviceId)
          ?.label ?? "",
      ) || "Camera";
    const captureHeight =
      liveCameraTrack?.mediaStreamTrack.getSettings().height;

    return (
      <>
        <SettingsCard>
          <div className="p-3">
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-call-primary">
              {liveCameraTrack ? (
                <>
                  <video
                    ref={selfViewRef}
                    autoPlay
                    muted
                    playsInline
                    className="h-full w-full scale-x-[-1] object-cover"
                  />
                  <div className="pointer-events-none absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
                    {captureHeight ? (
                      <span className="rounded-md bg-black/55 px-1.5 py-0.5 text-[0.65rem] font-medium tabular-nums text-white backdrop-blur-sm">
                        {captureHeight >= 2160 ? "4K" : `${captureHeight}p`}
                      </span>
                    ) : (
                      <span />
                    )}
                    {isLowLight && <LowLightBadge />}
                  </div>
                  <div className="pointer-events-none absolute inset-x-2.5 bottom-2.5 flex items-end justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
                      <FiVideo className="size-3.5 shrink-0" />
                      <span className="truncate">{cameraLabel}</span>
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                  <span className="flex size-14 items-center justify-center rounded-full bg-primary-hover text-foreground/55">
                    <FiVideoOff className="size-6" />
                  </span>
                  {isAudioOnly ? (
                    <>
                      <p className="text-sm font-medium text-foreground">
                        This call is audio-only
                      </p>
                      <p className="max-w-[280px] text-xs leading-5 text-foreground/55">
                        The host turned cameras off. You can still pick a camera
                        and background for later.
                      </p>
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Your camera is off
                        </p>
                        <p className="mt-0.5 text-xs text-foreground/55">
                          Turn it on to see how you look.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onTurnOnCamera}
                        className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-85"
                      >
                        <FiVideo className="size-4" />
                        Turn on camera
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <SettingsRow title="Camera">
            {renderDeviceSelect(
              "videoinput",
              cameraDevices,
              camera.activeDeviceId,
              "Camera",
            )}
          </SettingsRow>
        </SettingsCard>

        {isBackgroundSupported && (
          <SettingsGroup label="Background">
            <SettingsCard>
              <SettingsRow
                title="Background effect"
                description={
                  liveCameraTrack
                    ? "Blur or replace what's behind you. Others see it right away."
                    : "Blur or replace what's behind you. Used next time your camera is on."
                }
              >
                <BackgroundOptionsGrid
                  value={background}
                  customImageUrl={customImageUrl}
                  pendingKey={pendingBackgroundKey}
                  showLabels
                  className="grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-4"
                  onSelect={(next) => void selectBackground(next)}
                  onUploadClick={() => backgroundFileRef.current?.click()}
                />
                <input
                  ref={backgroundFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    void handleBackgroundUpload(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </SettingsRow>
            </SettingsCard>
          </SettingsGroup>
        )}

        <SettingsGroup label="Preferences">
          <SettingsCard>
            <SettingsRow
              icon={<ScanFace className="size-4" />}
              title="Preview before turning on"
              description="Check framing, lighting and background before others see you."
              control={
                <Switch
                  checked={previewCamera}
                  label="Preview camera before turning it on"
                  onChange={(next) => {
                    setPreviewCamera(next);
                    setPreviewCameraState(next);
                  }}
                />
              }
            />
          </SettingsCard>
        </SettingsGroup>
      </>
    );
  };

  const renderGeneralTab = () => (
    <>
      {isHost && space && (
        <SettingsGroup label="Space">
          <SettingsCard>
            <SpaceDetailsForm
              key={space.id}
              spaceId={space.id}
              title={space.title ?? ""}
              description={space.description ?? ""}
              onPendingChange={(pending) => setFormPending("space", pending)}
              onSaveResult={setLastSaveOk}
            />
          </SettingsCard>
        </SettingsGroup>
      )}

      <SettingsGroup label="About you">
        <SettingsCard>
          <DisplayNameForm
            spaceId={space?.id}
            roomCode={roomCode}
            avatar={user?.avatar ?? undefined}
            currentName={localParticipant.name ?? ""}
            onPendingChange={(pending) => setFormPending("name", pending)}
            onSaveResult={setLastSaveOk}
          />
        </SettingsCard>
      </SettingsGroup>

      <SettingsGroup label="Preferences">
        <SettingsCard>
          <SettingsRow title="Theme">
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: "light", label: "Light", icon: Sun },
                  { value: "dark", label: "Dark", icon: Moon },
                  { value: "system", label: "System", icon: Monitor },
                ] as const
              ).map(({ value, label, icon: Icon }) => {
                const selected = (theme ?? "system") === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setTheme(value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border bg-call-background px-3 py-3 text-sm font-medium transition-colors",
                      selected
                        ? "border-brand text-foreground ring-1 ring-brand"
                        : "border-call-border text-foreground/60 hover:bg-primary-hover hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                );
              })}
            </div>
          </SettingsRow>
          <SettingsRow
            title="Call sounds"
            description="Sounds for muting, camera on/off and people joining or leaving."
            control={
              <Switch
                checked={soundsEnabled}
                label="Call sounds"
                onChange={(next) => {
                  setCallSoundsEnabled(next);
                  setSoundsEnabled(next);
                }}
              />
            }
          />
        </SettingsCard>
      </SettingsGroup>
    </>
  );

  const activeTab = tabs.find((item) => item.id === tab) ?? tabs[0];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in-0"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <audio ref={speakerTestRef} className="hidden" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="call-settings-title"
        className="relative flex h-[min(640px,calc(100dvh-2rem))] w-[min(900px,100%)] overflow-hidden rounded-2xl border border-call-border bg-call-background shadow-2xl animate-in fade-in-0 zoom-in-95 max-sm:flex-col"
      >
        <aside className="flex shrink-0 flex-col gap-4 bg-primary/40 p-3 sm:w-52 sm:border-r sm:border-call-border max-sm:gap-2 max-sm:border-b max-sm:border-call-border">
          <h2
            id="call-settings-title"
            className="px-2.5 pt-1.5 text-base font-semibold text-foreground max-sm:pr-10"
          >
            Settings
          </h2>
          <nav className="flex gap-1 sm:flex-col scrollbar-hide max-sm:overflow-x-auto">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-current={tab === item.id ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                  tab === item.id
                    ? "bg-primary-hover text-foreground"
                    : "text-foreground/60 hover:bg-primary-hover/60 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "transition-colors",
                    tab === item.id ? "text-foreground" : "text-foreground/50",
                  )}
                >
                  {item.icon}
                </span>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="mt-auto max-sm:hidden">
            <SaveStatus status={saveStatus} />
          </div>
        </aside>

        <button
          type="button"
          aria-label="Close settings"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full bg-primary-hover text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground"
        >
          <X className="size-4" />
        </button>

        <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-6 px-6 pb-8 pt-6 max-sm:px-4">
            <header className="pr-8">
              <h3 className="text-lg font-semibold text-foreground">
                {activeTab.label}
              </h3>
              <p className="mt-0.5 text-sm text-foreground/55">
                {TAB_DESCRIPTIONS[activeTab.id]}
              </p>
            </header>
            {tab === "general" && renderGeneralTab()}
            {tab === "audio" && renderAudioTab()}
            {tab === "video" && renderVideoTab()}
            {tab === "recording" && user && (
              <RecordingSettings
                variant="call"
                locked={isRecordingActive}
                note={
                  isRecordingActive
                    ? "Recording settings are locked while a recording is in progress."
                    : isHost
                      ? "Changes apply right away. Audio only turns off everyone's camera and screen share in this call."
                      : "Recordings in this call use the host's settings. Yours apply to calls you host."
                }
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ---- Layout pieces ----------------------------------------------------------

const SettingsGroup = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <section className="flex flex-col gap-2">
    <h4 className="px-1 text-[0.7rem] font-semibold uppercase tracking-wider text-foreground/45">
      {label}
    </h4>
    {children}
  </section>
);

const SettingsCard = ({ children }: { children: ReactNode }) => (
  <div className="divide-y divide-call-border overflow-hidden rounded-xl border border-call-border bg-primary/40">
    {children}
  </div>
);

// One setting: optional icon tile, title + description, a control on the
// right, and anything wider (selects, grids) underneath.
const SettingsRow = ({
  icon,
  title,
  description,
  control,
  children,
}: {
  icon?: ReactNode;
  title: string;
  description?: string | null;
  control?: ReactNode;
  children?: ReactNode;
}) => (
  <div className="flex flex-col gap-3 p-4">
    <div className="flex items-center gap-3">
      {icon && (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-hover text-foreground/70">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="mt-0.5 text-xs leading-5 text-foreground/55">
            {description}
          </p>
        )}
      </div>
      {control && <div className="shrink-0">{control}</div>}
    </div>
    {children}
  </div>
);

const inputClassName =
  "w-full rounded-lg border border-call-border bg-call-background px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/40 transition-colors focus:border-brand focus:outline-none";

const fieldLabelClassName = "text-xs font-medium text-foreground/60";

// Wait this long after the last keystroke before saving, so typing a name
// sends one request instead of one per character.
const AUTOSAVE_DELAY_MS = 1000;

interface AutosaveOptions<T> {
  isValid: (value: T) => boolean;
  save: (value: T) => void;
  /** True while an edit is waiting out the debounce. */
  onPendingChange: (pending: boolean) => void;
}

/**
 * Debounced autosave: saves `value` AUTOSAVE_DELAY_MS after it stops changing,
 * skips values that are invalid or already saved, and flushes a pending edit
 * if the form unmounts (the dialog closes) before the timer fires.
 */
function useDebouncedAutosave<T>(
  value: T,
  initialValue: T,
  options: AutosaveOptions<T>,
) {
  const key = JSON.stringify(value);
  const lastSavedKeyRef = useRef(JSON.stringify(initialValue));
  const latestRef = useRef(value);
  const optionsRef = useRef(options);
  useEffect(() => {
    latestRef.current = value;
    optionsRef.current = options;
  });

  useEffect(() => {
    const { isValid, onPendingChange } = optionsRef.current;
    const next = latestRef.current;
    if (key === lastSavedKeyRef.current || !isValid(next)) {
      onPendingChange(false);
      return;
    }
    onPendingChange(true);
    const timer = window.setTimeout(() => {
      lastSavedKeyRef.current = key;
      optionsRef.current.onPendingChange(false);
      optionsRef.current.save(next);
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [key]);

  useEffect(() => {
    const lastSavedKey = lastSavedKeyRef;
    const latest = latestRef;
    const latestOptions = optionsRef;
    return () => {
      const pendingKey = JSON.stringify(latest.current);
      if (
        pendingKey !== lastSavedKey.current &&
        latestOptions.current.isValid(latest.current)
      ) {
        lastSavedKey.current = pendingKey;
        latestOptions.current.save(latest.current);
      }
    };
  }, []);
}

interface AutosaveFormProps {
  onPendingChange: (pending: boolean) => void;
  onSaveResult: (ok: boolean) => void;
}

// Host only: the space's title and description.
const SpaceDetailsForm = ({
  spaceId,
  title,
  description,
  onPendingChange,
  onSaveResult,
}: AutosaveFormProps & {
  spaceId: string;
  title: string;
  description: string;
}) => {
  const updateSpace = useUpdateSpace(spaceId);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftDescription, setDraftDescription] = useState(description);
  const isTitleEmpty = !draftTitle.trim();

  useDebouncedAutosave(
    { title: draftTitle.trim(), description: draftDescription.trim() },
    { title: title.trim(), description: description.trim() },
    {
      isValid: (value) => !!value.title,
      save: (value) =>
        updateSpace.mutate(value, {
          onSuccess: () => onSaveResult(true),
          onError: () => onSaveResult(false),
        }),
      onPendingChange,
    },
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <label className="flex flex-col gap-1.5">
        <span className={fieldLabelClassName}>Title</span>
        <input
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          placeholder="Give your space a title"
          maxLength={100}
          aria-invalid={isTitleEmpty}
          className={cn(
            inputClassName,
            isTitleEmpty && "border-red-500/60 focus:border-red-500",
          )}
        />
        {isTitleEmpty && (
          <span className="text-xs text-red-500">
            The title can't be empty.
          </span>
        )}
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={fieldLabelClassName}>Description</span>
        <textarea
          value={draftDescription}
          onChange={(event) => setDraftDescription(event.target.value)}
          placeholder="What's this session about?"
          rows={3}
          maxLength={500}
          className={cn(inputClassName, "resize-none")}
        />
      </label>
    </div>
  );
};

// Your display name in this call (LiveKit + the participant record).
const DisplayNameForm = ({
  spaceId,
  roomCode,
  avatar,
  currentName,
  onPendingChange,
  onSaveResult,
}: AutosaveFormProps & {
  spaceId: string | undefined;
  roomCode: string;
  avatar?: string;
  currentName: string;
}) => {
  const renameSelf = useRenameSelf(spaceId ?? "");
  const [draftName, setDraftName] = useState(currentName);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const trimmed = draftName.trim();

  useDebouncedAutosave(trimmed, currentName.trim(), {
    isValid: (value) => !!spaceId && !!value,
    save: (value) =>
      renameSelf.mutate(
        {
          displayName: value,
          participantSessionId: getOrCreateSessionId(roomCode),
        },
        {
          onSuccess: () => onSaveResult(true),
          onError: () => onSaveResult(false),
        },
      ),
    onPendingChange,
  });

  return (
    <div className="flex items-center gap-3 p-4">
      <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand text-base font-semibold text-white">
        {avatar && !avatarFailed ? (
          <img
            src={avatar}
            alt=""
            onError={() => setAvatarFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          (trimmed || currentName || "?").charAt(0).toUpperCase()
        )}
      </span>
      <label className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className={fieldLabelClassName}>Display name</span>
        <input
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          placeholder="Your name"
          maxLength={MAX_NAME_LENGTH}
          className={inputClassName}
        />
      </label>
    </div>
  );
};

// Bottom of the sidebar: what's happening with the autosaved settings.
const SaveStatus = ({ status }: { status: SaveState }) => {
  if (status === "idle") return null;
  return (
    <p
      role="status"
      className={cn(
        "flex items-center gap-1.5 px-2.5 pb-1 text-xs",
        status === "error" ? "text-red-500" : "text-foreground/50",
      )}
    >
      {status === "saving" ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : status === "saved" ? (
        <Check className="size-3.5" />
      ) : (
        <AlertCircle className="size-3.5" />
      )}
      {status === "saving"
        ? "Saving…"
        : status === "saved"
          ? "All changes saved"
          : "Couldn't save changes"}
    </p>
  );
};

export default CallSettingsDialog;
