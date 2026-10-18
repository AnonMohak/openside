import { useEffect, useState, type ReactNode } from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import { CalendarDays, FolderOpen, Home, Search, Settings } from "lucide-react";
import { BsFillRecordCircleFill } from "react-icons/bs";
import { FiMonitor } from "react-icons/fi";
import { MdOutlineVideoLabel } from "react-icons/md";
import generateRoomId from "@/utils/GenerateRoomId";
import { createIntentKey } from "@/pages/RoomPage";
import { useGetUserSpaces } from "@/hooks/useSpace";
import ScheduleModal from "./ScheduleModal";

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Header search: a ⌘K / Ctrl+K command palette over pages, quick actions and
 * your projects. Renders its own trigger button.
 */
const CommandMenu = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  // Same cached query the projects pages use, so opening this is instant.
  const { data: spaces = [] } = useGetUserSpaces("hosted");

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
    action();
  };

  const startRecording = () => {
    const roomId = generateRoomId();
    // Same intent flag as the dashboard's Record card, so RoomPage creates it.
    sessionStorage.setItem(createIntentKey(roomId), "1");
    navigate(`/${roomId}`);
  };

  const projects = spaces.filter(
    (space) => (space._count?.recordingSessions ?? 0) > 0,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-96 items-center gap-2 rounded-md border border-border/50 bg-primary px-3 text-sm text-fg-subtle transition-colors hover:text-foreground cursor-pointer max-md:w-9 max-md:justify-center max-md:px-0"
      >
        <Search size={15} className="shrink-0" />
        <span className="flex-1 text-left max-md:hidden">Search...</span>
        <kbd className="rounded border border-border/50 bg-muted px-1.5 py-0.5 font-sans text-[0.65rem] font-medium text-fg-muted max-md:hidden">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Search"
        overlayClassName="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm animate-in fade-in-0 duration-150"
        contentClassName="fixed left-1/2 top-[18%] z-[110] w-[min(560px,calc(100%-1.5rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border/50 bg-[#f9f9fb] shadow-2xl shadow-black/30 animate-in fade-in-0 zoom-in-95 duration-150 dark:bg-[#0f0f11]"
      >
        <div className="flex items-center gap-2.5 border-b border-border/50 px-4">
          <Search size={16} className="shrink-0 text-fg-subtle" />
          <Command.Input
            placeholder="Search projects, pages and actions..."
            className="h-12 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-fg-faint"
          />
          <kbd className="rounded border border-border/50 bg-muted px-1.5 py-0.5 font-sans text-[0.65rem] font-medium text-fg-muted">
            Esc
          </kbd>
        </div>

        <Command.List className="max-h-[360px] overflow-y-auto p-2 scrollbar-hide [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-subtle">
          <Command.Empty className="py-10 text-center text-sm text-fg-subtle">
            No results found.
          </Command.Empty>

          <Command.Group heading="Actions">
            <Item
              icon={
                <BsFillRecordCircleFill size={14} className="text-red-500" />
              }
              onSelect={() => run(startRecording)}
            >
              New recording
            </Item>
            <Item
              icon={<CalendarDays size={15} />}
              keywords={["plan", "later", "invite"]}
              onSelect={() => run(() => setIsScheduleOpen(true))}
            >
              Schedule a recording
            </Item>
            <Item
              icon={<FiMonitor size={15} />}
              onSelect={() => run(() => navigate("/dashboard/screen-recorder"))}
            >
              Screen recorder
            </Item>
          </Command.Group>

          <Command.Group heading="Pages">
            <Item
              icon={<Home size={15} />}
              onSelect={() => run(() => navigate("/dashboard/home"))}
            >
              Home
            </Item>
            <Item
              icon={<FolderOpen size={15} />}
              keywords={["recordings", "library"]}
              onSelect={() => run(() => navigate("/dashboard/project"))}
            >
              Projects
            </Item>
            <Item
              icon={<CalendarDays size={15} />}
              keywords={["upcoming", "sessions"]}
              onSelect={() => run(() => navigate("/dashboard/calendar"))}
            >
              Calendar
            </Item>
            <Item
              icon={<Settings size={15} />}
              keywords={["profile", "billing", "plan"]}
              onSelect={() => run(() => navigate("/dashboard/settings"))}
            >
              Settings
            </Item>
          </Command.Group>

          {projects.length > 0 && (
            <Command.Group heading="Projects">
              {projects.map((space) => (
                <Item
                  key={space.id}
                  // Unique value so two projects with the same title don't merge.
                  value={`${space.title || "Untitled recording"} ${space.id}`}
                  icon={<MdOutlineVideoLabel size={15} />}
                  onSelect={() =>
                    run(() => navigate(`/dashboard/project/${space.id}`))
                  }
                >
                  {space.title || "Untitled recording"}
                </Item>
              ))}
            </Command.Group>
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
  keywords,
  onSelect,
  children,
}: {
  icon: ReactNode;
  value?: string;
  keywords?: string[];
  onSelect: () => void;
  children: ReactNode;
}) => (
  <Command.Item
    value={value}
    keywords={keywords}
    onSelect={onSelect}
    className="flex h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm text-foreground data-[selected=true]:bg-muted"
  >
    <span className="flex size-6 shrink-0 items-center justify-center text-fg-muted">
      {icon}
    </span>
    <span className="min-w-0 flex-1 truncate">{children}</span>
  </Command.Item>
);

export default CommandMenu;
