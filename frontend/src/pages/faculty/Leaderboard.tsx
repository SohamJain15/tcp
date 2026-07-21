import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Award, Download, Medal, Trophy } from "lucide-react";
import { toast } from "sonner";

import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThemedSelect } from "@/components/ThemedSelect";
import { contestsApi, leaderboardApi } from "@/api/services";
import { toFacultyStudentProfilePath } from "@/lib/student-profile";
import { DEPARTMENTS, type Department } from "@/api/types";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const podiumIcons = [Trophy, Medal, Award];
const YEAR_OPTIONS = [1, 2, 3, 4] as const;
type ViewMode = "problem" | "contest";

function getYearLabel(year: 1 | 2 | 3 | 4): string {
  return year === 1 ? "1st Year" : year === 2 ? "2nd Year" : year === 3 ? "3rd Year" : "4th Year";
}

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.setAttribute("download", filename);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function FacultyLeaderboard() {
  const [department, setDepartment] = useState<Department | "All">("All");
  const [year, setYear] = useState<1 | 2 | 3 | 4 | "All">("All");
  const [viewMode, setViewMode] = useState<ViewMode>("problem");
  const [contestId, setContestId] = useState<string>("All");

  const contestsQuery = useQuery({
    queryKey: ["faculty-leaderboard-contests"],
    queryFn: () => contestsApi.list({ pageSize: 100 }, "/faculty/leaderboard"),
    enabled: viewMode === "contest",
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["faculty-leaderboard", department, year],
    queryFn: () =>
      leaderboardApi.list(
        {
          pageSize: 100,
          department: department === "All" ? undefined : department,
          year: year === "All" ? undefined : year,
        },
        "/faculty/leaderboard",
      ),
    enabled: viewMode === "problem",
  });

  const contestStandingsQuery = useQuery({
    queryKey: ["faculty-contest-leaderboard", contestId, department, year],
    queryFn: () =>
      contestsApi.getStandings(
        contestId,
        "/faculty/leaderboard",
        {
          department: department === "All" ? undefined : department,
          year: year === "All" ? undefined : year,
        },
      ),
    enabled: viewMode === "contest" && contestId !== "All",
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      viewMode === "problem"
        ? leaderboardApi.exportCsv("/faculty/leaderboard", {
            department: department === "All" ? undefined : department,
            year: year === "All" ? undefined : year,
          })
        : contestsApi.exportStandingsCsv(contestId, "/faculty/leaderboard", {
            department: department === "All" ? undefined : department,
            year: year === "All" ? undefined : year,
          }),
    onSuccess: (csv) => {
      downloadCsv(viewMode === "problem" ? "leaderboard.csv" : `contest-${contestId}-standings.csv`, csv);
      toast.success("CSV export ready");
    },
    onError: (mutationError) => {
      toast.error((mutationError as Error)?.message || "Failed to export CSV");
    },
  });

  const contests = contestsQuery.data?.items ?? [];
  const availableContests = useMemo(
    () => contests.filter((contest) => contest.resultsPublished || contest.studentListStatus === "Past"),
    [contests],
  );
  const selectedContestId = contestId === "All" ? availableContests[0]?.id ?? "All" : contestId;
  const leaderboard = viewMode === "problem" ? data?.items ?? [] : contestStandingsQuery.data?.items ?? [];
  const top3 = useMemo(() => leaderboard.slice(0, 3), [leaderboard]);
  const rest = useMemo(() => leaderboard.slice(3), [leaderboard]);
  const yearEntryRank = useMemo(() => {
    const counts = new Map<number, number>();
    const ranks = new Map<string, number>();
    for (const entry of leaderboard) {
      if (entry.year == null) continue;
      const nextRank = (counts.get(entry.year) ?? 0) + 1;
      counts.set(entry.year, nextRank);
      ranks.set(entry.email, nextRank);
    }
    return ranks;
  }, [leaderboard]);

  return (
    <AppLayout>
      <div className="container space-y-8 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Leaderboard</h1>
            <p className="mt-1 text-muted-foreground">Track problem ratings or published contest standings.</p>
          </div>
          <Button variant="outline" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
            <Download className="mr-2 h-4 w-4" /> {exportMutation.isPending ? "Exporting..." : "Export CSV"}
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Select value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
            <SelectTrigger className="h-11 w-full rounded-none border-border bg-background px-4 text-sm font-medium text-foreground shadow-none ring-0 transition-colors data-[placeholder]:text-muted-foreground focus:ring-2 focus:ring-accent/30">
              <SelectValue placeholder="Leaderboard type" />
            </SelectTrigger>
            <SelectContent className="w-[var(--radix-select-trigger-width)] rounded-none border-border bg-card p-0 text-card-foreground shadow-elevated">
              <SelectItem value="problem">Problem leaderboard</SelectItem>
              <SelectItem value="contest">Contest leaderboard</SelectItem>
            </SelectContent>
          </Select>

          <ThemedSelect
            value={department}
            onValueChange={(value) => setDepartment(value as Department | "All")}
            placeholder="All Departments"
            triggerClassName="h-11 px-4"
            options={[
              { value: "All", label: "All Departments" },
              ...DEPARTMENTS.map((entry) => ({ value: entry, label: entry })),
            ]}
          />

          <Select value={String(year)} onValueChange={(value) => setYear(value === "All" ? "All" : (Number(value) as 1 | 2 | 3 | 4))}>
            <SelectTrigger className="h-11 w-full rounded-none border-border bg-background px-4 text-sm font-medium text-foreground shadow-none ring-0 transition-colors data-[placeholder]:text-muted-foreground focus:ring-2 focus:ring-accent/30">
              <SelectValue placeholder="All Years" />
            </SelectTrigger>
            <SelectContent className="w-[var(--radix-select-trigger-width)] rounded-none border-border bg-card p-0 text-card-foreground shadow-elevated">
              <SelectItem value="All">All Years</SelectItem>
              {YEAR_OPTIONS.map((entry) => (
                <SelectItem key={entry} value={String(entry)}>
                  {entry === 1 ? "1st Year" : entry === 2 ? "2nd Year" : entry === 3 ? "3rd Year" : "4th Year"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {viewMode === "contest" && (
          <div className="max-w-xl">
            <Select value={selectedContestId} onValueChange={setContestId}>
              <SelectTrigger className="h-11 w-full rounded-none border-border bg-background px-4 text-sm font-medium text-foreground shadow-none ring-0 transition-colors data-[placeholder]:text-muted-foreground focus:ring-2 focus:ring-accent/30">
                <SelectValue placeholder="Select contest" />
              </SelectTrigger>
              <SelectContent className="w-[var(--radix-select-trigger-width)] rounded-none border-border bg-card p-0 text-card-foreground shadow-elevated">
                <SelectItem value="All">Select contest</SelectItem>
                {availableContests.map((contest) => (
                  <SelectItem key={contest.id} value={contest.id}>
                    {contest.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {(viewMode === "problem" ? isLoading : contestStandingsQuery.isLoading) && <Card className="p-6 text-center text-muted-foreground">Loading leaderboard...</Card>}
        {(viewMode === "problem" ? isError : contestStandingsQuery.isError) && (
          <Card className="p-6 text-center text-destructive">{((viewMode === "problem" ? error : contestStandingsQuery.error) as Error)?.message || "Failed to load leaderboard"}</Card>
        )}

        {viewMode === "contest" && selectedContestId === "All" ? (
          <Card className="p-6 text-center text-muted-foreground">Select a contest to view standings.</Card>
        ) : !((viewMode === "problem" ? isLoading : contestStandingsQuery.isLoading)) && !((viewMode === "problem" ? isError : contestStandingsQuery.isError)) && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              {top3.map((student, index) => {
                const Icon = podiumIcons[index];
                const colors = [
                  "from-gold to-accent",
                  "from-muted-foreground to-muted-foreground/60",
                  "from-accent/80 to-accent/40",
                ][index];

                return (
                  <Link key={student.rank} to={toFacultyStudentProfilePath(student.email)} className="block">
                    <Card className={cn("card-interactive relative h-full overflow-hidden p-6 shadow-elevated", index === 0 && "md:scale-105")}>
                      <div className={cn("absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br opacity-20", colors)} />
                      <div className="relative">
                        <div className="flex items-center justify-between">
                          <Icon className={cn("h-8 w-8", index === 0 ? "text-gold" : index === 1 ? "text-muted-foreground" : "text-accent")} />
                          <span className="font-display text-4xl font-bold text-muted-foreground/30">#{student.rank}</span>
                        </div>
                        <h3 className="mt-3 font-display text-xl font-bold">{student.name ?? student.email}</h3>
                        <p className="font-mono-code text-xs text-muted-foreground">{student.uid ?? student.email}</p>
                        {student.year && <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{getYearLabel(student.year)} Leader</p>}
                        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                          <div><div className="text-lg font-bold">{student.problemsSolved}</div><div className="text-[10px] uppercase text-muted-foreground">Solved</div></div>
                          <div><div className="text-lg font-bold">{student.score}</div><div className="text-[10px] uppercase text-muted-foreground">Score</div></div>
                          <div><div className="text-lg font-bold">{student.accuracy}%</div><div className="text-[10px] uppercase text-muted-foreground">Accuracy</div></div>
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>

            <Card className="overflow-hidden shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary text-secondary-foreground">
                    <tr className="text-left">
                      <th className="w-16 px-4 py-3 font-semibold">Rank</th>
                      <th className="px-4 py-3 font-semibold">Student</th>
                      {viewMode === "contest" && <th className="px-4 py-3 font-semibold">Year</th>}
                      <th className="px-4 py-3 text-right font-semibold">Solved</th>
                      <th className="px-4 py-3 text-right font-semibold">Score</th>
                      <th className="px-4 py-3 text-right font-semibold">Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rest.map((student) => (
                      <tr key={student.rank} className={cn("border-t border-border hover:bg-secondary/50", viewMode === "contest" && student.year && (yearEntryRank.get(student.email) ?? 0) <= 2 && "bg-accent/10")}>
                        <td className="px-4 py-3 font-display font-bold">#{student.rank}</td>
                        <td className="px-4 py-3">
                          <Link to={toFacultyStudentProfilePath(student.email)} className="block hover:text-accent">
                            <div className="font-medium">{student.name ?? student.email}</div>
                            <div className="font-mono-code text-xs text-muted-foreground">{student.uid ?? student.email}</div>
                          </Link>
                        </td>
                        {viewMode === "contest" && <td className="px-4 py-3">{student.year ? getYearLabel(student.year) : "-"}</td>}
                        <td className="px-4 py-3 text-right font-mono-code">{student.problemsSolved}</td>
                        <td className="px-4 py-3 text-right font-mono-code font-semibold">{student.score}</td>
                        <td className="px-4 py-3 text-right font-mono-code">{student.accuracy}%</td>
                      </tr>
                    ))}
                    {leaderboard.length === 0 && (
                      <tr>
                        <td colSpan={viewMode === "contest" ? 6 : 5} className="px-4 py-12 text-center text-muted-foreground">
                          No leaderboard data yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
