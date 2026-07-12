import { Link } from "react-router-dom";
import { memo, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilePlus2, Trophy, BookOpen, Users, Activity, Target } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/Badges";
import { problemsApi, submissionsApi, userApi } from "@/api/services";
import { toFacultyStudentProfilePath } from "@/lib/student-profile";
import { toLanguageLabel, toStatusLabel } from "@/api/mappers";
import { chartAxisTick, chartTooltipItemStyle, chartTooltipLabelStyle, chartTooltipStyle } from "@/lib/chart-theme";
import type { SubmissionStatus } from "@/api/types";

function safeAverage(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 100) / 100;
}

function formatTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString();
}

const STATUS_COLORS: Partial<Record<SubmissionStatus, string>> = {
  ACCEPTED: "hsl(var(--success))",
  WRONG_ANSWER: "hsl(var(--destructive))",
  TIME_LIMIT_EXCEEDED: "hsl(var(--warning))",
  RUNTIME_ERROR: "hsl(var(--accent))",
  COMPILATION_ERROR: "hsl(var(--muted-foreground))",
};

const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: "#22c55e",
  Medium: "#eab308",
  Hard: "#ef4444",
};

type TrendDatum = { day: string; count: number };
type VerdictDatum = { name: string; value: number; color: string };
type LanguageDatum = { name: string; count: number };
type DifficultyDatum = { name: string; count: number };

function ChartEmptyState({ message }: { message: string }) {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{message}</div>;
}

// Memoized so query refreshes elsewhere on the page don't re-trigger chart animations.
const SubmissionTrendChart = memo(function SubmissionTrendChart({ data }: { data: TrendDatum[] }) {
  if (data.every((entry) => entry.count === 0)) {
    return <ChartEmptyState message="No submissions yet." />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="facultyTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.35} />
            <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis dataKey="day" tickLine={false} axisLine={false} tick={chartAxisTick} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={chartAxisTick} />
        <Tooltip
          contentStyle={chartTooltipStyle}
          labelStyle={chartTooltipLabelStyle}
          itemStyle={chartTooltipItemStyle}
          cursor={{ stroke: "hsl(var(--accent))", strokeWidth: 1, strokeDasharray: "3 3" }}
        />
        <Area
          type="monotone"
          dataKey="count"
          name="Submissions"
          stroke="hsl(var(--accent))"
          strokeWidth={2}
          fill="url(#facultyTrendFill)"
          animationDuration={500}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
});

const VerdictDonutChart = memo(function VerdictDonutChart({ data }: { data: VerdictDatum[] }) {
  const total = data.reduce((sum, entry) => sum + entry.value, 0);

  if (total === 0) {
    return <ChartEmptyState message="No submissions yet." />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-[170px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              outerRadius={74}
              innerRadius={50}
              paddingAngle={data.length > 1 ? 3 : 0}
              dataKey="value"
              stroke="hsl(var(--card))"
              strokeWidth={2}
              animationDuration={500}
              animationEasing="ease-out"
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-bold leading-none">{total}</span>
          <span className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">Total</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {data.map((entry) => (
          <span key={entry.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5" style={{ backgroundColor: entry.color }} aria-hidden />
            {entry.name}
            <span className="font-mono-code font-semibold text-foreground">{entry.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
});

const LanguageUsageChart = memo(function LanguageUsageChart({ data }: { data: LanguageDatum[] }) {
  if (data.length === 0) {
    return <ChartEmptyState message="No submissions yet." />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <XAxis dataKey="name" tickLine={false} axisLine={false} tick={chartAxisTick} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={chartAxisTick} />
        <Tooltip
          contentStyle={chartTooltipStyle}
          labelStyle={chartTooltipLabelStyle}
          itemStyle={chartTooltipItemStyle}
          cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
        />
        <Bar
          dataKey="count"
          name="Submissions"
          radius={0}
          fill="hsl(var(--primary))"
          maxBarSize={44}
          animationDuration={500}
          animationEasing="ease-out"
        />
      </BarChart>
    </ResponsiveContainer>
  );
});

const DifficultyMixChart = memo(function DifficultyMixChart({ data }: { data: DifficultyDatum[] }) {
  if (data.every((entry) => entry.count === 0)) {
    return <ChartEmptyState message="No problems created yet." />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <XAxis dataKey="name" tickLine={false} axisLine={false} tick={chartAxisTick} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={chartAxisTick} />
        <Tooltip
          contentStyle={chartTooltipStyle}
          labelStyle={chartTooltipLabelStyle}
          itemStyle={chartTooltipItemStyle}
          cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
        />
        <Bar dataKey="count" name="Problems" radius={0} maxBarSize={44} animationDuration={500} animationEasing="ease-out">
          {data.map((entry) => (
            <Cell key={entry.name} fill={DIFFICULTY_COLORS[entry.name] ?? "hsl(var(--primary))"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
});

export default function FacultyDashboard() {
  const userQuery = useQuery({
    queryKey: ["faculty-dashboard", "user"],
    queryFn: () => userApi.me("/faculty/dashboard"),
  });

  const problemsQuery = useQuery({
    queryKey: ["faculty-dashboard", "problems"],
    queryFn: () => problemsApi.listManage({ pageSize: 100 }, "/faculty/dashboard"),
  });

  const submissionsQuery = useQuery({
    queryKey: ["faculty-dashboard", "submissions"],
    queryFn: () => submissionsApi.list({ pageSize: 50 }, "/faculty/dashboard"),
  });

  const recentSubmissions = useMemo(
    () =>
      [...(submissionsQuery.data?.items ?? [])]
        .filter((submission) => submission.sourceType === "problem")
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
        .slice(0, 6),
    [submissionsQuery.data?.items],
  );

  const facultyName = userQuery.data?.user.name ?? "Faculty";
  const problemList = problemsQuery.data?.items ?? [];
  const submissionList = useMemo(
    () => (submissionsQuery.data?.items ?? []).filter((submission) => submission.sourceType === "problem"),
    [submissionsQuery.data?.items],
  );
  const activeStudents = new Set(submissionList.map((submission) => submission.userEmail)).size;
  const topStudents = useMemo(() => {
    const byStudent = new Map<
      string,
      {
        email: string;
        name: string | null;
        uid: string | null;
        score: number;
        solved: Set<string>;
        accepted: number;
        total: number;
      }
    >();

    submissionList.forEach((submission) => {
      const existing =
        byStudent.get(submission.userEmail) ??
        {
          email: submission.userEmail,
          name: submission.userName,
          uid: submission.userUid,
          score: 0,
          solved: new Set<string>(),
          accepted: 0,
          total: 0,
        };

      existing.total += 1;
      if (submission.status === "ACCEPTED") {
        existing.accepted += 1;
        if (!existing.solved.has(submission.problemId)) {
          existing.solved.add(submission.problemId);
          existing.score += submission.ratingAwarded || 0;
        }
      }

      byStudent.set(submission.userEmail, existing);
    });

    return Array.from(byStudent.values())
      .map((entry) => ({
        ...entry,
        accuracy: entry.total === 0 ? 0 : Math.round((entry.accepted / entry.total) * 10000) / 100,
        problemsSolved: entry.solved.size,
      }))
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        if (right.problemsSolved !== left.problemsSolved) return right.problemsSolved - left.problemsSolved;
        if (right.accuracy !== left.accuracy) return right.accuracy - left.accuracy;
        return left.email.localeCompare(right.email);
      })
      .slice(0, 5);
  }, [submissionList]);
  const avgAccuracy = safeAverage(
    topStudents.length > 0
      ? topStudents.map((entry) => entry.accuracy)
      : Array.from(
          submissionList.reduce((map, submission) => {
            const current = map.get(submission.userEmail) ?? { accepted: 0, total: 0 };
            current.total += 1;
            if (submission.status === "ACCEPTED") {
              current.accepted += 1;
            }
            map.set(submission.userEmail, current);
            return map;
          }, new Map<string, { accepted: number; total: number }>()),
        ).map(([, value]) => (value.total === 0 ? 0 : Math.round((value.accepted / value.total) * 10000) / 100)),
  );

  // Chart datasets — aggregated client-side from the queries this page already makes.
  const submissionTrend = useMemo<TrendDatum[]>(() => {
    const now = new Date();
    const days = Array.from({ length: 14 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (13 - index));
      return date;
    });

    return days.map((date) => ({
      day: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count: submissionList.filter((submission) => {
        const created = new Date(submission.createdAt);
        return (
          created.getFullYear() === date.getFullYear() &&
          created.getMonth() === date.getMonth() &&
          created.getDate() === date.getDate()
        );
      }).length,
    }));
  }, [submissionList]);

  const verdictBreakdown = useMemo<VerdictDatum[]>(() => {
    const counts = new Map<SubmissionStatus, number>();
    submissionList.forEach((submission) => {
      counts.set(submission.status, (counts.get(submission.status) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([status, value]) => ({
        name: toStatusLabel(status),
        value,
        color: STATUS_COLORS[status] ?? "hsl(var(--muted-foreground))",
      }));
  }, [submissionList]);

  const languageUsage = useMemo<LanguageDatum[]>(() => {
    const counts = new Map<string, number>();
    submissionList.forEach((submission) => {
      const label = toLanguageLabel(submission.language);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [submissionList]);

  const difficultyMix = useMemo<DifficultyDatum[]>(
    () =>
      (["Easy", "Medium", "Hard"] as const).map((difficulty) => ({
        name: difficulty,
        count: problemList.filter((problem) => problem.difficulty === difficulty).length,
      })),
    [problemList],
  );

  const stats = [
    { label: "Problems Created", value: String(problemsQuery.data?.pageInfo.totalCount ?? problemList.length), icon: BookOpen },
    { label: "Total Submissions", value: submissionList.length.toLocaleString(), icon: Activity },
    { label: "Active Students", value: String(activeStudents), icon: Users },
    { label: "Avg. Accuracy", value: `${avgAccuracy}%`, icon: Target },
  ];

  const loading = userQuery.isLoading || problemsQuery.isLoading || submissionsQuery.isLoading;
  const error = userQuery.error || problemsQuery.error || submissionsQuery.error;

  return (
    <AppLayout>
      <div className="container space-y-8 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-accent">Faculty Console</p>
            <h1 className="mt-1 font-display text-3xl font-bold md:text-4xl">Welcome, {facultyName}</h1>
            <p className="mt-1 text-muted-foreground">Curate problems, monitor progress, recognize excellence.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/faculty/create-problem">
              <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
                <FilePlus2 className="mr-2 h-4 w-4" /> New Problem
              </Button>
            </Link>
            <Link to="/faculty/create-contest">
              <Button size="lg" variant="outline">
                <Trophy className="mr-2 h-4 w-4" /> New Contest
              </Button>
            </Link>
          </div>
        </div>

        {loading && <Card className="p-6 text-center text-muted-foreground">Loading dashboard...</Card>}
        {error && !loading && <Card className="p-6 text-center text-destructive">{(error as Error)?.message || "Failed to load dashboard"}</Card>}

        {!loading && !error && (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {stats.map((stat) => (
                <Card key={stat.label} className="border-l-4 border-l-accent p-5 shadow-card">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-semibold uppercase tracking-wider">{stat.label}</span>
                    <stat.icon className="h-5 w-5 text-accent" />
                  </div>
                  <div className="mt-2 font-display text-3xl font-bold">{stat.value}</div>
                </Card>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="profile-card flex h-full flex-col p-5 lg:col-span-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Submission Activity (14 Days)
                </h2>
                <div className="mt-4 h-[220px] flex-1">
                  <SubmissionTrendChart data={submissionTrend} />
                </div>
              </Card>

              <Card className="profile-card flex h-full flex-col p-5">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Verdict Breakdown</h2>
                <div className="mt-4 min-h-[220px] flex-1">
                  <VerdictDonutChart data={verdictBreakdown} />
                </div>
              </Card>

              <Card className="profile-card flex h-full flex-col p-5 lg:col-span-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Language Usage</h2>
                <div className="mt-4 h-[220px] flex-1">
                  <LanguageUsageChart data={languageUsage} />
                </div>
              </Card>

              <Card className="profile-card flex h-full flex-col p-5">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Problem Difficulty Mix
                </h2>
                <div className="mt-4 h-[220px] flex-1">
                  <DifficultyMixChart data={difficultyMix} />
                </div>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="overflow-hidden shadow-card lg:col-span-2">
                <div className="flex items-center justify-between p-6 pb-3">
                  <h2 className="font-display text-xl font-bold">Recent Submissions</h2>
                  <Link to="/faculty/submissions" className="text-sm text-accent hover:underline">
                    View all
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary text-left text-secondary-foreground">
                      <tr>
                        <th className="px-4 py-2 font-semibold">Student</th>
                        <th className="px-4 py-2 font-semibold">Problem</th>
                        <th className="px-4 py-2 font-semibold">Status</th>
                        <th className="px-4 py-2 text-right font-semibold">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentSubmissions.map((submission) => (
                        <tr key={submission.id} className="border-t border-border">
                          <td className="px-4 py-2">
                            <Link to={toFacultyStudentProfilePath(submission.userEmail)} className="block hover:text-accent">
                              <div className="font-medium">{submission.userName ?? submission.userEmail}</div>
                              <div className="font-mono-code text-xs text-muted-foreground">
                                {submission.userUid ?? submission.userEmail}
                              </div>
                            </Link>
                          </td>
                          <td className="px-4 py-2">{submission.problemTitle}</td>
                          <td className="px-4 py-2">
                            <StatusBadge status={toStatusLabel(submission.status)} />
                          </td>
                          <td className="px-4 py-2 text-right font-mono-code text-xs text-muted-foreground">{formatTime(submission.createdAt)}</td>
                        </tr>
                      ))}
                      {recentSubmissions.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                            No submissions yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="p-6 shadow-card">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-display text-xl font-bold">Top Students</h2>
                  <Link to="/faculty/leaderboard" className="text-sm text-accent hover:underline">
                    All
                  </Link>
                </div>
                <ol className="space-y-3">
                  {topStudents.map((student, index) => (
                    <li key={student.email} className="flex items-center gap-3">
                      <span className="w-6 font-display font-bold text-accent">#{index + 1}</span>
                      <div className="flex-1">
                        <Link to={toFacultyStudentProfilePath(student.email)} className="block hover:text-accent">
                          <div className="text-sm font-medium">{student.name ?? student.email}</div>
                          <div className="font-mono-code text-xs text-muted-foreground">{student.uid ?? student.email}</div>
                        </Link>
                      </div>
                      <span className="font-mono-code text-xs font-semibold">{student.score}</span>
                    </li>
                  ))}
                  {topStudents.length === 0 && <div className="text-sm text-muted-foreground">No rankings available.</div>}
                </ol>
              </Card>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
