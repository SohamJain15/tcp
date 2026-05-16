import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilePlus2, ListChecks, FileCode2, Trophy, BookOpen, Users, Activity, Target } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/Badges";
import { problemsApi, submissionsApi, userApi } from "@/api/services";
import { toFacultyStudentProfilePath } from "@/lib/student-profile";
import { toStatusLabel } from "@/api/mappers";

function safeAverage(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 100) / 100;
}

function formatTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString();
}

const actions = [
  { to: "/faculty/create-problem", label: "Create Problem", icon: FilePlus2, primary: true },
  { to: "/faculty/create-contest", label: "Create Contest", icon: Trophy },
  { to: "/faculty/contests", label: "View Contests", icon: Trophy },
  { to: "/faculty/problems", label: "Manage Problems", icon: ListChecks },
  { to: "/faculty/submissions", label: "View Submissions", icon: FileCode2 },
  { to: "/faculty/leaderboard", label: "View Leaderboard", icon: Trophy },
];

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
          <Link to="/faculty/create-problem">
            <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
              <FilePlus2 className="mr-2 h-4 w-4" /> New Problem
            </Button>
          </Link>
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

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {actions.map((action) => (
                <Link key={action.to} to={action.to}>
                  <Card className={`h-full p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated ${action.primary ? "border-primary bg-primary/5" : ""}`}>
                    <action.icon className="h-7 w-7 text-accent" />
                    <div className="mt-3 font-display text-lg font-bold">{action.label}</div>
                  </Card>
                </Link>
              ))}
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
