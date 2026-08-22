import { useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ExternalLink, LogOut, Menu, Moon, Sun, User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "./ThemeProvider";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { classTestApi, userApi } from "@/api/services";
import type { UserRole } from "@/api/types";
import { getSessionCloseUrl } from "@/lib/sso";
import { CLASS_TESTS_ENABLED } from "@/lib/feature-flags";

const linksByRole: Record<UserRole, Array<{ to: string; label: string }>> = {
  STUDENT: [
    { to: "/student/dashboard", label: "Dashboard" },
    { to: "/student/problems", label: "Problems" },
    { to: "/student/contests", label: "Contests" },
    { to: "/student/class-tests", label: "Class Tests" },
    { to: "/student/labs", label: "Labs" },
    { to: "/student/leaderboard", label: "Leaderboard" },
    { to: "/student/profile", label: "Profile" },
  ],
  FACULTY: [
    { to: "/faculty/dashboard", label: "Dashboard" },
    { to: "/faculty/problems", label: "Problems" },
    { to: "/faculty/contests", label: "Contests" },
    { to: "/faculty/class-tests", label: "Class Test" },
    { to: "/faculty/labs", label: "Labs" },
    { to: "/faculty/submissions", label: "Submissions" },
    { to: "/faculty/leaderboard", label: "Leaderboard" },
    { to: "/faculty/profile", label: "Profile" },
  ],
  // Institute leadership: read-only analytics across every department.
  ADMIN: [
    { to: "/admin/dashboard", label: "Departments" },
    { to: "/admin/leaderboard", label: "Leaderboard" },
    { to: "/admin/profile", label: "Profile" },
  ],
};

const AVATAR_FALLBACK_BY_ROLE: Record<UserRole, string> = {
  STUDENT: "ST",
  FACULTY: "FC",
  ADMIN: "AD",
};

function getAvatarFallback(name: string | null | undefined, role: UserRole): string {
  if (!name) {
    return AVATAR_FALLBACK_BY_ROLE[role];
  }

  const initials = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || AVATAR_FALLBACK_BY_ROLE[role];
}

export function Navbar() {
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const profileMenuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openProfileMenu = () => {
    if (profileMenuCloseTimer.current) {
      clearTimeout(profileMenuCloseTimer.current);
      profileMenuCloseTimer.current = null;
    }
    setProfileMenuOpen(true);
  };

  const scheduleProfileMenuClose = () => {
    if (profileMenuCloseTimer.current) {
      clearTimeout(profileMenuCloseTimer.current);
    }
    profileMenuCloseTimer.current = setTimeout(() => setProfileMenuOpen(false), 150);
  };

  const handleLogout = () => {
    window.location.href = getSessionCloseUrl();
  };
  const userQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => userApi.me(pathname, { suppressAuthRedirect: true }),
    retry: false,
    staleTime: 30_000,
  });

  // Used only for the first paint, before /api/users/me resolves — infer from the path so the nav
  // does not flash the wrong links.
  const fallbackRole: UserRole = pathname.startsWith("/admin")
    ? "ADMIN"
    : pathname.startsWith("/faculty")
      ? "FACULTY"
      : "STUDENT";
  const role = userQuery.data?.user.role ?? fallbackRole;
  const isHod = role === "FACULTY" && (userQuery.data?.user.isHod ?? false);
  // HODs get an extra "Department" tab, inserted right after Dashboard.
  const links = isHod
    ? [
        linksByRole.FACULTY[0],
        { to: "/faculty/department", label: "Department" },
        ...linksByRole.FACULTY.slice(1),
      ]
    : linksByRole[role];
  const showLinks =
    pathname.startsWith("/student") || pathname.startsWith("/faculty") || pathname.startsWith("/admin");

  // Only tests that are still actionable are worth a badge — a submitted or finished one is not.
  // Skipped entirely while the feature is flagged off: a count badge on a tab that opens a
  // "coming soon" page would just be confusing, and there is no point polling for it.
  const assignedClassTestsQuery = useQuery({
    queryKey: ["assigned-class-tests"],
    queryFn: () => classTestApi.listAssigned(pathname),
    enabled: CLASS_TESTS_ENABLED && role === "STUDENT" && showLinks,
    retry: false,
    staleTime: 30_000,
  });
  const assignedClassTestCount = (assignedClassTestsQuery.data?.items ?? []).filter(
    (test) =>
      test.computedStatus !== "Ended" &&
      test.attemptStatus !== "SUBMITTED" &&
      test.attemptStatus !== "AUTO_SUBMITTED",
  ).length;
  const avatarText = getAvatarFallback(userQuery.data?.user.name, role);

  // NOTE: logout is explicit-only (avatar menu). A previous pagehide listener
  // auto-called /api/logout on every unload; now that the endpoint actually
  // clears auth cookies, that would log users out on refresh.

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-gradient-hero text-primary-foreground">
      <div className="container flex h-16 min-w-0 items-center gap-2 sm:gap-4">
        <Link to="/" className="flex min-w-0 shrink-0 items-center gap-3">
          <img src="/logo.png" alt="TCET Coding Platform logo" className="h-9 w-9 rounded-md bg-background object-cover ring-2 ring-accent/40 sm:h-10 sm:w-10" />
          <div className="hidden md:flex flex-col leading-tight">
            <span className="font-display text-base font-bold tracking-tight">TCET Coding Platform</span>
            <span className="font-deva text-[11px] text-accent">॥ शास्त्रं कोडः तीर्थं चेतः ॥</span>
          </div>
        </Link>

        {/* Below lg the desktop nav is hidden; without this the entire menu was unreachable on a
            phone — logo, theme toggle and avatar were the only controls on screen. */}
        {showLinks && (
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open menu"
                className="ml-0 shrink-0 text-primary-foreground hover:bg-white/10 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="border-b border-border px-4 py-4 text-left font-display text-base font-bold">
                Menu
              </SheetTitle>
              <nav className="flex flex-col p-2">
                {links.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center justify-between px-3 py-3 text-sm font-medium transition-colors",
                        isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                      )
                    }
                  >
                    {l.label}
                    {l.to === "/student/class-tests" && assignedClassTestCount > 0 && (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold text-destructive-foreground">
                        {assignedClassTestCount}
                      </span>
                    )}
                  </NavLink>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        )}

        <nav className="ml-6 hidden lg:flex items-center gap-1">
          {showLinks && links.map(l => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) => cn(
                "nav-tab px-3 py-2 rounded-none text-sm font-medium",
                isActive
                  ? "nav-tab-active bg-accent text-accent-foreground shadow-sm"
                  : "text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/10"
              )}
            >
              {l.label}
              {/* Assigned class tests are the one thing a student is expected to act on at a
                  specific time, so the count is surfaced rather than left to be discovered. */}
              {l.to === "/student/class-tests" && assignedClassTestCount > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {assignedClassTestCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label="Toggle theme"
            className="text-primary-foreground hover:bg-white/10"
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>

          {userQuery.data ? (
            <DropdownMenu modal={false} open={profileMenuOpen} onOpenChange={setProfileMenuOpen}>
              <DropdownMenuTrigger
                asChild
                onMouseEnter={openProfileMenu}
                onMouseLeave={scheduleProfileMenuClose}
              >
                <button
                  type="button"
                  aria-label="Profile menu"
                  className="rounded-none outline-none transition-transform duration-150 hover:scale-105 focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Avatar className="h-9 w-9 ring-2 ring-accent/50">
                    <AvatarFallback className="bg-accent text-accent-foreground text-xs font-bold">
                      {avatarText}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="w-56 rounded-none"
                onMouseEnter={openProfileMenu}
                onMouseLeave={scheduleProfileMenuClose}
              >
                <DropdownMenuLabel className="font-normal">
                  <div className="text-sm font-semibold leading-tight">{userQuery.data.user.name ?? avatarText}</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{userQuery.data.user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={handleLogout}
                  className="cursor-pointer rounded-none text-destructive focus:bg-destructive focus:text-destructive-foreground"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="https://tcetcercd.in/" className="cursor-pointer rounded-none">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    COE Portal
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Avatar className="h-9 w-9 ring-2 ring-accent/50">
              <AvatarFallback className="bg-accent text-accent-foreground">
                <User className="h-5 w-5" aria-label="Guest user" />
              </AvatarFallback>
            </Avatar>
          )}

          <a
            href="https://www.tcetmumbai.in/"
            aria-label="Visit the TCET website"
            className="hidden h-10 w-10 items-center justify-center bg-transparent transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:flex lg:h-12 lg:w-12"
          >
            {theme === "light" ? (
              <img
                src="/tcetlogo-light.png"
                alt="Thakur College of Engineering and Technology"
                className="h-10 w-10 bg-transparent object-contain drop-shadow-[0_0_2px_rgba(0,0,0,0.35)] lg:h-12 lg:w-12"
              />
            ) : (
              <img
                src="/tcetlogo-transparent.png"
                alt="Thakur College of Engineering and Technology"
                className="h-10 w-10 bg-transparent object-contain drop-shadow-[0_0_2px_rgba(255,255,255,0.65)] lg:h-12 lg:w-12"
              />
            )}
          </a>
        </div>
      </div>
    </header>
  );
}
