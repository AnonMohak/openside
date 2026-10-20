"use client";

import { Heart, Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { GoSidebarCollapse, GoSidebarExpand } from "react-icons/go";
import { FaGithub } from "react-icons/fa";
import CommandMenu from "./CommandMenu";

const GITHUB_REPO_URL = "https://github.com/rinkitadhana/openside";
const GITHUB_REPO_API_URL =
  "https://api.github.com/repos/rinkitadhana/openside";
const GITHUB_SPONSORS_URL = "https://github.com/sponsors/rinkitadhana";

interface GitHubRepository {
  stargazers_count: number;
}

const formatStarCount = (count: number) =>
  Intl.NumberFormat("en", {
    notation: count >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(count);

interface DashboardHeaderProps {
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
}

const DashboardHeader = ({
  onToggleSidebar,
  isSidebarOpen,
}: DashboardHeaderProps) => {
  const { data: githubStars } = useQuery({
    queryKey: ["github-stars", "rinkitadhana/openside"],
    queryFn: async () => {
      const response = await fetch(GITHUB_REPO_API_URL, {
        headers: { Accept: "application/vnd.github+json" },
      });

      if (!response.ok) {
        throw new Error("Failed to load GitHub stars");
      }

      const repository = (await response.json()) as GitHubRepository;
      return repository.stargazers_count;
    },
    staleTime: 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  return (
    <header className="relative flex h-14 shrink-0 items-center justify-between border-b border-border pl-2 pr-4">
      <button
        type="button"
        title={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
        onClick={onToggleSidebar}
        className="flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted cursor-pointer"
      >
        {isSidebarOpen ? (
          <GoSidebarExpand size={20} />
        ) : (
          <GoSidebarCollapse size={20} />
        )}
      </button>

      <div className="absolute left-1/2 -translate-x-1/2 max-md:static max-md:ml-auto max-md:mr-2 max-md:translate-x-0">
        <CommandMenu />
      </div>

      <div className="flex items-center gap-2">
        <a
          href={GITHUB_SPONSORS_URL}
          target="_blank"
          rel="noreferrer"
          title="Sponsor on GitHub"
          className="flex h-9 items-center gap-2 rounded-md border border-border bg-muted px-3 text-sm font-medium text-foreground transition-opacity hover:opacity-80"
        >
          <Heart size={14} className="fill-current text-pink-500" />
          Sponsor
        </a>
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noreferrer"
          title={`GitHub repository${
            githubStars === undefined ? "" : `, ${githubStars} stars`
          }`}
          className="flex h-9 items-center gap-2 rounded-md border border-border bg-muted px-3 text-sm font-medium text-foreground transition-opacity hover:opacity-80"
        >
          <FaGithub size={18} />
          <span className="flex items-center gap-1 tabular-nums">
            <Star size={12} fill="currentColor" />
            {githubStars === undefined ? "..." : formatStarCount(githubStars)}
          </span>
        </a>
      </div>
    </header>
  );
};

export default DashboardHeader;
