import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trophy, Target, CheckCircle2, Activity, ArrowRight, CalendarClock, Radio, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContestTimer } from "@/components/ContestTimer";
import { StatusBadge, DifficultyBadge } from "@/components/Badges";
import { contestsApi, problemsApi, submissionsApi, userApi } from "@/api/services";
import type { ContestListItem } from "@/api/types";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { toLanguageLabel, toStatusLabel } from "@/api/mappers";

function formatRelativeTime(isoDate: string): string {
  const created = new Date(isoDate).getTime();
  const diffMs = Date.now() - created;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) {
    return "just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} d ago`;
}

/**
 * Full-width alert for the contest a student needs to act on right now. Deliberately loud —
 * the old sidebar list was easy to scroll straight past.
 */
function LiveContestBanner({
  contest,
  onRegister,
  isRegistering,
}: {
  contest: ContestListItem;
  onRegister: () => void;
  isRegistering: boolean;
}) {
  const isLive = contest.studentListStatus === "Live";
  const hasSubmitted = contest.attemptStatus === "SUBMITTED" || contest.attemptStatus === "AUTO_SUBMITTED";
  const canRegister = !contest.isRegistered && contest.registrationStatus === "OPEN";

  return (
    <Card
      className={cn(
        "overflow-hidden border-2 shadow-elevated",
        isLive ? "border-success" : "border-accent",
      )}
    >
      <div className={cn("h-1 w-full", isLive ? "bg-success" : "bg-accent")} />
      <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between md:p-6">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {isLive && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              )}
              <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", isLive ? "bg-success" : "bg-accent")} />
            </span>
            <span
              className={cn(
                "text-xs font-bold uppercase tracking-widest",
                isLive ? "text-success" : "text-accent",
              )}
            >
              {isLive ? "Contest Live Now" : "Contest Starting Soon"}
            </span>
            <Badge className={contest.type === "Rated" ? "bg-blue-600 text-white hover:bg-blue-600" : ""}>
              {contest.type}
            </Badge>
            {contest.isRegistered && !hasSubmitted && (
              <Badge variant="outline" className="border-accent/50 text-accent">Registered</Badge>
            )}
            {hasSubmitted && (
              <Badge className="bg-success text-success-foreground hover:bg-success">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Attempted
              </Badge>
            )}
          </div>

          <h2 className="truncate font-display text-2xl font-bold">{contest.title}</h2>
          <p className="text-sm text-muted-foreground">
            {contest.durationMinutes} min attempt · {contest.registeredCount} registered ·{" "}
            {isLive ? `Closes ${formatDateTime(contest.endAt)}` : `Starts ${formatDateTime(contest.startAt)}`}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-3 md:items-end">
          <ContestTimer
            deadline={isLive ? contest.endAt : contest.startAt}
            label={isLive ? "Closes in" : "Starts in"}
          />
          {hasSubmitted ? (
            <Button size="lg" variant="outline" disabled>
              Attempted
            </Button>
          ) : canRegister ? (
            <Button
              size="lg"
              className="bg-accent font-semibold text-accent-foreground hover:bg-accent/90"
              onClick={onRegister}
              disabled={isRegistering}
            >
              <UserPlus className="mr-2 h-4 w-4" />
              {isRegistering ? "Registering..." : "Register Now"}
            </Button>
          ) : contest.isRegistered ? (
            <Link to={`/student/contests/${contest.id}`}>
              <Button size="lg" className="w-full bg-accent font-semibold text-accent-foreground hover:bg-accent/90">
                {isLive ? "Enter Contest" : "View Contest"} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <Link to={`/student/contests/${contest.id}`}>
              <Button size="lg" variant="outline" className="w-full">
                View Details
              </Button>
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function StudentDashboard() {
  const queryClient = useQueryClient();
  const userQuery = useQuery({
    queryKey: ["student-dashboard", "user"],
    queryFn: () => userApi.me("/student/dashboard"),
  });

  const submissionsQuery = useQuery({
    queryKey: ["student-dashboard", "submissions"],
    queryFn: () => submissionsApi.list({ pageSize: 8 }, "/student/dashboard"),
  });

  const problemsQuery = useQuery({
    queryKey: ["student-dashboard", "problems"],
    queryFn: () => problemsApi.listStudent({ pageSize: 30 }, "/student/dashboard"),
  });

  const contestsQuery = useQuery({
    queryKey: ["student-dashboard", "contests"],
    queryFn: () => contestsApi.list({ pageSize: 100 }, "/student/dashboard"),
  });

  const user = userQuery.data?.user;
  const recentSubmissions = useMemo(
    () =>
      [...(submissionsQuery.data?.items ?? [])]
        .filter((submission) => submission.sourceType === "problem")
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
        .slice(0, 5),
    [submissionsQuery.data?.items],
  );
  const recommendedProblems = useMemo(
    () => (problemsQuery.data?.items ?? []).filter((problem) => problem.userStatus !== "solved").slice(0, 3),
    [problemsQuery.data?.items],
  );
  const liveContests = useMemo(
    () => (contestsQuery.data?.items ?? []).filter((contest) => contest.studentListStatus === "Live").slice(0, 3),
    [contestsQuery.data?.items],
  );
  const upcomingContests = useMemo(
    () => (contestsQuery.data?.items ?? []).filter((contest) => contest.studentListStatus === "Upcoming").slice(0, 3),
    [contestsQuery.data?.items],
  );
  // Surface the single most urgent contest: a live one first, otherwise the next one the student
  // can still register for.
  const featuredContest = useMemo(() => {
    if (liveContests.length > 0) {
      return liveContests[0];
    }

    return (
      [...upcomingContests]
        .sort((left, right) => +new Date(left.startAt) - +new Date(right.startAt))
        .find((contest) => contest.isRegistered || contest.registrationStatus === "OPEN") ?? null
    );
  }, [liveContests, upcomingContests]);

  const registerMutation = useMutation({
    mutationFn: (contestId: string) => contestsApi.register(contestId, "/student/dashboard"),
    onSuccess: async () => {
      toast.success("You are registered for this contest");
      await queryClient.invalidateQueries({ queryKey: ["student-dashboard", "contests"] });
    },
    onError: (mutationError) => {
      toast.error((mutationError as Error)?.message || "Failed to register for this contest");
    },
  });

  const stats = user
    ? [
        { label: "Problems Solved", value: user.problemsSolved, icon: CheckCircle2, accent: "text-success" },
        { label: "Submissions", value: user.submissionCount, icon: Activity, accent: "text-accent" },
        { label: "Current Rank", value: user.rank ? `#${user.rank}` : "N/A", icon: Trophy, accent: "text-gold" },
        { label: "Accuracy", value: `${user.accuracy}%`, icon: Target, accent: "text-primary" },
      ]
    : [];

  return (
    <AppLayout>
      <div className="container mx-auto space-y-6 p-6 md:p-8">
        <Card className="overflow-hidden border-0 shadow-elevated">
          <div className="relative bg-gradient-hero p-8 text-primary-foreground">
            <div className="absolute inset-0 opacity-10 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:24px_24px]" />
            <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-center">
              <div>
                <p className="text-sm font-semibold uppercase tracking-widest text-accent">Namaste, {user?.name ?? "Student"}</p>
                <h1 className="mt-1 font-display text-3xl font-bold md:text-4xl">Ready to climb the ranks today?</h1>
                <p className="mt-2 font-deva text-accent">॥ शास्त्रं कोडः तीर्थं चेतः ॥</p>
              </div>
              <div className="flex gap-3">
                <Link to="/student/problems">
                  <Button size="lg" className="bg-accent font-semibold text-accent-foreground hover:bg-accent/90">
                    Start Solving <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/student/leaderboard">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-white/30 bg-transparent text-primary-foreground hover:bg-white/10"
                  >
                    Leaderboard
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </Card>

        {featuredContest && (
          <LiveContestBanner
            contest={featuredContest}
            onRegister={() => registerMutation.mutate(featuredContest.id)}
            isRegistering={registerMutation.isPending}
          />
        )}

        {userQuery.isLoading && <Card className="p-6 text-center text-muted-foreground">Loading dashboard...</Card>}
        {userQuery.isError && <Card className="p-6 text-center text-destructive">{(userQuery.error as Error)?.message || "Failed to load dashboard"}</Card>}

        {!userQuery.isLoading && !userQuery.isError && user && (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {stats.map((stat) => (
                <Card key={stat.label} className="p-5 shadow-card transition-shadow hover:shadow-elevated">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</span>
                    <stat.icon className={`h-5 w-5 ${stat.accent}`} />
                  </div>
                  <div className="mt-3 font-display text-3xl font-bold">{stat.value}</div>
                </Card>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="p-6 shadow-card lg:col-span-2">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-display text-xl font-bold">Recent Submissions</h2>
                  <Link to="/student/profile" className="text-sm text-accent hover:underline">
                    View all
                  </Link>
                </div>
                <div className="divide-y divide-border">
                  {submissionsQuery.isLoading && <div className="py-4 text-sm text-muted-foreground">Loading submissions...</div>}
                  {!submissionsQuery.isLoading && recentSubmissions.length === 0 && (
                    <div className="py-4 text-sm text-muted-foreground">No submissions yet.</div>
                  )}
                  {!submissionsQuery.isLoading &&
                    recentSubmissions.map((submission) => (
                      <div key={submission.id} className="flex items-center justify-between py-3">
                        <div>
                          <div className="font-medium">{submission.problemTitle}</div>
                          <div className="text-xs text-muted-foreground">
                            {toLanguageLabel(submission.language)} · {formatRelativeTime(submission.createdAt)}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono-code text-xs text-muted-foreground">{submission.runtimeMs} ms</span>
                          <StatusBadge status={toStatusLabel(submission.status)} />
                        </div>
                      </div>
                    ))}
                </div>
              </Card>

              <Card className="p-6 shadow-card">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-display text-xl font-bold">Contests</h2>
                  <Link to="/student/contests" className="text-sm text-accent hover:underline">
                    View all
                  </Link>
                </div>

                <div className="space-y-5">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Radio className="h-3.5 w-3.5 text-success" /> Live
                    </div>
                    {contestsQuery.isLoading ? (
                      <div className="mt-2 text-sm text-muted-foreground">Loading contests...</div>
                    ) : liveContests.length === 0 ? (
                      <div className="mt-2 text-sm text-muted-foreground">No live contests right now.</div>
                    ) : (
                      <div className="mt-1 divide-y divide-border">
                        {liveContests.map((contest) => (
                          <Link
                            key={contest.id}
                            to={`/student/contests/${contest.id}`}
                            className="block py-2.5 transition-colors hover:text-accent"
                          >
                            <div className="truncate text-sm font-medium">{contest.title}</div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              {contest.durationMinutes} mins
                              {contest.isRegistered && <span className="text-accent">· Registered</span>}
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <CalendarClock className="h-3.5 w-3.5 text-accent" /> Upcoming
                    </div>
                    {contestsQuery.isLoading ? (
                      <div className="mt-2 text-sm text-muted-foreground">Loading contests...</div>
                    ) : upcomingContests.length === 0 ? (
                      <div className="mt-2 text-sm text-muted-foreground">No upcoming contests scheduled.</div>
                    ) : (
                      <div className="mt-1 divide-y divide-border">
                        {upcomingContests.map((contest) => (
                          <Link
                            key={contest.id}
                            to={`/student/contests/${contest.id}`}
                            className="block py-2.5 transition-colors hover:text-accent"
                          >
                            <div className="truncate text-sm font-medium">{contest.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatDateTime(contest.startAt)}
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>

            <Card className="p-6 shadow-card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-xl font-bold">Recommended for You</h2>
                <Link to="/student/problems" className="text-sm text-accent hover:underline">
                  Browse all
                </Link>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {recommendedProblems.map((problem) => (
                  <Link to={`/student/problems/${problem.id}`} key={problem.id}>
                    <Card className="card-interactive h-full p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold">{problem.title}</h3>
                        <DifficultyBadge d={problem.difficulty} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {problem.tags.map((tag) => (
                          <span key={tag} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3 text-xs text-muted-foreground">Acceptance · {problem.acceptanceRate}%</div>
                    </Card>
                  </Link>
                ))}
                {!problemsQuery.isLoading && recommendedProblems.length === 0 && (
                  <div className="text-sm text-muted-foreground">No recommendations available yet.</div>
                )}
              </div>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
