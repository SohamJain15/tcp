import { useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { LogOut, Moon, Sun, User } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { userApi } from "@/api/services";
import type { UserRole } from "@/api/types";
import { getSessionCloseUrl } from "@/lib/sso";

const linksByRole: Record<UserRole, Array<{ to: string; label: string }>> = {
  STUDENT: [
    { to: "/student/dashboard", label: "Dashboard" },
    { to: "/student/problems", label: "Problems" },
    { to: "/student/contests", label: "Contests" },
    { to: "/student/leaderboard", label: "Leaderboard" },
    { to: "/student/profile", label: "Profile" },
  ],
  FACULTY: [
    { to: "/faculty/dashboard", label: "Dashboard" },
    { to: "/faculty/problems", label: "Problems" },
    { to: "/faculty/contests", label: "Contests" },
    { to: "/faculty/submissions", label: "Submissions" },
    { to: "/faculty/leaderboard", label: "Leaderboard" },
    { to: "/faculty/profile", label: "Profile" },
  ],
};

function getAvatarFallback(name: string | null | undefined, role: UserRole): string {
  if (!name) {
    return role === "FACULTY" ? "FC" : "ST";
  }

  const initials = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || (role === "FACULTY" ? "FC" : "ST");
}

export function Navbar() {
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
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

  const fallbackRole: UserRole = pathname.startsWith("/faculty") ? "FACULTY" : "STUDENT";
  const role = userQuery.data?.user.role ?? fallbackRole;
  const links = linksByRole[role];
  const showLinks = pathname.startsWith("/student") || pathname.startsWith("/faculty");
  const avatarText = getAvatarFallback(userQuery.data?.user.name, role);

  // NOTE: logout is explicit-only (avatar menu). A previous pagehide listener
  // auto-called /api/logout on every unload; now that the endpoint actually
  // clears auth cookies, that would log users out on refresh.

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-gradient-hero text-primary-foreground">
      <div className="container flex h-16 items-center gap-4">
        <Link to="/" className="flex items-center gap-3 shrink-0">
          <img src="/logo.png" alt="TCET Coding Platform logo" className="h-10 w-10 rounded-md bg-background object-cover ring-2 ring-accent/40" />
          <div className="hidden md:flex flex-col leading-tight">
            <span className="font-display text-base font-bold tracking-tight">TCET Coding Platform</span>
            <span className="font-deva text-[11px] text-accent">॥ शास्त्रं कोडः तीर्थं चेतः ॥</span>
          </div>
        </Link>

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
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
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
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Avatar className="h-9 w-9 ring-2 ring-accent/50">
              <AvatarFallback className="bg-accent text-accent-foreground">
                <User className="h-5 w-5" aria-label="Guest user" />
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    </header>
  );
}
