import {
  LogOut,
  MonitorSmartphone,
  PhoneOff,
  SearchX,
  Users,
  UserX,
} from "lucide-react";

export type CallExitReason =
  | "left"
  | "ended"
  | "removed"
  | "duplicate"
  | "notfound"
  | "full";

interface CallExitScreenProps {
  reason: CallExitReason;
  onRejoin: () => void;
  onDashboard: () => void;
}

const exitContent: Record<
  CallExitReason,
  { title: string; description: string; canRejoin: boolean }
> = {
  left: {
    title: "You left the recording session",
    description:
      "You've left the session. You can rejoin or head back to your dashboard.",
    canRejoin: true,
  },
  ended: {
    title: "Recording session ended",
    description: "This recording session has ended. Thanks for joining!",
    canRejoin: false,
  },
  removed: {
    title: "Removed from session",
    description: "You were removed from this recording session by a host.",
    canRejoin: false,
  },
  duplicate: {
    title: "Disconnected",
    description:
      "You joined this recording session from another tab or device, so this session was disconnected.",
    canRejoin: true,
  },
  notfound: {
    title: "Recording session not found",
    description:
      "This recording session doesn't exist or has already ended. Head back to your dashboard to start or join another.",
    canRejoin: false,
  },
  full: {
    title: "Recording session is full",
    description:
      "This session has reached the maximum number of participants for the host's plan. Try again when someone leaves, or ask the host to upgrade their plan for more seats.",
    canRejoin: true,
  },
};

// Icon + tint per reason, so each outcome reads at a glance.
const exitTone: Record<
  CallExitReason,
  { icon: typeof LogOut; className: string }
> = {
  left: { icon: LogOut, className: "bg-muted text-foreground" },
  ended: {
    icon: PhoneOff,
    className: "bg-brand/15 text-brand dark:text-blue-300",
  },
  removed: { icon: UserX, className: "bg-danger/10 text-danger" },
  duplicate: {
    icon: MonitorSmartphone,
    className: "bg-warning/10 text-warning",
  },
  notfound: { icon: SearchX, className: "bg-muted text-foreground" },
  full: { icon: Users, className: "bg-warning/10 text-warning" },
};

const CallExitScreen = ({
  reason,
  onRejoin,
  onDashboard,
}: CallExitScreenProps) => {
  const { title, description, canRejoin } = exitContent[reason];
  const { icon: Icon, className: toneClassName } = exitTone[reason];

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center gap-2.5 px-6">
        <img
          src="/logo/logo-light.png"
          className="h-auto w-5 select-none dark:hidden"
          alt=""
        />
        <img
          src="/logo/logo-dark.png"
          className="hidden h-auto w-5 select-none dark:block"
          alt=""
        />
        <span className="text-sm font-bold uppercase tracking-wide text-foreground">
          Openside
        </span>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="flex w-full max-w-md flex-col items-center text-center animate-in fade-in-0 zoom-in-95 duration-300">
          <span
            className={`flex size-16 items-center justify-center rounded-2xl ${toneClassName}`}
          >
            <Icon size={28} />
          </span>

          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-fg-muted">
            {description}
          </p>

          <div className="mt-8 flex w-full flex-col-reverse items-center justify-center gap-2.5 sm:flex-row">
            <button
              type="button"
              onClick={onDashboard}
              className="h-10 w-full cursor-pointer rounded-lg bg-muted px-5 text-sm font-medium text-foreground transition-opacity hover:opacity-80 sm:w-auto"
            >
              Go to dashboard
            </button>
            {canRejoin && (
              <button
                type="button"
                onClick={onRejoin}
                className="h-10 w-full cursor-pointer rounded-lg bg-brand px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 sm:w-auto"
              >
                Rejoin
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default CallExitScreen;
