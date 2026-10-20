/**
 * Settings - sectioned: Profile, Appearance, Plan & billing, Self-host,
 * Recording (the last shared with the in-call settings dialog).
 *
 * Everything shown comes from the server. Profile edits (name and avatar) and
 * the recording preference use optimistic updates so the UI reacts
 * instantly and rolls back on failure. Email is the Clerk login identity and is
 * read-only here. Secrets (self-host keys) are never shown back - only masked.
 */

import { isAxiosError } from "axios";
import {
  Check,
  CreditCard,
  Loader2,
  Lock,
  Monitor,
  Moon,
  Palette,
  Server,
  Sun,
  Upload,
  User as UserIcon,
  Video,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useGetMe } from "@/hooks/useUserQuery";
import RecordingSettings from "@/components/settings/RecordingSettings";
import Switch from "@/components/shared/ui/switch";
import {
  useRemoveAvatar,
  useUpdateProfile,
  useUploadAvatar,
} from "@/hooks/useProfile";
import {
  useBillingPortal,
  useCreateCheckout,
  useDeleteSelfHostConfig,
  useSaveSelfHostConfig,
  useSelfHostConfig,
  useToggleSelfHost,
  useUsage,
  type SelfHostConfigInput,
} from "@/hooks/useUsage";

type SectionId =
  | "profile"
  | "appearance"
  | "billing"
  | "selfhost"
  | "recording";

const SECTIONS: { id: SectionId; label: string; icon: typeof UserIcon }[] = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "billing", label: "Plan & billing", icon: CreditCard },
  { id: "selfhost", label: "Self-host", icon: Server },
  { id: "recording", label: "Recording", icon: Video },
];

const PLAN_LABELS: Record<string, string> = {
  demo: "Demo",
  pro: "Pro",
  selfhost: "Self-host",
};

const PLAN_NOTES: Record<string, string> = {
  demo: "15 minutes of recording credit, 1080p, watermark, recordings kept for 48 hours.",
  pro: "20 hours every month, 4K, no watermark, cloud backup opt-in, recordings kept for 30 days.",
  selfhost:
    "Your own LiveKit + R2 keys. No limits, no watermark, no metering - your keys, your bill.",
};

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  const seconds = Math.floor(totalSeconds % 60);
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

// A small accessible on/off switch.
const Avatar = ({
  src,
  name,
  size = 64,
}: {
  src?: string | null;
  name?: string;
  size?: number;
}) => {
  const initials = (name || "U")
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <span
      className="flex items-center justify-center overflow-hidden rounded-full bg-muted text-lg font-semibold text-foreground ring-1 ring-border/50"
      style={{
        width: size,
        height: size,
      }}
    >
      {src ? (
        <img
          src={src}
          alt={name || "Avatar"}
          className="size-full object-cover"
        />
      ) : (
        <span>{initials}</span>
      )}
    </span>
  );
};

// PROFILE ---------------------------------------------------------------------

const ProfileSection = () => {
  const { data: user, isLoading } = useGetMe();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const removeAvatar = useRemoveAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");

  // Seed local state from the server once it arrives / changes.
  useEffect(() => {
    if (user?.name !== undefined) setName(user.name ?? "");
  }, [user?.name]);

  const nameDirty = user ? name.trim() !== (user.name ?? "") : false;

  const saveName = () => {
    if (!nameDirty || !name.trim()) return;
    updateProfile.mutate(
      { name: name.trim() },
      { onError: () => toast.error("Couldn't update your name.") },
    );
  };

  const onFilePicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Avatar must be under 5 MB.");
      return;
    }
    uploadAvatar.mutate(file, {
      onError: (error) => {
        const message =
          isAxiosError(error) && error.response?.data?.message
            ? (error.response.data.message as string)
            : "Couldn't upload that image.";
        toast.error(message);
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-28 animate-pulse rounded-xl bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Profile</h2>
        <p className="mt-0.5 text-sm text-fg-muted">
          How you appear to others in calls and shared recordings.
        </p>
      </div>

      {/* Avatar */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/50 bg-primary p-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadAvatar.isPending}
          aria-label="Change avatar"
          className="group relative shrink-0 cursor-pointer rounded-full disabled:cursor-wait"
        >
          <Avatar src={user?.avatar} name={user?.name} size={64} />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 group-disabled:opacity-100">
            {uploadAvatar.isPending ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Upload className="size-5" />
            )}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {user?.name || "Your name"}
          </p>
          <p className="truncate text-xs text-fg-subtle">{user?.email}</p>
          <p className="mt-1.5 text-xs text-fg-subtle">
            PNG, JPEG, WebP, or GIF. Up to 5 MB.
          </p>
        </div>
        <div className="flex gap-2">
          {user?.avatar && (
            <button
              type="button"
              onClick={() =>
                removeAvatar.mutate(undefined, {
                  onError: () => toast.error("Couldn't remove your avatar."),
                })
              }
              disabled={removeAvatar.isPending}
              className="h-9 cursor-pointer rounded-lg bg-danger/10 px-3 text-sm font-medium text-danger transition-colors hover:bg-danger/15 disabled:opacity-50"
            >
              Remove
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadAvatar.isPending}
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-foreground px-3 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
          >
            {uploadAvatar.isPending ? "Uploading…" : "Upload new"}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={onFilePicked}
          className="hidden"
        />
      </div>

      {/* Details */}
      <div className="divide-y divide-border/50 rounded-xl border border-border/50 bg-primary">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Name</p>
            <p className="mt-0.5 text-xs text-fg-subtle">
              Shown on your calls and recordings.
            </p>
          </div>
          <div className="flex gap-2 sm:w-80">
            <input
              type="text"
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") saveName();
              }}
              aria-label="Name"
              className="h-9 min-w-0 flex-1 rounded-lg border border-border/50 bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-fg-faint"
            />
            {nameDirty && (
              <button
                type="button"
                onClick={saveName}
                disabled={updateProfile.isPending || !name.trim()}
                className="h-9 cursor-pointer rounded-lg bg-brand px-3.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Save
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Email</p>
            <p className="mt-0.5 text-xs text-fg-subtle">
              Your sign-in email. It can't be changed here.
            </p>
          </div>
          <div className="flex h-9 items-center gap-2 rounded-lg border border-border/50 bg-muted/50 px-3 text-sm text-fg-muted sm:w-80">
            <Lock className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate">{user?.email}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// APPEARANCE ------------------------------------------------------------------

/** Fixed light/dark mock so each card shows its theme regardless of the active one. */
const ThemePreview = ({ id }: { id: string }) => {
  if (id === "system") {
    return (
      <div className="relative h-24 overflow-hidden rounded-md border border-border">
        <div className="absolute inset-0 flex">
          <div className="flex-1 bg-white" />
          <div className="flex-1 bg-neutral-900" />
        </div>
        <div className="absolute left-2 top-2 h-1.5 w-8 rounded-full bg-neutral-300" />
        <div className="absolute right-2 top-2 h-1.5 w-8 rounded-full bg-neutral-600" />
        <div className="absolute bottom-2 left-2 size-3 rounded-full bg-brand" />
        <div className="absolute bottom-2 right-2 size-3 rounded-full bg-brand" />
      </div>
    );
  }

  const dark = id === "dark";
  return (
    <div
      className={cn(
        "relative h-24 overflow-hidden rounded-md border",
        dark
          ? "border-neutral-700 bg-neutral-900"
          : "border-neutral-200 bg-white",
      )}
    >
      <div
        className={cn(
          "absolute left-2 top-2 h-1.5 w-10 rounded-full",
          dark ? "bg-neutral-600" : "bg-neutral-300",
        )}
      />
      <div
        className={cn(
          "absolute left-2 top-5 h-1.5 w-6 rounded-full",
          dark ? "bg-neutral-700" : "bg-neutral-200",
        )}
      />
      <div className="absolute bottom-2 left-2 size-3 rounded-full bg-brand" />
    </div>
  );
};

const AppearanceSection = () => {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const activeTheme = theme === "system" ? "system" : resolvedTheme;
  const themeOptions: { id: string; label: string; icon: typeof Sun }[] = [
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
    { id: "system", label: "System", icon: Monitor },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Appearance</h2>
        <p className="mt-0.5 text-sm text-fg-muted">
          Choose how Openside looks. System follows your device setting.
        </p>
      </div>

      {/* Theme */}
      <div className="rounded-xl border border-border/50 bg-primary p-4">
        <p className="text-sm font-medium text-foreground">Theme</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {themeOptions.map(({ id, label, icon: Icon }) => {
            const selected = activeTheme === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTheme(id)}
                aria-pressed={selected}
                className={cn(
                  "flex cursor-pointer flex-col gap-2.5 rounded-lg border bg-background p-2 text-left transition-colors",
                  selected
                    ? "border-brand ring-1 ring-brand"
                    : "border-border/50 hover:border-fg-faint",
                )}
              >
                <ThemePreview id={id} />
                <div className="flex items-center justify-between px-1 pb-0.5">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Icon size={14} />
                    {label}
                  </span>
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                      selected
                        ? "border-brand bg-brand text-white"
                        : "border-border",
                    )}
                  >
                    {selected && <Check size={11} strokeWidth={3} />}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// PLAN & BILLING / SELF-HOST --------------------------------------------------

type SelfHostField = {
  key: keyof SelfHostConfigInput;
  label: string;
  placeholder: string;
  secret?: boolean;
  /** Spans both columns. */
  wide?: boolean;
};

// Grouped by provider so the form reads as two short blocks, not one long grid.
const SELFHOST_GROUPS: { title: string; fields: SelfHostField[] }[] = [
  {
    title: "LiveKit",
    fields: [
      {
        key: "livekitUrl",
        label: "Server URL",
        placeholder: "wss://your-app.livekit.cloud",
        wide: true,
      },
      { key: "livekitApiKey", label: "API key", placeholder: "APIxxxxxxxx" },
      {
        key: "livekitApiSecret",
        label: "API secret",
        placeholder: "Your API secret",
        secret: true,
      },
    ],
  },
  {
    title: "Cloudflare R2",
    fields: [
      { key: "r2AccountId", label: "Account ID", placeholder: "1a2b3c4d…" },
      {
        key: "r2Bucket",
        label: "Bucket",
        placeholder: "openside-recordings",
      },
      {
        key: "r2AccessKeyId",
        label: "Access key ID",
        placeholder: "Your access key ID",
      },
      {
        key: "r2SecretAccessKey",
        label: "Secret access key",
        placeholder: "Your secret access key",
        secret: true,
      },
    ],
  },
];

const EMPTY_SELFHOST: SelfHostConfigInput = {
  livekitUrl: "",
  livekitApiKey: "",
  livekitApiSecret: "",
  r2AccountId: "",
  r2AccessKeyId: "",
  r2SecretAccessKey: "",
  r2Bucket: "",
};

const PlanBillingSection = ({
  onOpenSelfHost,
}: {
  onOpenSelfHost: () => void;
}) => {
  const { data: usage, isLoading: usageLoading } = useUsage();

  const checkout = useCreateCheckout();
  const portal = useBillingPortal();

  const plan = usage?.plan ?? "demo";
  const subscribed = usage?.subscribed ?? false;
  // A Pro subscriber recording on their own keys is still on the Pro plan -
  // they can switch back to our servers anytime from Self-host.
  const planKey = subscribed ? "pro" : plan;
  const percentUsed =
    usage?.limit && usage.limit > 0
      ? Math.min(100, Math.round((usage.used / usage.limit) * 100))
      : 0;

  const handleUpgrade = () =>
    checkout.mutate(undefined, {
      onSuccess: (url) => {
        window.location.href = url;
      },
      onError: () =>
        toast.error("Couldn't start checkout. Try again in a moment."),
    });

  const handlePortal = () =>
    portal.mutate(undefined, {
      onSuccess: (url) => {
        window.open(url, "_blank", "noopener,noreferrer");
      },
      onError: () =>
        toast.error("Couldn't open the billing portal. Try again."),
    });

  // Hold the whole section until the plan is known - otherwise it renders the
  // default "demo" state first and visibly flips to the real plan on load.
  if (usageLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="rounded-xl border border-border/50 bg-primary p-4">
          <div className="flex flex-col gap-3">
            <div className="h-6 w-40 animate-pulse rounded bg-muted" />
            <div className="h-4 w-64 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-10 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Plan & billing
        </h2>
        <p className="mt-0.5 text-sm text-fg-muted">
          Your plan, usage, and billing.
        </p>
      </div>

      {/* Plan + usage */}
      <div className="rounded-xl border border-border/50 bg-primary p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-foreground">Plan</h3>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
                  planKey === "pro"
                    ? "bg-success/10 text-success ring-success/30"
                    : planKey === "selfhost"
                      ? "bg-info/10 text-info ring-info/30"
                      : "bg-muted text-fg-muted ring-border",
                )}
              >
                {PLAN_LABELS[planKey]}
              </span>
            </div>
            <p className="mt-0.5 max-w-md text-xs leading-5 text-fg-subtle">
              {PLAN_NOTES[planKey]}
            </p>
          </div>
          <div className="flex gap-2">
            {subscribed ? (
              <button
                type="button"
                onClick={handlePortal}
                disabled={portal.isPending}
                className="h-9 cursor-pointer rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
              >
                {portal.isPending ? "Opening…" : "Manage billing"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleUpgrade}
                disabled={checkout.isPending}
                className="h-9 cursor-pointer rounded-lg bg-brand px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {checkout.isPending ? "Opening…" : "Upgrade to Pro - $8.99/mo"}
              </button>
            )}
          </div>
        </div>

        {usage && usage.limit !== null ? (
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-fg-muted">
                {formatDuration(usage.used)} of {formatDuration(usage.limit)}{" "}
                used
              </span>
              <span
                className={cn(
                  "font-medium",
                  usage.exhausted
                    ? "text-danger"
                    : usage.warning
                      ? "text-warning"
                      : "text-fg-muted",
                )}
              >
                {formatDuration(usage.remaining ?? 0)} left
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  usage.exhausted
                    ? "bg-danger"
                    : usage.warning
                      ? "bg-warning"
                      : "bg-foreground",
                )}
                style={{ width: `${percentUsed}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-fg-subtle">
              {usage.resets_at
                ? `Resets on ${new Date(usage.resets_at).toLocaleDateString()}.`
                : "This credit doesn't reset - upgrade to Pro for 20 hours every month."}
            </p>
          </div>
        ) : null}
      </div>

      {/* Where recordings run - the switch itself lives in Self-host. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 bg-primary p-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">
            {plan === "selfhost"
              ? "You're self-hosting on your own servers."
              : "Want to self-host on your own servers?"}
          </h3>
          <p className="mt-0.5 max-w-md text-xs leading-5 text-fg-subtle">
            {plan === "selfhost"
              ? "Calls and recordings run on your LiveKit and R2. Switch back to Openside cloud anytime."
              : "Use your own LiveKit and R2 keys to record free and unlimited."}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSelfHost}
          className={cn(
            "h-9 cursor-pointer rounded-lg px-4 text-sm font-medium transition-opacity",
            plan === "selfhost"
              ? "bg-muted text-foreground hover:opacity-80"
              : "bg-brand text-white hover:opacity-90",
          )}
        >
          {plan === "selfhost" ? "Manage" : "Set up"}
        </button>
      </div>
    </div>
  );
};

// SELF-HOST -------------------------------------------------------------------

const SelfHostSection = () => {
  const { data: usage } = useUsage();
  const { data: selfHost, isLoading: selfHostLoading } = useSelfHostConfig();

  const saveSelfHost = useSaveSelfHostConfig();
  const toggleSelfHost = useToggleSelfHost();
  const deleteSelfHost = useDeleteSelfHostConfig();

  const [form, setForm] = useState<SelfHostConfigInput>(EMPTY_SELFHOST);
  const [showForm, setShowForm] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const subscribed = usage?.subscribed ?? false;
  const cloudLabel = subscribed
    ? "Openside cloud (Pro)"
    : "Openside cloud (Demo)";

  const handleSaveSelfHost = (event: FormEvent) => {
    event.preventDefault();
    saveSelfHost.mutate(form, {
      onSuccess: () => {
        toast.success(
          "Keys validated and saved - new recordings go to your servers.",
        );
        setForm(EMPTY_SELFHOST);
        setShowForm(false);
      },
      onError: (error) => {
        const message =
          isAxiosError(error) && error.response?.data?.message
            ? (error.response.data.message as string)
            : "Failed to save keys.";
        toast.error(message, 8000);
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Self-host</h2>
        <p className="mt-0.5 text-sm text-fg-muted">
          Run calls and recordings on your own LiveKit and Cloudflare R2. Free
          and unlimited - your keys, your bill.
        </p>
      </div>

      {selfHostLoading ? (
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
      ) : (
        <>
          {/* Upload target switch - only meaningful once keys are saved. */}
          {selfHost && (
            <div className="flex items-start justify-between gap-4 rounded-xl border border-border/50 bg-primary p-4">
              <div>
                <h3 className="text-sm font-medium text-foreground">
                  Use my own servers
                </h3>
                <p className="mt-0.5 max-w-md text-xs leading-5 text-fg-subtle">
                  {selfHost.enabled
                    ? "New calls and recordings run on your LiveKit and upload to your R2 bucket."
                    : `New calls and recordings run on ${cloudLabel}.`}{" "}
                  Existing recordings stay where they were made and keep
                  playing.
                </p>
              </div>
              <Switch
                checked={selfHost.enabled}
                onChange={(enabled) =>
                  toggleSelfHost.mutate(enabled, {
                    onSuccess: () =>
                      toast.success(
                        enabled
                          ? "New recordings will upload to your servers."
                          : `New recordings will upload to ${cloudLabel}.`,
                      ),
                    onError: () =>
                      toast.error("Couldn't update self-host settings."),
                  })
                }
                disabled={toggleSelfHost.isPending}
                label="Use my own servers"
              />
            </div>
          )}

          <div className="rounded-xl border border-border/50 bg-primary p-4">
            <h3 className="text-sm font-medium text-foreground">Your keys</h3>
            <p className="mt-0.5 max-w-md text-xs leading-5 text-fg-subtle">
              Keys are validated on save and stored encrypted; they're never
              shown again.
            </p>

            {selfHost && !showForm ? (
              <div className="mt-4 flex flex-col gap-3">
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-fg-subtle">LiveKit URL</dt>
                    <dd className="truncate font-mono text-foreground">
                      {selfHost.livekitUrl}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-fg-subtle">LiveKit API key</dt>
                    <dd className="font-mono text-foreground">
                      {selfHost.livekitApiKey}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-fg-subtle">R2 bucket</dt>
                    <dd className="truncate font-mono text-foreground">
                      {selfHost.r2Bucket}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-fg-subtle">R2 access key</dt>
                    <dd className="font-mono text-foreground">
                      {selfHost.r2AccessKeyId}
                    </dd>
                  </div>
                </dl>

                {confirmRemove ? (
                  <div className="flex flex-col gap-2 rounded-lg bg-danger/10 p-3">
                    <p className="text-xs leading-5 text-danger">
                      Recordings stored on your servers won't be playable here
                      anymore, and new recordings will go to {cloudLabel}.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          deleteSelfHost.mutate(undefined, {
                            onSuccess: () => {
                              setConfirmRemove(false);
                              toast.success("Self-host keys removed.");
                            },
                            onError: () =>
                              toast.error("Couldn't remove self-host keys."),
                          })
                        }
                        disabled={deleteSelfHost.isPending}
                        className="h-8 cursor-pointer rounded-lg bg-danger px-3 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {deleteSelfHost.isPending ? "Removing…" : "Remove keys"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(false)}
                        className="h-8 cursor-pointer rounded-lg bg-muted px-3 text-xs font-medium text-foreground transition-opacity hover:opacity-80"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowForm(true)}
                      className="h-8 cursor-pointer rounded-lg bg-muted px-3 text-xs font-medium text-foreground transition-opacity hover:opacity-80"
                    >
                      Replace keys
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(true)}
                      className="h-8 cursor-pointer rounded-lg bg-danger/10 px-3 text-xs font-medium text-danger transition-colors hover:bg-danger/15"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <form
                onSubmit={handleSaveSelfHost}
                className="mt-5 flex flex-col gap-6"
              >
                {SELFHOST_GROUPS.map(({ title, fields }) => (
                  <div key={title} className="flex flex-col gap-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
                      {title}
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {fields.map(
                        ({ key, label, placeholder, secret, wide }) => (
                          <label
                            key={key}
                            className={cn(
                              "flex flex-col gap-1.5",
                              wide && "sm:col-span-2",
                            )}
                          >
                            <span className="text-xs font-medium text-fg-muted">
                              {label}
                            </span>
                            <input
                              type={secret ? "password" : "text"}
                              value={form[key]}
                              onChange={(event) =>
                                setForm((prev) => ({
                                  ...prev,
                                  [key]: event.target.value,
                                }))
                              }
                              placeholder={placeholder}
                              required
                              autoComplete="off"
                              spellCheck={false}
                              className="h-9 rounded-lg border border-border/50 bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-fg-faint focus:border-fg-faint"
                            />
                          </label>
                        ),
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex flex-col gap-3 border-t border-border/50 pt-4">
                  {subscribed && !selfHost && (
                    <p className="text-xs leading-5 text-fg-subtle">
                      Saving switches new recordings to your servers. Your Pro
                      plan stays active - turn the switch off anytime to go
                      back.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={saveSelfHost.isPending}
                      className="h-9 cursor-pointer rounded-lg bg-brand px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {saveSelfHost.isPending
                        ? "Validating keys…"
                        : "Validate & save"}
                    </button>
                    {selfHost && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowForm(false);
                          setForm(EMPTY_SELFHOST);
                        }}
                        className="h-9 cursor-pointer rounded-lg bg-muted px-4 text-sm font-medium text-foreground transition-opacity hover:opacity-80"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// RECORDING -------------------------------------------------------------------

// PAGE ------------------------------------------------------------------------

const DashboardSettingsPage = () => {
  // `?section=billing` deep-links straight to a section (e.g. from the pricing modal).
  const [searchParams] = useSearchParams();
  const requestedSection = searchParams.get("section");
  const [section, setSection] = useState<SectionId>("profile");

  useEffect(() => {
    if (SECTIONS.some(({ id }) => id === requestedSection)) {
      setSection(requestedSection as SectionId);
    }
  }, [requestedSection]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pt-6 md:pt-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-fg-muted">
          Manage your profile, plan, and recording preferences.
        </p>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        {/* Section nav */}
        <nav className="flex shrink-0 gap-1 overflow-x-auto md:w-48 md:flex-col">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                section === id
                  ? "bg-muted text-foreground"
                  : "text-fg-muted hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>

        {/* Section content */}
        <div className="min-w-0 flex-1">
          {section === "profile" && <ProfileSection />}
          {section === "appearance" && <AppearanceSection />}
          {section === "billing" && (
            <PlanBillingSection onOpenSelfHost={() => setSection("selfhost")} />
          )}
          {section === "selfhost" && <SelfHostSection />}
          {section === "recording" && (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Recording
                </h2>
                <p className="mt-0.5 text-sm text-fg-muted">
                  How your recordings are captured. Applies to calls you host.
                </p>
              </div>
              <RecordingSettings />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardSettingsPage;
