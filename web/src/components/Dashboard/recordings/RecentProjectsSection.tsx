import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useScreenRecordings } from "@/hooks/useScreenRecordings";
import { useGetUserSpaces } from "@/hooks/useSpace";
import ProjectCard from "./ProjectCard";
import { ScreenRecordingCard } from "./ScreenRecordingsSection";

const RecentProjectsSection = () => {
  const navigate = useNavigate();
  const { data: spaces = [], isLoading: spacesLoading } =
    useGetUserSpaces("hosted");
  const { data: screenRecordings = [], isLoading: screenLoading } =
    useScreenRecordings();
  const isLoading = spacesLoading || screenLoading;

  // Meeting projects and screen recordings, newest first.
  const recentProjects = useMemo(
    () =>
      [
        ...spaces
          .filter((space) => (space._count?.recordingSessions ?? 0) > 0)
          .map((space) => ({
            kind: "space" as const,
            space,
            at: new Date(space.createdAt ?? 0).getTime(),
          })),
        ...screenRecordings.map((recording) => ({
          kind: "screen" as const,
          recording,
          at: new Date(recording.startedAt || recording.createdAt).getTime(),
        })),
      ]
        .sort((a, b) => b.at - a.at)
        .slice(0, 4),
    [spaces, screenRecordings],
  );

  if (isLoading) {
    return (
      <section className="mx-auto w-full max-w-5xl px-2">
        <div className="mb-3 flex items-center justify-between">
          <div className="h-5 w-36 animate-pulse rounded bg-muted" />
          <div className="h-4 w-14 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="aspect-[4/3] animate-pulse rounded-xl border border-border/50 bg-muted"
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-2">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Recent projects</h3>
        <button
          type="button"
          onClick={() => navigate("/dashboard/project")}
          className="flex items-center gap-1 text-xs font-medium text-fg-muted transition-colors hover:text-foreground cursor-pointer"
        >
          View all
          <ChevronRight size={14} />
        </button>
      </div>

      {recentProjects.length === 0 ? (
        <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border text-sm text-fg-subtle">
          Your recordings will show up here
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {recentProjects.map((item) =>
            item.kind === "space" ? (
              <ProjectCard
                key={item.space.id}
                space={item.space}
                onOpen={(space) => navigate(`/dashboard/project/${space.id}`)}
                showOptions={false}
                showRetention={false}
              />
            ) : (
              <ScreenRecordingCard
                key={item.recording.id}
                rec={item.recording}
                compact
              />
            ),
          )}
        </div>
      )}
    </section>
  );
};

export default RecentProjectsSection;
