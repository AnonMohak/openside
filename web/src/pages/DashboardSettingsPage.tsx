/**
 * Settings - sectioned: Profile, Appearance, Plan & billing, Recording (the
 * last shared with the in-call settings dialog).
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
  Monitor,
  Moon,
  Palette,
  Sun,
  Upload,
  User as UserIcon,
  Video,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useGetMe } from "@/hooks/useUserQuery";
import RecordingSettings from "@/components/settings/RecordingSettings";
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

type SectionId = "profile" | "appearance" | "billing" | "recording";

const SECTIONS: { id: SectionId; label: string; icon: typeof UserIcon }[] = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "billing", label: "Plan & billing", icon: CreditCard },
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
      className="flex items-center justify-center overflow-hidden rounded-full bg-muted text-lg font-semibold text-foreground ring-2 ring-brand"
      style={{
        width: size,
        height: size,
      }}
    >
      {src ? (
        <img src={src} alt={name || "Avatar"} className="size-full object-cover" />
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
    return <div className="h-64 animate-pulse rounded-lg bg-muted" />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <Avatar
          src={user?.avatar}
          name={user?.name}
          size={72}
        />
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadAvatar.isPending}
              className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              {uploadAvatar.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {uploadAvatar.isPending ? "Uploading…" : "Change"}
            </button>
            {user?.avatar && (
              <button
                type="button"
                onClick={() =>
                  removeAvatar.mutate(undefined, {
                    onError: () => toast.error("Couldn't remove your avatar."),
                  })
                }
                disabled={removeAvatar.isPending}
                className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-xs text-fg-subtle">
            PNG, JPEG, WebP, or GIF. Up to 5 MB.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={onFilePicked}
            className="hidden"
          />
        </div>
      </div>

      {/* Name */}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">Name</span>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveName();
            }}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-fg-faint"
          />
          {nameDirty && (
            <button
              type="button"
              onClick={saveName}
              disabled={updateProfile.isPending || !name.trim()}
              className="cursor-pointer rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Save
            </button>
          )}
        </div>
      </label>

      {/* Email (read-only) */}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">Email</span>
        <input
          type="email"
          value={user?.email ?? ""}
          readOnly
          className="cursor-not-allowed rounded-md border border-border bg-muted px-3 py-2 text-sm text-fg-muted outline-none"
        />
      </label>
    </div>
  );
};

// APPEARANCE ------------------------------------------------------------------

/** Fixed light/dark mock so each card shows its theme regardless of the active one. */
const ThemePreview = ({ id }: { id: string }) => {
  if (id === "system") {
    return (
      <div className="relative h-16 overflow-hidden rounded-md border border-border">
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
        "relative h-16 overflow-hidden rounded-md border",
        dark ? "border-neutral-700 bg-neutral-900" : "border-neutral-200 bg-white",
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
      {/* Theme */}
      <div className="rounded-lg border border-border bg-background p-5">
        <h3 className="text-base font-semibold text-foreground">Theme</h3>
        <p className="mt-1 max-w-md text-sm text-fg-muted">
          Choose how Openside looks. System follows your device setting.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:max-w-lg">
          {themeOptions.map(({ id, label, icon: Icon }) => {
            const selected = activeTheme === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTheme(id)}
                aria-pressed={selected}
                className={cn(
                  "flex cursor-pointer flex-col gap-2.5 rounded-lg border p-2 text-left transition-colors",
                  selected
                    ? "border-brand ring-1 ring-brand"
                    : "border-border hover:border-fg-faint",
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

// PLAN & BILLING --------------------------------------------------------------

const SELFHOST_FIELDS: {
  key: keyof SelfHostConfigInput;
  label: string;
  placeholder: string;
  secret?: boolean;
}[] = [
  { key: "livekitUrl", label: "LiveKit URL", placeholder: "wss://your-app.livekit.cloud" },
  { key: "livekitApiKey", label: "LiveKit API key", placeholder: "APIxxxxxxxx", secret: true },
  { key: "livekitApiSecret", label: "LiveKit API secret", placeholder: "••••••••", secret: true },
  { key: "r2AccountId", label: "R2 account ID", placeholder: "1a2b3c…" },
  { key: "r2AccessKeyId", label: "R2 access key ID", placeholder: "••••••••", secret: true },
  { key: "r2SecretAccessKey", label: "R2 secret access key", placeholder: "••••••••", secret: true },
  { key: "r2Bucket", label: "R2 bucket", placeholder: "openside-recordings" },
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

const PlanBillingSection = () => {
  const { data: usage, isLoading: usageLoading } = useUsage();
  const { data: selfHost, isLoading: selfHostLoading } = useSelfHostConfig();

  const checkout = useCreateCheckout();
  const portal = useBillingPortal();
  const saveSelfHost = useSaveSelfHostConfig();
  const toggleSelfHost = useToggleSelfHost();
  const deleteSelfHost = useDeleteSelfHostConfig();

  const [form, setForm] = useState<SelfHostConfigInput>(EMPTY_SELFHOST);
  const [showForm, setShowForm] = useState(false);

  const plan = usage?.plan ?? "demo";
  const percentUsed =
    usage?.limit && usage.limit > 0
      ? Math.min(100, Math.round((usage.used / usage.limit) * 100))
      : 0;

  const handleUpgrade = () =>
    checkout.mutate(undefined, {
      onSuccess: (url) => {
        window.location.href = url;
      },
      onError: () => toast.error("Couldn't start checkout. Try again in a moment."),
    });

  const handlePortal = () =>
    portal.mutate(undefined, {
      onSuccess: (url) => {
        window.open(url, "_blank", "noopener,noreferrer");
      },
      onError: () => toast.error("Couldn't open the billing portal. Try again."),
    });

  const handleSaveSelfHost = (event: FormEvent) => {
    event.preventDefault();
    saveSelfHost.mutate(form, {
      onSuccess: () => {
        toast.success("Keys validated and saved - you're on the self-host plan.");
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

  // Hold the whole section until the plan is known - otherwise it renders the
  // default "demo" state first and visibly flips to the real plan on load.
  if (usageLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="rounded-lg border border-border bg-background p-5">
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
      {/* Plan + usage */}
      <div className="rounded-lg border border-border bg-background p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">Plan</h3>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
                  plan === "pro"
                    ? "bg-success/10 text-success ring-success/30"
                    : plan === "selfhost"
                      ? "bg-info/10 text-info ring-info/30"
                      : "bg-muted text-fg-muted ring-border",
                )}
              >
                {PLAN_LABELS[plan]}
              </span>
            </div>
            <p className="mt-1 max-w-md text-sm text-fg-muted">
              {PLAN_NOTES[plan]}
            </p>
          </div>
          <div className="flex gap-2">
            {plan !== "pro" && (
              <button
                type="button"
                onClick={handleUpgrade}
                disabled={checkout.isPending}
                className="cursor-pointer rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {checkout.isPending ? "Opening…" : "Upgrade to Pro - $8.99/mo"}
              </button>
            )}
            {plan === "pro" && (
              <button
                type="button"
                onClick={handlePortal}
                disabled={portal.isPending}
                className="cursor-pointer rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                {portal.isPending ? "Opening…" : "Manage billing"}
              </button>
            )}
          </div>
        </div>

        {usage && usage.limit !== null ? (
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-fg-muted">
                {formatDuration(usage.used)} of {formatDuration(usage.limit)} used
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
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
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

      {plan === "pro" && (
        <p className="text-sm text-fg-subtle">
          To switch to self-host, cancel your current subscription first.
        </p>
      )}

      {/* Self-host - not offered to Pro subscribers (they're on our infra). */}
      {plan !== "pro" && (
      <div className="rounded-lg border border-border bg-background p-5">
        <h3 className="text-base font-semibold text-foreground">
          Self-host (bring your own keys)
        </h3>
        <p className="mt-1 max-w-md text-sm text-fg-muted">
          Run recordings on your own LiveKit and Cloudflare R2. Free and
          unlimited - your keys, your bill. Keys are validated on save and stored
          encrypted; they're never shown again.
        </p>

        {selfHostLoading ? (
          <div className="mt-4 h-24 animate-pulse rounded-md bg-muted" />
        ) : selfHost && !showForm ? (
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
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
                  selfHost.enabled
                    ? "bg-success/10 text-success ring-success/30"
                    : "bg-muted text-fg-muted ring-border",
                )}
              >
                {selfHost.enabled ? "Active" : "Disabled"}
              </span>
              <button
                type="button"
                onClick={() =>
                  toggleSelfHost.mutate(!selfHost.enabled, {
                    onError: () => toast.error("Couldn't update self-host settings."),
                  })
                }
                disabled={toggleSelfHost.isPending}
                className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                {selfHost.enabled ? "Disable" : "Enable"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                Replace keys
              </button>
              <button
                type="button"
                onClick={() =>
                  deleteSelfHost.mutate(undefined, {
                    onSuccess: () => toast.success("Self-host config removed."),
                    onError: () => toast.error("Couldn't remove self-host config."),
                  })
                }
                disabled={deleteSelfHost.isPending}
                className="cursor-pointer rounded-md border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSaveSelfHost} className="mt-4 flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {SELFHOST_FIELDS.map(({ key, label, placeholder, secret }) => (
                <label key={key} className="flex flex-col gap-1 text-sm">
                  <span className="text-fg-muted">{label}</span>
                  <input
                    type={secret ? "password" : "text"}
                    value={form[key]}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, [key]: event.target.value }))
                    }
                    placeholder={placeholder}
                    required
                    autoComplete="off"
                    className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none transition-colors focus:border-fg-faint"
                  />
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saveSelfHost.isPending}
                className="cursor-pointer rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saveSelfHost.isPending ? "Validating keys…" : "Validate & save"}
              </button>
              {selfHost && (
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setForm(EMPTY_SELFHOST);
                  }}
                  className="cursor-pointer rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
      </div>
      )}
    </div>
  );
};

// RECORDING -------------------------------------------------------------------

// PAGE ------------------------------------------------------------------------

const DashboardSettingsPage = () => {
  const [section, setSection] = useState<SectionId>("profile");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
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
          {section === "billing" && <PlanBillingSection />}
          {section === "recording" && <RecordingSettings />}
        </div>
      </div>
    </div>
  );
};

export default DashboardSettingsPage;
