import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Target, CheckCircle2, Activity, ArrowRight } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, DifficultyBadge } from "@/components/Badges";
import { problemsApi, submissionsApi, userApi } from "@/api/services";
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

export default function StudentDashboard() {
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

  const user = userQuery.data?.user;
  const recentSubmissions = useMemo(
    () =>
      [...(submissionsQuery.data?.items ?? [])]
        .filter((submission) => submission.sourceType === "problem")
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [submissionsQuery.data?.items],
  );
  const recommendedProblems = useMemo(
    () => (problemsQuery.data?.items ?? []).filter((problem) => problem.userStatus !== "solved").slice(0, 3),
    [problemsQuery.data?.items],
  );

  const stats = user
    ? [
        { label: "Problems Solved", value: user.problemsSolved, icon: CheckCircle2, accent: "text-success" },
        { label: "Submissions", value: user.submissionCount, icon: Activity, accent: "text-accent" },
        { label: "Current Rank", value: user.rank ? `#${user.rank}` : "N/A", icon: Trophy, accent: "text-gold" },
        { label: "Accuracy", value: `${user.accuracy}%`, icon: Target, accent: "text-primary dark:text-accent" },
      ]
    : [];

  return (
    <AppLayout>
      <div className="container mx-auto space-y-6 p-6 md:p-8">
        <Card className="overflow-hidden border-0 shadow-elevated">
          <div className="relative bg-gradient-hero p-8 text-primary-foreground dark:bg-card dark:text-foreground">
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
                    className="border-white/30 bg-transparent text-primary-foreground hover:bg-white/10 dark:border-border dark:text-foreground dark:hover:bg-secondary"
                  >
                    Leaderboard
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </Card>

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
                    <Card className="h-full p-4 transition-all duration-200 hover:border-accent hover:shadow-md">
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
