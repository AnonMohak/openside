import { useState } from "react";
import generateRoomId from "@/utils/GenerateRoomId";
import { createIntentKey } from "@/pages/RoomPage";
import { CalendarDays, ChevronRight, Trash2 } from "lucide-react";
import { BsFillRecordCircleFill } from "react-icons/bs";
import { RiMovie2Line } from "react-icons/ri";
import { FiMonitor } from "react-icons/fi";
import ActionCard from "./ActionCard";
import ScheduleModal from "./ScheduleModal";
import { useNavigate } from "react-router-dom";
import { useDeleteSpace, useGetUserSpaces } from "@/hooks/useSpace";
import { useGetMe } from "@/hooks/useUserQuery";
import { toast } from "@/lib/toast";
import type { Space } from "@/types/spaceTypes";
import CallWarningDialog from "@/components/Space/ui/CallWarningDialog";
import { usePresence } from "@/hooks/usePresence";
import { useScreenRecordingContext } from "@/components/ScreenRecorder/ScreenRecordingProvider";

const UpcomingSessionsSkeleton = () => (
  <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/50 bg-primary">
    {Array.from({ length: 2 }).map((_, index) => (
      <div key={index} className="flex items-center gap-3 px-3 py-2.5">
        <div className="size-10 shrink-0 animate-pulse rounded-lg bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
          <div className="h-3 w-28 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-6 w-16 shrink-0 animate-pulse rounded-md bg-muted" />
      </div>
    ))}
  </div>
);

const QuickActions = () => {
  const navigate = useNavigate();
  const { openRecorder } = useScreenRecordingContext();
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Space | null>(null);
  const deleteDialog = usePresence(pendingDelete);
  const deleteSpace = useDeleteSpace();

  const confirmDelete = () => {
    if (!pendingDelete) return;
    // Optimistic: the row disappears right away and comes back on failure.
    deleteSpace.mutate(pendingDelete.id, {
      onError: () => toast.error("Couldn't delete the session."),
    });
    setPendingDelete(null);
  };

  const handleNewMeeting = () => {
    const roomId = generateRoomId();
    // Mark this as an intentional room creation so RoomPage is allowed to create
    // the space. Without this flag, visiting the URL only ever joins an existing
    // room (and shows "not found" if it doesn't exist).
    sessionStorage.setItem(createIntentKey(roomId), "1");
    navigate(`/${roomId}`);
  };

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // "all" also brings in scheduled sessions other hosts invited you to.
  const { data: spaces = [], isLoading } = useGetUserSpaces("all");
  const { data: me } = useGetMe();
  const now = Date.now();
  const upcoming = spaces
    .filter(
      (space) =>
        space.status === "SCHEDULED" &&
        space.scheduledFor &&
        new Date(space.scheduledFor).getTime() >= now,
    )
    .sort(
      (a, b) =>
        new Date(a.scheduledFor!).getTime() -
        new Date(b.scheduledFor!).getTime(),
    );

  // "Today · 9:30 PM", "Tomorrow · 9:30 PM", or "Tue, Oct 20 · 9:30 PM".
  const formatWhen = (value: string) => {
    const date = new Date(value);
    const time = new Intl.DateTimeFormat("en", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
    const dayDiff = Math.round(
      (new Date(date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) /
        86_400_000,
    );
    const day =
      dayDiff === 0
        ? "Today"
        : dayDiff === 1
          ? "Tomorrow"
          : new Intl.DateTimeFormat("en", {
              weekday: "short",
              month: "short",
              day: "numeric",
            }).format(date);
    return `${day} · ${time}`;
  };

  const formatRelative = (value: string) => {
    const minutes = Math.max(
      0,
      Math.round((new Date(value).getTime() - now) / 60_000),
    );
    if (minutes < 1) return "now";
    if (minutes < 60) return `in ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `in ${hours} hr`;
    const days = Math.round(hours / 24);
    return `in ${days} day${days === 1 ? "" : "s"}`;
  };

  const actions = [
    {
      id: 1,
      title: "Record",
      description: "Start a new recording",
      icon: <BsFillRecordCircleFill size={18} />,
      accentHex: "#dc2626", // red
      onClick: handleNewMeeting,
    },
    {
      id: 3,
      title: "Schedule",
      description: "Plan for later",
      icon: <CalendarDays size={18} />,
      onClick: () => setIsScheduleOpen(true),
    },
    {
      id: 4,
      title: "Screen Recorder",
      description: "Capture your screen",
      icon: <FiMonitor size={18} />,
      badge: "Beta",
      onClick: openRecorder,
      // Phone/tablet browsers can't capture the screen, so the card is
      // desktop-only.
      className: "max-lg:hidden",
    },
    {
      id: 5,
      title: "Recordings",
      description: "Browse your library",
      icon: <RiMovie2Line size={18} />,
      onClick: () => navigate("/dashboard/project"),
      // With the screen recorder hidden, phones show 3 cards - the last one
      // spans the row so the 2-column grid doesn't leave a hole.
      className: "max-sm:col-span-2",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-2 py-6 md:py-12">
      <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {actions.map((action) => (
          <ActionCard
            key={action.id}
            title={action.title}
            description={action.description}
            icon={action.icon}
            accentHex={action.accentHex}
            badge={action.badge}
            onClick={action.onClick}
            className={action.className}
          />
        ))}
      </div>

      <div className="mt-12">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">
            Upcoming sessions
            <span className="ml-2 font-normal text-fg-subtle">
              {todayLabel}
            </span>
          </h3>
          <button
            type="button"
            onClick={() => navigate("/dashboard/calendar")}
            className="flex items-center gap-1 text-xs font-medium text-fg-muted transition-colors hover:text-foreground cursor-pointer"
          >
            View all
            <ChevronRight size={14} />
          </button>
        </div>

        {isLoading ? (
          <UpcomingSessionsSkeleton />
        ) : upcoming.length === 0 ? (
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border text-sm text-fg-subtle">
            No upcoming recordings scheduled
          </div>
        ) : (
          <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/50 bg-primary">
            {upcoming.map((space) => {
              const date = new Date(space.scheduledFor!);
              const inviteeCount = space.invitees?.length ?? 0;
              const isHost = !!me && space.hostId === me.id;
              return (
                <div
                  key={space.id}
                  className="group flex items-center gap-1 pr-2 transition-colors hover:bg-muted/50"
                >
                  <button
                    type="button"
                    onClick={() => navigate("/dashboard/calendar")}
                    className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left cursor-pointer"
                  >
                    <span className="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg border border-border/50 bg-muted leading-none">
                      <span
                        className={`translate-y-0.5 text-[0.6rem] font-semibold uppercase tracking-wide ${
                          isHost ? "text-red-500" : "text-brand"
                        }`}
                      >
                        {date.toLocaleDateString("en-US", { month: "short" })}
                      </span>
                      <span className="mt-px text-sm font-semibold tabular-nums text-foreground">
                        {date.getDate()}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {space.title || "Untitled recording"}
                      </span>
                      <span className="block truncate text-xs text-fg-subtle">
                        {formatWhen(space.scheduledFor!)}
                        {isHost
                          ? inviteeCount > 0 && ` · ${inviteeCount} invited`
                          : ` · Invited by ${space.host?.name ?? "the host"}`}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium max-sm:hidden ${
                        isHost
                          ? "bg-muted text-fg-muted"
                          : "bg-brand/15 text-brand dark:text-blue-300"
                      }`}
                    >
                      {isHost ? "Hosting" : "Invited"}
                    </span>
                    <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-fg-muted">
                      {formatRelative(space.scheduledFor!)}
                    </span>
                  </button>
                  {isHost ? (
                    <button
                      type="button"
                      onClick={() => setPendingDelete(space)}
                      aria-label={`Delete ${space.title || "session"}`}
                      title="Delete session"
                      className="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-subtle opacity-0 transition-all hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 cursor-pointer max-md:opacity-100"
                    >
                      <Trash2 size={15} />
                    </button>
                  ) : (
                    // Keeps the chevron aligned with host rows.
                    <span className="size-8 shrink-0" />
                  )}
                  <ChevronRight size={16} className="shrink-0 text-fg-subtle" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ScheduleModal
        open={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
      />

      {deleteDialog.rendered && (
        <CallWarningDialog
          title="Delete this session?"
          description={`"${deleteDialog.rendered.title || "Untitled recording"}" will be removed from your schedule. This can't be undone.`}
          confirmLabel="Delete"
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
          isClosing={deleteDialog.isClosing}
        />
      )}
    </div>
  );
};

export default QuickActions;
