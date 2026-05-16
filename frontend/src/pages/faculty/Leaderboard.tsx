import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { leaderboardApi } from "@/api/services";
import { Link } from "react-router-dom";
import { toFacultyStudentProfilePath } from "@/lib/student-profile";
import { DEPARTMENTS, type Department } from "@/api/types";

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
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["faculty-leaderboard", department],
    queryFn: () =>
      leaderboardApi.list(
        {
          pageSize: 100,
          department: department === "All" ? undefined : department,
        },
        "/faculty/leaderboard",
      ),
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      leaderboardApi.exportCsv("/faculty/leaderboard", {
        department: department === "All" ? undefined : department,
      }),
    onSuccess: (csv) => {
      downloadCsv("leaderboard.csv", csv);
      toast.success("CSV export ready");
    },
    onError: (mutationError) => {
      toast.error((mutationError as Error)?.message || "Failed to export CSV");
    },
  });

  const leaderboard = data?.items ?? [];
  const rows = useMemo(() => leaderboard, [leaderboard]);

  return (
    <AppLayout>
      <div className="container space-y-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Student Leaderboard</h1>
            <p className="mt-1 text-muted-foreground">Track performance across the cohort.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={department}
              onChange={(event) => setDepartment(event.target.value as Department | "All")}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="All">All Departments</option>
              {DEPARTMENTS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
              <Download className="mr-2 h-4 w-4" /> {exportMutation.isPending ? "Exporting..." : "Export CSV"}
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left text-secondary-foreground">
                <tr>
                  <th className="w-16 px-4 py-3 font-semibold">Rank</th>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 text-right font-semibold">Solved</th>
                  <th className="px-4 py-3 text-right font-semibold">Score</th>
                  <th className="px-4 py-3 text-right font-semibold">Accuracy</th>
                  <th className="px-4 py-3 text-right font-semibold">Submissions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                      Loading leaderboard...
                    </td>
                  </tr>
                )}
                {isError && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-destructive">
                      {(error as Error)?.message || "Failed to load leaderboard"}
                    </td>
                  </tr>
                )}
                {!isLoading && !isError &&
                  rows.map((student) => (
                    <tr key={student.rank} className={`border-t border-border hover:bg-secondary/40 ${student.rank <= 3 ? "bg-accent/5" : ""}`}>
                      <td className="px-4 py-3 font-display font-bold text-accent">#{student.rank}</td>
                      <td className="px-4 py-3">
                        <Link to={toFacultyStudentProfilePath(student.email)} className="block hover:text-accent">
                          <div className="font-medium">{student.name ?? student.email}</div>
                          <div className="font-mono-code text-xs text-muted-foreground">{student.uid ?? student.email}</div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right font-mono-code">{student.problemsSolved}</td>
                      <td className="px-4 py-3 text-right font-mono-code font-semibold">{student.score}</td>
                      <td className="px-4 py-3 text-right font-mono-code">{student.accuracy}%</td>
                      <td className="px-4 py-3 text-right font-mono-code">{student.submissionCount}</td>
                    </tr>
                  ))}
                {!isLoading && !isError && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                      No leaderboard data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
