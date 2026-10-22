import { useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  Clapperboard,
  Crown,
  FolderClosed,
  House,
  LogOut,
  Settings,
  User as UserIcon,
} from "lucide-react";
import { IoBugOutline } from "react-icons/io5";
import { Link, useLocation } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shared/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useGetMe } from "@/hooks/useUserQuery";
import { useUsage } from "@/hooks/useUsage";
import PricingModal from "./PricingModal";

const GITHUB_NEW_ISSUE_URL =
  "https://github.com/rinkitadhana/openside/issues/new";

const navLinks = [
  { icon: House, name: "Home", to: "/dashboard/home" },
  { icon: FolderClosed, name: "Projects", to: "/dashboard/project" },
  { icon: CalendarDays, name: "Calendar", to: "/dashboard/calendar" },
];

interface DashboardSidebarProps {
  isOpen: boolean;
  /** Called after a nav link is clicked - lets the mobile drawer close itself. */
  onNavigate?: () => void;
}

const DashboardSidebar = ({ isOpen, onNavigate }: DashboardSidebarProps) => {
  const { pathname } = useLocation();
  const { data: user, isLoading } = useGetMe();
  const { logout } = useAuth();
  const { data: usage } = useUsage();
  const [pricingOpen, setPricingOpen] = useState(false);
  // Free (demo) users only - pro and self-host already have everything.
  const showUpgrade = usage?.plan === "demo";

  const navLinkClass = (isActive: boolean) =>
    `flex h-10 items-center overflow-hidden rounded-md text-sm font-medium transition-colors ${
      isActive ? "bg-muted text-foreground" : "text-foreground hover:bg-muted"
    }`;

  return (
    <aside
      className={`flex h-full shrink-0 flex-col overflow-hidden border-r border-border bg-background p-3 transition-[width] duration-200 ${
        isOpen ? "w-56" : "w-[66px]"
      }`}
    >
      <div className="mb-5 flex h-9 items-center overflow-hidden">
        <span className="flex w-[42px] shrink-0 items-center justify-center">
          <img
            src="/logo/logo-light.png"
            className="h-auto w-5 shrink-0 select-none dark:hidden"
            alt="Openside"
          />
          <img
            src="/logo/logo-dark.png"
            className="hidden h-auto w-5 shrink-0 select-none dark:block"
            alt="Openside"
          />
        </span>
        <span className="min-w-0 flex-1 truncate text-base font-bold uppercase tracking-wide text-foreground">
          Openside
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {navLinks.map(({ icon: Icon, name, to }) => {
          const isActive = pathname === to;

          return (
            <Link
              key={to}
              to={to}
              title={name}
              onClick={onNavigate}
              className={navLinkClass(isActive)}
            >
              <span className="flex w-[42px] shrink-0 items-center justify-center">
                <Icon size={18} />
              </span>
              <span className="min-w-0 flex-1 truncate pr-3">{name}</span>
            </Link>
          );
        })}
        {/* Not built yet: shown so people know it's coming, but not a link. */}
        <div
          aria-disabled="true"
          title="Editor · Coming soon"
          className="flex h-10 cursor-not-allowed items-center overflow-hidden rounded-md text-sm font-medium text-fg-subtle"
        >
          <span className="flex w-[42px] shrink-0 items-center justify-center">
            <Clapperboard size={18} />
          </span>
          <span className="min-w-0 flex-1 truncate">Editor</span>
          <span className="mr-2 shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[0.65rem] font-semibold text-fg-muted">
            Coming soon
          </span>
        </div>
      </nav>

      <div className="flex flex-col gap-1">
        {showUpgrade && (
          <button
            type="button"
            onClick={() => setPricingOpen(true)}
            title="Upgrade to Pro"
            className="mb-1 flex h-10 items-center overflow-hidden rounded-md bg-brand text-sm font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer"
          >
            <span
              className={`flex shrink-0 items-center justify-center ${
                isOpen ? "w-[42px]" : "w-full"
              }`}
            >
              <Crown size={16} className="fill-current" />
            </span>
            {isOpen && (
              <span className="min-w-0 flex-1 truncate text-left">
                Upgrade to Pro
              </span>
            )}
          </button>
        )}

        <a
          href={GITHUB_NEW_ISSUE_URL}
          target="_blank"
          rel="noreferrer"
          title="Report an issue"
          className="flex h-10 items-center overflow-hidden rounded-md border border-border/50 bg-primary text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <span
            className={`flex shrink-0 items-center justify-center ${
              isOpen ? "w-[42px]" : "w-full"
            }`}
          >
            <IoBugOutline size={17} />
          </span>
          {isOpen && (
            <span className="min-w-0 flex-1 truncate pr-3">
              Report an issue
            </span>
          )}
        </a>

        <div className="my-1 h-px bg-border" />

        {/* User profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={user?.name || "Account"}
              className="group flex h-11 items-center overflow-hidden rounded-md text-left transition-colors hover:bg-muted data-[state=open]:bg-muted cursor-pointer"
            >
              <span className="flex w-[42px] shrink-0 items-center justify-center">
                <span className="flex size-7 items-center justify-center overflow-hidden rounded bg-muted text-foreground">
                  {isLoading ? (
                    <UserIcon size={16} />
                  ) : user?.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.name || "User"}
                      className="size-full object-cover"
                    />
                  ) : (
                    <UserIcon size={16} />
                  )}
                </span>
              </span>
              {isLoading ? (
                <span className="h-4 w-24 animate-pulse rounded bg-muted" />
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {user?.name || "User"}
                </span>
              )}
              <ChevronDown
                size={16}
                className="mr-3 shrink-0 text-fg-muted transition-transform duration-200 group-data-[state=open]:rotate-180"
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={8}
            className="w-(--radix-dropdown-menu-trigger-width) min-w-48 rounded-lg border-border bg-background p-1.5 shadow-sm"
          >
            <DropdownMenuItem
              asChild
              className="h-9 cursor-pointer rounded-md px-2.5"
            >
              <Link to="/dashboard/settings" onClick={onNavigate}>
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="h-9 cursor-pointer rounded-md px-2.5 text-danger focus:bg-danger/10 focus:text-danger"
              onClick={logout}
            >
              <LogOut className="h-4 w-4 text-danger" />
              <span>Logout</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <PricingModal open={pricingOpen} onClose={() => setPricingOpen(false)} />
    </aside>
  );
};

export default DashboardSidebar;
