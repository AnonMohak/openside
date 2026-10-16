import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { DEMO_FPS } from "@/lib/recordingConstants";
import { useGetMe } from "@/hooks/useUserQuery";
import { useUpdateRecordingSettings } from "@/hooks/useProfile";
import { useUsage } from "@/hooks/useUsage";
import Switch from "@/components/shared/ui/switch";

const FRAME_RATE_OPTIONS: {
  value: number;
  label: string;
  hint: string;
  recommended?: boolean;
}[] = [
  { value: 24, label: "24 FPS", hint: "Cinematic" },
  { value: 30, label: "30 FPS", hint: "Standard (web)", recommended: true },
];

const VIDEO_RESOLUTION_OPTIONS = [
  { value: 720 as const, label: "720p", hint: "HD" },
  { value: 1080 as const, label: "1080p", hint: "Full HD" },
  {
    value: 2160 as const,
    label: "4K",
    hint: "Highest quality",
    recommended: true,
  },
];

const AUDIO_SAMPLE_RATE_OPTIONS = [
  { value: 44100 as const, label: "44.1 kHz" },
  { value: 48000 as const, label: "48 kHz", recommended: true },
];

/**
 * The user-level recording preferences (mode, frame rate, resolution, sample
 * rate, noise reduction, cloud backup). Shared by the dashboard settings page
 * and the in-call settings dialog.
 */
const RecordingSettings = ({
  note,
  variant = "page",
  locked = false,
}: {
  note?: string;
  /** Disable every control (e.g. while a recording is running). */
  locked?: boolean;
  /** "call": the in-call settings dialog's tighter card styling. */
  variant?: "page" | "call";
}) => {
  const isCall = variant === "call";
  const cardClassName = isCall
    ? "rounded-xl border border-call-border bg-primary/40 p-4"
    : "rounded-lg border border-border bg-background p-5";
  const headingClassName = isCall
    ? "text-sm font-semibold text-foreground"
    : "text-base font-semibold text-foreground";
  const descriptionClassName = isCall
    ? "mt-0.5 max-w-md text-xs leading-5 text-foreground/55"
    : "mt-1 max-w-md text-sm text-fg-muted";
  const { data: user, isLoading } = useGetMe();
  const { data: usage } = useUsage();
  const updateRecording = useUpdateRecordingSettings();
  const isBusy = updateRecording.isPending || locked;

  const cloudBackupAllowed = usage ? usage.plan !== "demo" : false;
  const enabled = user?.cloudBackupEnabled ?? false;
  // DEMO is locked to 24 FPS (enforced server-side at session start); show that
  // as the active, unchangeable choice regardless of any stored preference.
  const isDemo = usage ? usage.plan === "demo" : false;
  const targetFps = isDemo ? DEMO_FPS : (user?.targetFps ?? 30);
  const videoResolution = isDemo ? 720 : (user?.videoResolution ?? 2160);
  const audioSampleRate = isDemo ? 44100 : (user?.audioSampleRate ?? 48000);
  const recordingMode = user?.recordingMode ?? "VIDEO_AND_AUDIO";
  const noiseReductionEnabled =
    (user?.noiseSuppression ?? false) || (user?.autoGainControl ?? false);

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-lg bg-muted" />;
  }

  return (
    <div className={cn("flex flex-col", isCall ? "gap-3" : "gap-6")}>
      {note && (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs leading-5 text-fg-muted">
          {note}
        </p>
      )}
      <div className={cardClassName}>
        <h3 className={headingClassName}>Recording mode</h3>
        <p className={descriptionClassName}>
          Audio-only recordings skip video capture and produce lossless WAV and
          MP3 downloads.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-md">
          {[
            ["VIDEO_AND_AUDIO", "Video + Audio", "Default"],
            ["AUDIO_ONLY", "Audio only", "PCM master only"],
          ].map(([value, label, hint]) => {
            const selected = recordingMode === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                disabled={isBusy}
                onClick={() =>
                  updateRecording.mutate(
                    {
                      recordingMode: value as "VIDEO_AND_AUDIO" | "AUDIO_ONLY",
                    },
                    {
                      onError: () =>
                        toast.error("Couldn't update recording mode."),
                    },
                  )
                }
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors disabled:opacity-60",
                  selected
                    ? "border-brand ring-1 ring-brand"
                    : "border-border hover:border-fg-faint",
                )}
              >
                <span className="text-sm font-medium text-foreground">
                  {label}
                </span>
                <span className="text-xs text-fg-muted">{hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Frame rate - applies to every participant when you host a session. */}
      <div className={cardClassName}>
        <h3 className={headingClassName}>Frame rate</h3>
        <p className={descriptionClassName}>
          The frame rate your recordings capture at. When you host, this applies
          to everyone in the session so all tracks stay in sync.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-sm">
          {FRAME_RATE_OPTIONS.map(({ value, label, hint, recommended }) => {
            const selected = targetFps === value;
            // On DEMO the whole control is locked to 24.
            const locked = isDemo;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                disabled={locked || isBusy}
                onClick={() =>
                  updateRecording.mutate(
                    { targetFps: value },
                    {
                      onError: () => toast.error("Couldn't update frame rate."),
                    },
                  )
                }
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors disabled:opacity-60",
                  selected ? "border-brand ring-1 ring-brand" : "border-border",
                  !locked && !selected && "hover:border-fg-faint",
                  locked ? "cursor-not-allowed" : "cursor-pointer",
                )}
              >
                <span className="flex w-full items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {label}
                  </span>
                  {recommended && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fg-muted">
                      Default
                    </span>
                  )}
                </span>
                <span className="text-xs text-fg-muted">{hint}</span>
              </button>
            );
          })}
        </div>
        {isDemo && (
          <p className="mt-2 text-xs text-warning">
            Demo records at 24 FPS. Upgrade to Pro to record at 30 FPS.
          </p>
        )}
      </div>

      <div className={cardClassName}>
        <h3 className={headingClassName}>Video resolution</h3>
        <p className={descriptionClassName}>
          Caps camera capture height for recordings you host.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:max-w-md">
          {VIDEO_RESOLUTION_OPTIONS.map(
            ({ value, label, hint, recommended }) => {
              const selected = videoResolution === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  disabled={isDemo || isBusy}
                  onClick={() =>
                    updateRecording.mutate(
                      { videoResolution: value },
                      {
                        onError: () =>
                          toast.error("Couldn't update video resolution."),
                      },
                    )
                  }
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors disabled:opacity-60",
                    selected
                      ? "border-brand ring-1 ring-brand"
                      : "border-border",
                    !isDemo && !selected && "hover:border-fg-faint",
                    isDemo ? "cursor-not-allowed" : "cursor-pointer",
                  )}
                >
                  <span className="flex w-full items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      {label}
                    </span>
                    {isDemo && selected ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fg-muted">
                        Demo
                      </span>
                    ) : (
                      recommended && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fg-muted">
                          Default
                        </span>
                      )
                    )}
                  </span>
                  <span className="text-xs text-fg-muted">{hint}</span>
                </button>
              );
            },
          )}
        </div>
        {isDemo && (
          <p className="mt-2 text-xs text-warning">
            Demo records at 720p. Upgrade to Pro to change this.
          </p>
        )}
      </div>

      <div className={cardClassName}>
        <h3 className={headingClassName}>Audio sample rate</h3>
        <p className={descriptionClassName}>
          Requested for the lossless PCM recording master. Your device may use a
          different actual rate.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-sm">
          {AUDIO_SAMPLE_RATE_OPTIONS.map(({ value, label, recommended }) => {
            const selected = audioSampleRate === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                disabled={isDemo || isBusy}
                onClick={() =>
                  updateRecording.mutate(
                    { audioSampleRate: value },
                    {
                      onError: () =>
                        toast.error("Couldn't update audio sample rate."),
                    },
                  )
                }
                className={cn(
                  "flex items-center justify-between rounded-lg border p-3 text-left transition-colors disabled:opacity-60",
                  selected ? "border-brand ring-1 ring-brand" : "border-border",
                  !isDemo && !selected && "hover:border-fg-faint",
                  isDemo ? "cursor-not-allowed" : "cursor-pointer",
                )}
              >
                <span className="text-sm font-medium text-foreground">
                  {label}
                </span>
                {isDemo && selected ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fg-muted">
                    Demo
                  </span>
                ) : (
                  recommended && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fg-muted">
                      Default
                    </span>
                  )
                )}
              </button>
            );
          })}
        </div>
        {isDemo && (
          <p className="mt-2 text-xs text-warning">
            Demo requests 44.1 kHz PCM. Upgrade to Pro to change this.
          </p>
        )}
      </div>

      <div className={cardClassName}>
        <h3 className={headingClassName}>Noise reduction</h3>
        <p className={descriptionClassName}>
          These controls affect only the recorded PCM master, not your live
          call.
        </p>
        <div className="mt-4 flex flex-col gap-4">
          {[
            [
              "Noise suppression",
              "noiseSuppression",
              user?.noiseSuppression ?? false,
            ],
            [
              "Automatic gain control",
              "autoGainControl",
              user?.autoGainControl ?? false,
            ],
          ].map(([label, setting, checked]) => (
            <div
              key={setting as string}
              className="flex items-center justify-between gap-4"
            >
              <span className="text-sm font-medium text-foreground">
                {label}
              </span>
              <Switch
                checked={checked as boolean}
                disabled={isBusy}
                label={label as string}
                onChange={(value) =>
                  updateRecording.mutate(
                    { [setting as string]: value },
                    {
                      onError: () =>
                        toast.error(
                          "Couldn't update noise reduction settings.",
                        ),
                    },
                  )
                }
              />
            </div>
          ))}
        </div>
        {noiseReductionEnabled && (
          <p className="mt-3 text-xs text-warning">
            Applied while recording, can't be removed later.
          </p>
        )}
      </div>

      <div className={cardClassName}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className={headingClassName}>Cloud backup</h3>
            <p className={descriptionClassName}>
              When on, each recording also gets a server-side cloud backup as a
              safety net if a local upload fails. Off by default. When off, no
              cloud recording is made - only the local capture.
            </p>
            {!cloudBackupAllowed && (
              <p className="mt-2 text-xs text-warning">
                Cloud backup is available on Pro and self-host plans.
              </p>
            )}
          </div>
          <Switch
            checked={enabled}
            disabled={!cloudBackupAllowed || isBusy}
            label="Cloud backup"
            onChange={(value) =>
              updateRecording.mutate(
                { cloudBackupEnabled: value },
                {
                  onError: () =>
                    toast.error("Couldn't update recording settings."),
                },
              )
            }
          />
        </div>
      </div>
    </div>
  );
};

export default RecordingSettings;
