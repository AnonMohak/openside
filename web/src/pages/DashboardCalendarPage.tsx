import { useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  Mail,
  Plus,
  Trash2,
} from "lucide-react";
import { RiMovie2Line } from "react-icons/ri";
import { useNavigate } from "react-router-dom";
import PageTitle from "@/components/shared/PageTitle";
import ScheduleModal from "@/components/Dashboard/ScheduleModal";
import { useDeleteSpace, useGetUserSpaces } from "@/hooks/useSpace";
import { useGetMe } from "@/hooks/useUserQuery";
import { toast } from "@/lib/toast";
import CallWarningDialog from "@/components/Space/ui/CallWarningDialog";
import type { Space } from "@/types/spaceTypes";

type CalendarView = "month" | "week" | "list";

interface CalendarEvent {
  id: string;
  title: string;
  joinCode: string;
  status: string;
  hostId: string;
  /** Host's name when someone else scheduled this and invited you. */
  invitedBy?: string;
  date: Date;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const startOfWeek = (date: Date) => {
  const result = startOfDay(date);
  result.setDate(result.getDate() - result.getDay());
  return result;
};

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const addMonths = (date: Date, months: number) => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

const formatTime = (date: Date) =>
  new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(
    date
  );

// A meeting's calendar date is its scheduled time if set, otherwise when it
// started, otherwise when it was created.
const eventDate = (space: Space): Date | null => {
  const raw = space.scheduledFor || space.startTime || space.createdAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Openside is a recording tool, not a meeting tool: the calendar only surfaces
// sessions that produced a recording, plus still-scheduled sessions (planned
// recordings). Plain meets - live or ended without recording anything - are
// never tracked here.
const isRecordingSession = (space: Space): boolean =>
  (space._count?.recordingSessions ?? 0) > 0 || space.status === "SCHEDULED";

const statusStyles = () => "border-border/50 bg-primary text-foreground";

type EventKind = "upcoming" | "missed" | "invited" | "recorded";

const eventKind = (event: CalendarEvent): EventKind => {
  if (event.status !== "SCHEDULED") return "recorded";
  // Scheduled but its time already passed without the host starting it.
  if (event.date.getTime() < Date.now()) return "missed";
  return event.invitedBy ? "invited" : "upcoming";
};

// One icon per kind so upcoming, missed, invited and recorded read apart.
const EventIcon = ({ kind, size = 12 }: { kind: EventKind; size?: number }) =>
  kind === "upcoming" ? (
    <CalendarClock size={size} className="shrink-0 text-danger" />
  ) : kind === "missed" ? (
    <CalendarX size={size} className="shrink-0 text-fg-subtle" />
  ) : kind === "invited" ? (
    <Mail size={size} className="shrink-0 text-brand dark:text-blue-300" />
  ) : (
    <RiMovie2Line size={size + 1} className="shrink-0 opacity-70" />
  );

const EventPill = ({
  event,
  onClick,
  onDelete,
}: {
  event: CalendarEvent;
  onClick: () => void;
  /** Shown as a hover trash button; only for sessions the user can delete. */
  onDelete?: () => void;
}) => (
  <div className="group relative">
    <button
      type="button"
      onClick={onClick}
      title={`${formatTime(event.date)} - ${event.title}${
        event.invitedBy ? ` (invited by ${event.invitedBy})` : ""
      }`}
      className={`flex w-full items-center gap-1.5 truncate rounded-lg border px-2 py-2 text-left text-xs leading-tight transition-colors hover:bg-muted cursor-pointer ${statusStyles()}`}
    >
      <EventIcon kind={eventKind(event)} />
      <span className="shrink-0 font-normal tabular-nums opacity-60">
        {formatTime(event.date)}
      </span>
      <span className="truncate opacity-90">{event.title}</span>
    </button>
    {onDelete && (
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${event.title}`}
        title="Delete session"
        className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md bg-primary text-fg-subtle opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 cursor-pointer"
      >
        <Trash2 size={13} />
      </button>
    )}
  </div>
);

const ListHeading = ({ label, count }: { label: string; count: number }) => (
  <div className="flex items-center gap-2 px-1">
    <h2 className="text-sm font-semibold text-foreground">{label}</h2>
    <span className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-medium text-fg-muted">
      {count}
    </span>
  </div>
);

const DashboardCalendarPage = () => {
  const navigate = useNavigate();
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [view, setView] = useState<CalendarView>("month");
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const { data: spaces = [], isLoading } = useGetUserSpaces("all");
  const { data: user } = useGetMe();
  const deleteSpace = useDeleteSpace();
  const [pendingDelete, setPendingDelete] = useState<CalendarEvent | null>(
    null
  );
  // Only the host can delete, and only sessions that haven't happened yet.
  const deleteHandler = (event: CalendarEvent) =>
    event.status === "SCHEDULED" && !!user && event.hostId === user.id
      ? () => setPendingDelete(event)
      : undefined;

  const confirmDelete = () => {
    if (!pendingDelete) return;
    // Optimistic: the event disappears right away and comes back on failure.
    deleteSpace.mutate(pendingDelete.id, {
      onError: () => toast.error("Couldn't delete the session."),
    });
    setPendingDelete(null);
  };

  const today = startOfDay(new Date());

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const space of spaces) {
      if (!isRecordingSession(space)) continue;
      const date = eventDate(space);
      if (!date) continue;
      const event: CalendarEvent = {
        id: space.id,
        title: space.title || "Untitled recording",
        joinCode: space.joinCode,
        status: space.status,
        hostId: space.hostId,
        invitedBy:
          space.userRole === "INVITED"
            ? (space.host?.name ?? "the host")
            : undefined,
        date,
      };
      const key = dayKey(date);
      const existing = map.get(key);
      if (existing) existing.push(event);
      else map.set(key, [event]);
    }
    // Sort each day's events chronologically.
    for (const list of map.values()) {
      list.sort((a, b) => a.date.getTime() - b.date.getTime());
    }
    return map;
  }, [spaces]);

  const openEvent = (event: CalendarEvent) => {
    // A still-scheduled session opens the space/join link so the host can start
    // it; everything else is a recording and opens its project.
    if (event.status === "SCHEDULED") {
      navigate(`/${event.joinCode}`);
    } else {
      navigate(`/dashboard/project/${event.id}`);
    }
  };

  const renderRow = (event: CalendarEvent) => {
    const onDelete = deleteHandler(event);
    const isScheduled = event.status === "SCHEDULED";
    // Scheduled but its time already passed without the host starting it.
    const isMissed = isScheduled && event.date.getTime() < Date.now();
    const isUpcoming = isScheduled && !isMissed;
    const isInvited = !!event.invitedBy && !isMissed;
    const time = new Intl.DateTimeFormat("en", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(event.date);
    return (
      <div
        key={event.id}
        className="group flex items-center gap-1 pr-2 transition-colors hover:bg-muted/50"
      >
        <button
          type="button"
          onClick={() => openEvent(event)}
          className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left cursor-pointer"
        >
          <span className="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg border border-border/50 bg-muted leading-none">
            <span
              className={`translate-y-0.5 text-[0.6rem] font-semibold uppercase tracking-wide ${
                isInvited
                  ? "text-brand dark:text-blue-300"
                  : isUpcoming
                    ? "text-red-500"
                    : "text-fg-subtle"
              }`}
            >
              {event.date.toLocaleDateString("en-US", { month: "short" })}
            </span>
            <span className="mt-px text-sm font-semibold tabular-nums text-foreground">
              {event.date.getDate()}
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              {event.title}
            </span>
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-fg-subtle">
              <EventIcon kind={eventKind(event)} />
              <span className="truncate">
                {time}
                {event.invitedBy && ` · Invited by ${event.invitedBy}`}
              </span>
            </span>
          </span>
          <span
            className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium ${
              isInvited
                ? "bg-brand/15 text-brand dark:text-blue-300"
                : isUpcoming
                  ? "bg-danger/10 text-danger"
                  : "bg-muted text-fg-muted"
            }`}
          >
            {isMissed
              ? "Missed"
              : isInvited
                ? "Invited"
                : isUpcoming
                  ? "Upcoming"
                  : "Recorded"}
          </span>
        </button>
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${event.title}`}
            title="Delete session"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-subtle opacity-0 transition-all hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 cursor-pointer max-md:opacity-100"
          >
            <Trash2 size={15} />
          </button>
        ) : (
          // Keeps badges aligned with deletable rows.
          <span className="size-8 shrink-0" />
        )}
      </div>
    );
  };

  const goPrev = () =>
    setFocusDate((current) =>
      view === "month" ? addMonths(current, -1) : addDays(current, -7)
    );
  const goNext = () =>
    setFocusDate((current) =>
      view === "month" ? addMonths(current, 1) : addDays(current, 7)
    );
  const goToday = () => setFocusDate(new Date());

  const headerLabel =
    view === "list"
      ? ""
      : new Intl.DateTimeFormat("en", {
          month: "long",
          year: "numeric",
        }).format(focusDate);

  // Month grid: whole weeks starting on the Sunday on/before the 1st, running
  // only as far as the week that contains the last day of the month. A trailing
  // week made up entirely of next-month days is never rendered.
  const monthGrid = useMemo(() => {
    const first = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1);
    const gridStart = startOfWeek(first);
    const last = new Date(focusDate.getFullYear(), focusDate.getMonth() + 1, 0);
    const spanDays =
      Math.round(
        (startOfDay(last).getTime() - gridStart.getTime()) / 86_400_000
      ) + 1;
    const weeks = Math.ceil(spanDays / 7);
    return Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));
  }, [focusDate]);

  const weekGrid = useMemo(() => {
    const start = startOfWeek(focusDate);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [focusDate]);

  // The list view shows two stacked sections: scheduled sessions under
  // "Upcoming", then everything that has actually recorded under "Recordings",
  // grouped by the month it happened in. Months with no recordings are skipped.
  const { upcomingEvents, missedEvents, pastMonths } = useMemo(() => {
    const toEvent = (space: Space): CalendarEvent | null => {
      const date = eventDate(space);
      if (!date) return null;
      return {
        id: space.id,
        title: space.title || "Untitled recording",
        joinCode: space.joinCode,
        status: space.status,
        hostId: space.hostId,
        invitedBy:
          space.userRole === "INVITED"
            ? (space.host?.name ?? "the host")
            : undefined,
        date,
      };
    };

    // Still-scheduled sessions: upcoming if their time hasn't come yet,
    // missed if it passed without the host ever starting them.
    const now = Date.now();
    const scheduled = spaces
      .filter((space) => space.status === "SCHEDULED")
      .map(toEvent)
      .filter((e): e is CalendarEvent => e !== null);
    const upcoming = scheduled
      .filter((event) => event.date.getTime() >= now)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const missed = scheduled
      .filter((event) => event.date.getTime() < now)
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    // Recordings = sessions that produced a recording, regardless of date.
    const recordings = spaces
      .filter((space) => (space._count?.recordingSessions ?? 0) > 0)
      .map(toEvent)
      .filter((e): e is CalendarEvent => e !== null);

    // Bucket recordings by calendar month, newest month first.
    const buckets = new Map<string, CalendarEvent[]>();
    for (const event of recordings) {
      const key = `${event.date.getFullYear()}-${event.date.getMonth()}`;
      const existing = buckets.get(key);
      if (existing) existing.push(event);
      else buckets.set(key, [event]);
    }
    const months = Array.from(buckets.entries())
      .map(([key, list]) => ({
        key,
        label: new Intl.DateTimeFormat("en", {
          month: "long",
          year: "numeric",
        }).format(list[0].date),
        events: list.sort((a, b) => b.date.getTime() - a.date.getTime()),
      }))
      .sort((a, b) => b.events[0].date.getTime() - a.events[0].date.getTime());

    return {
      upcomingEvents: upcoming,
      missedEvents: missed,
      pastMonths: months,
    };
  }, [spaces]);

  return (
    <>
      <PageTitle title="Calendar" />
      <div className="flex h-full flex-col gap-2">
        {/* Toolbar */}
        <div className="mx-4 mt-2 mb-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {view !== "list" && (
              <button
                type="button"
                onClick={goToday}
                className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted cursor-pointer"
              >
                Today
              </button>
            )}
            {view !== "list" && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label="Previous"
                  className="flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label="Next"
                  className="flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
            {view !== "list" && (
              <h1 className="text-base font-medium text-foreground">
                {headerLabel}
              </h1>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex h-9 items-center gap-0.5 rounded-md bg-muted p-0.5">
              {(["week", "month", "list"] as CalendarView[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setView(option)}
                  className={`flex h-full items-center rounded px-3 text-sm font-medium capitalize transition-colors cursor-pointer ${
                    view === option
                      ? "bg-brand text-white"
                      : "text-fg-muted hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setIsScheduleOpen(true)}
              className="ml-2 flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-medium text-white transition-colors hover:bg-brand/90 cursor-pointer"
            >
              <Plus size={16} />
              New
            </button>
          </div>
        </div>

        {/* Views */}
        {view === "list" ? (
          <div className="mx-4 flex min-h-0 flex-1 flex-col gap-8 overflow-auto pb-6 pt-2">
            {isLoading ? (
              <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/50 bg-primary">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="size-10 shrink-0 animate-pulse rounded-lg bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                    </div>
                    <div className="h-6 w-16 shrink-0 animate-pulse rounded-md bg-muted" />
                  </div>
                ))}
              </div>
            ) : upcomingEvents.length === 0 &&
              missedEvents.length === 0 &&
              pastMonths.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/50 text-center">
                <p className="text-sm font-medium text-foreground">
                  No recording sessions yet
                </p>
                <p className="text-xs text-fg-subtle">
                  Schedule one or start a recording to see it here.
                </p>
              </div>
            ) : (
              <>
                {/* Upcoming */}
                <section className="flex flex-col gap-3">
                  <ListHeading label="Upcoming" count={upcomingEvents.length} />
                  {upcomingEvents.length === 0 ? (
                    <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-border/50 text-sm text-fg-subtle">
                      No upcoming recording sessions
                    </div>
                  ) : (
                    <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/50 bg-primary">
                      {upcomingEvents.map(renderRow)}
                    </div>
                  )}
                </section>

                {/* Scheduled sessions whose time passed without starting */}
                {missedEvents.length > 0 && (
                  <section className="flex flex-col gap-3">
                    <ListHeading label="Missed" count={missedEvents.length} />
                    <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/50 bg-primary">
                      {missedEvents.map(renderRow)}
                    </div>
                  </section>
                )}

                {/* Past recordings, grouped by month */}
                {pastMonths.length > 0 && (
                  <section className="flex flex-col gap-3">
                    <ListHeading
                      label="Recordings"
                      count={pastMonths.reduce(
                        (total, month) => total + month.events.length,
                        0
                      )}
                    />
                    {pastMonths.map((month) => (
                      <div key={month.key} className="flex flex-col gap-2">
                        <h3 className="px-1 text-xs font-medium text-fg-subtle">
                          {month.label}
                        </h3>
                        <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/50 bg-primary">
                          {month.events.map(renderRow)}
                        </div>
                      </div>
                    ))}
                  </section>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden border-t border-border/70">
            {/* The grid fills the available height exactly - weeks split the
                space evenly so nothing scrolls vertically. On narrower viewports
                the min-width keeps each day box at a usable size and the
                container scrolls horizontally instead. */}
            <div className="flex h-full min-w-[1050px] flex-col">
              {/* Weekday header */}
              <div
                className="grid border-b border-border/70"
                style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
              >
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    className="px-2 py-2 text-center text-xs font-medium text-fg-muted"
                  >
                    {day}
                  </div>
                ))}
              </div>
              {/* Day grid */}
              <div
                className="grid flex-1"
                style={{
                  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                  gridTemplateRows:
                    view === "month"
                      ? `repeat(${monthGrid.length / 7}, minmax(0, 1fr))`
                      : "minmax(0, 1fr)",
                }}
              >
                {isLoading
                  ? (view === "month" ? monthGrid : weekGrid).map(
                      (day, index) => {
                        const isLastColumn = (index + 1) % 7 === 0;
                        const totalCells =
                          view === "month" ? monthGrid.length : 7;
                        const isLastRow = index >= totalCells - 7;
                        return (
                          <div
                            key={day.toISOString()}
                            className={`flex min-h-0 flex-col gap-1.5 border-border/70 p-1.5 px-2.5 ${
                              isLastColumn ? "" : "border-r"
                            } ${isLastRow ? "" : "border-b"}`}
                          >
                            <div className="flex items-center px-0.5">
                              <div className="size-8 rounded-full bg-muted animate-pulse" />
                            </div>
                            <div className="flex flex-1 flex-col gap-1">
                              {index % 3 === 0 && (
                                <div className="h-6 w-full rounded bg-muted animate-pulse" />
                              )}
                              {index % 5 === 0 && (
                                <div className="h-6 w-4/5 rounded bg-muted animate-pulse" />
                              )}
                            </div>
                          </div>
                        );
                      }
                    )
                  : (view === "month" ? monthGrid : weekGrid).map(
                      (day, index) => {
                        const inMonth =
                          view === "week" ||
                          day.getMonth() === focusDate.getMonth();
                        const isToday = isSameDay(day, today);
                        // Past days are de-emphasised; today and future stay full opacity.
                        const isPast = day < today;
                        const dayEvents = eventsByDay.get(dayKey(day)) ?? [];
                        // Month cells are short, so they cap at 3 and spill into a
                        // "+N more". Week columns are full-height, so they list every
                        // recording and scroll internally if they run out of room.
                        const maxEvents = view === "week" ? Infinity : 3;
                        // Drop the right border on the last column and the bottom border
                        // on the last row so cell borders don't double up with the
                        // container's own border.
                        const isLastColumn = (index + 1) % 7 === 0;
                        const totalCells =
                          view === "month" ? monthGrid.length : 7;
                        const isLastRow = index >= totalCells - 7;

                        return (
                          <div
                            key={day.toISOString()}
                            className={`flex min-h-0 flex-col gap-1.5 border-border/70 p-1.5 px-2.5 ${
                              isLastColumn ? "" : "border-r"
                            } ${isLastRow ? "" : "border-b"} ${
                              !isToday && !inMonth ? "bg-primary/30" : ""
                            }`}
                          >
                            <div className="flex items-center justify-between px-0.5">
                              <span
                                className={`flex size-8 items-center justify-center rounded-full text-sm font-semibold ${
                                  isToday
                                    ? "bg-brand text-white"
                                    : inMonth
                                      ? "text-foreground"
                                      : "text-fg-muted"
                                } ${isPast && !isToday ? "opacity-40" : ""}`}
                              >
                                {day.getDate()}
                              </span>
                            </div>
                            <div
                              className={`flex flex-1 flex-col gap-1 ${
                                view === "week"
                                  ? "overflow-y-auto"
                                  : "overflow-hidden"
                              }`}
                            >
                              {dayEvents.slice(0, maxEvents).map((event) => (
                                <EventPill
                                  key={event.id}
                                  event={event}
                                  onClick={() => openEvent(event)}
                                  onDelete={deleteHandler(event)}
                                />
                              ))}
                              {dayEvents.length > maxEvents && (
                                <span className="px-1 text-xs text-foreground">
                                  +{dayEvents.length - maxEvents} more
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      }
                    )}
              </div>
            </div>
          </div>
        )}
      </div>

      <ScheduleModal
        open={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
      />

      {pendingDelete && (
        <CallWarningDialog
          title="Delete this session?"
          description={`"${pendingDelete.title}" will be removed from your schedule. This can't be undone.`}
          confirmLabel="Delete"
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </>
  );
};

export default DashboardCalendarPage;
