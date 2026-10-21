import { useEffect, useState, type ReactNode } from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import { CalendarDays, FolderOpen, Home, Search, Settings } from "lucide-react";
import { BsFillRecordCircleFill } from "react-icons/bs";
import { FiMonitor } from "react-icons/fi";
import { MdOutlineVideoLabel } from "react-icons/md";
import generateRoomId from "@/utils/GenerateRoomId";
import { createIntentKey } from "@/pages/RoomPage";
import { useProjectSearch } from "@/hooks/useProjectSearch";
import ScheduleModal from "./ScheduleModal";

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

interface MenuEntry {
  label: string;
  icon: ReactNode;
  keywords?: string[];
  onSelect: () => void;
}

/** Case-insensitive substring match on the label or any keyword. */
const entryMatches = (entry: MenuEntry, query: string) =>
  !query ||
  [entry.label, ...(entry.keywords ?? [])].some((text) =>
    text.toLowerCase().includes(query),
  );

/**
 * Header search: a ⌘K / Ctrl+K command palette over pages, quick actions and
 * your projects. Projects are searched on the server (titles, takes and the
 * people in them); actions and pages are filtered here. Renders its own
 * trigger button.
 */
const CommandMenu = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const { data: projects = [], isFetching } = useProjectSearch(search, open);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const run = (action: () => void) => {
    setOpen(false);
    setSearch("");
    action();
  };

  const startRecording = () => {
    const roomId = generateRoomId();
    // Same intent flag as the dashboard's Record card, so RoomPage creates it.
    sessionStorage.setItem(createIntentKey(roomId), "1");
    navigate(`/${roomId}`);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setSearch("");
  };

  const actions = (
    [
      {
        label: "New recording",
        icon: <BsFillRecordCircleFill size={14} className="text-red-500" />,
        onSelect: () => run(startRecording),
      },
      {
        label: "Schedule a recording",
        icon: <CalendarDays size={15} />,
        keywords: ["plan", "later", "invite"],
        onSelect: () => run(() => setIsScheduleOpen(true)),
      },
      {
        label: "Screen recorder",
        icon: <FiMonitor size={15} />,
        onSelect: () => run(() => navigate("/dashboard/screen-recorder")),
      },
    ] satisfies MenuEntry[]
  ).filter((entry) => entryMatches(entry, query));

  const pages = (
    [
      {
        label: "Home",
        icon: <Home size={15} />,
        onSelect: () => run(() => navigate("/dashboard/home")),
      },
      {
        label: "Projects",
        icon: <FolderOpen size={15} />,
        keywords: ["recordings", "library"],
        onSelect: () => run(() => navigate("/dashboard/project")),
      },
      {
        label: "Calendar",
        icon: <CalendarDays size={15} />,
        keywords: ["upcoming", "sessions"],
        onSelect: () => run(() => navigate("/dashboard/calendar")),
      },
      {
        label: "Settings",
        icon: <Settings size={15} />,
        keywords: ["profile", "billing", "plan"],
        onSelect: () => run(() => navigate("/dashboard/settings")),
      },
    ] satisfies MenuEntry[]
  ).filter((entry) => entryMatches(entry, query));

  const renderEntries = (entries: MenuEntry[]) =>
    entries.map((entry) => (
      <Item
        key={entry.label}
        value={entry.label}
        icon={entry.icon}
        onSelect={entry.onSelect}
      >
        {entry.label}
      </Item>
    ));

  const projectGroup = projects.length > 0 && (
    <Command.Group heading={query ? "Projects" : "Recent projects"}>
      {projects.map((project) => (
        <Item
          key={`${project.kind}:${project.id}`}
          // Unique value so two projects with the same title don't merge.
          value={`${project.kind}:${project.id}`}
          icon={
            project.kind === "screen" ? (
              <FiMonitor size={15} />
            ) : (
              <MdOutlineVideoLabel size={15} />
            )
          }
          hint={project.match}
          onSelect={() =>
            run(() =>
              navigate(
                project.kind === "screen"
                  ? `/dashboard/project/screen/${project.id}`
                  : `/dashboard/project/${project.id}`,
              ),
            )
          }
        >
          {project.title}
        </Item>
      ))}
    </Command.Group>
  );

  const nothingShown =
    actions.length === 0 && pages.length === 0 && projects.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-80 items-center gap-2 rounded-md border border-border/50 bg-primary px-3 text-sm text-fg-subtle transition-colors hover:text-foreground cursor-pointer max-md:w-9 max-md:justify-center max-md:px-0"
      >
        <Search size={15} className="shrink-0" />
        <span className="flex-1 truncate text-left max-md:hidden">
          Search projects, pages, actions...
        </span>
        <kbd className="rounded border border-border/50 bg-muted px-1.5 py-0.5 font-sans text-[0.65rem] font-medium text-fg-muted max-md:hidden">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      <Command.Dialog
        open={open}
        onOpenChange={handleOpenChange}
        label="Search"
        // Filtering is ours: projects come back already matched by the server.
        shouldFilter={false}
        // Radix keeps both mounted until the closed-state animation finishes.
        overlayClassName="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
        contentClassName="fixed left-1/2 top-[18%] z-[110] w-[min(560px,calc(100%-1.5rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border/50 bg-[#f9f9fb] shadow-2xl shadow-black/30 duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 dark:bg-[#0f0f11]"
      >
        <div className="flex items-center gap-2.5 border-b border-border/50 px-4">
          <Search size={16} className="shrink-0 text-fg-subtle" />
          <Command.Input
            value={search}
            onValueChange={setSearch}
            placeholder="Search projects, pages and actions..."
            className="h-12 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-fg-faint"
          />
          <kbd className="rounded border border-border/50 bg-muted px-1.5 py-0.5 font-sans text-[0.65rem] font-medium text-fg-muted">
            Esc
          </kbd>
        </div>

        <Command.List className="max-h-[360px] overflow-y-auto p-2 scrollbar-hide [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-subtle">
          {nothingShown && (
            <div className="py-10 text-center text-sm text-fg-subtle">
              {isFetching ? "Searching…" : "No results found."}
            </div>
          )}

          {/* Typing usually means looking for a project: those lead. */}
          {query && projectGroup}

          {actions.length > 0 && (
            <Command.Group heading="Actions">
              {renderEntries(actions)}
            </Command.Group>
          )}

          {!query && projectGroup}

          {pages.length > 0 && (
            <Command.Group heading="Pages">{renderEntries(pages)}</Command.Group>
          )}
        </Command.List>
      </Command.Dialog>

      <ScheduleModal
        open={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
      />
    </>
  );
};

const Item = ({
  icon,
  value,
  hint,
  onSelect,
  children,
}: {
  icon: ReactNode;
  value: string;
  /** Muted trailing text, e.g. why a project matched. */
  hint?: string | null;
  onSelect: () => void;
  children: ReactNode;
}) => (
  <Command.Item
    value={value}
    onSelect={onSelect}
    className="flex h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm text-foreground data-[selected=true]:bg-muted"
  >
    <span className="flex size-6 shrink-0 items-center justify-center text-fg-muted">
      {icon}
    </span>
    <span className="min-w-0 flex-1 truncate">{children}</span>
    {hint && (
      <span className="max-w-[40%] shrink-0 truncate text-xs text-fg-subtle">
        {hint}
      </span>
    )}
  </Command.Item>
);

export default CommandMenu;
