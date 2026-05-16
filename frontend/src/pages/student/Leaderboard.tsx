import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Medal, Award } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { leaderboardApi } from "@/api/services";
import { DEPARTMENTS, type Department } from "@/api/types";
import { cn } from "@/lib/utils";

const podiumIcons = [Trophy, Medal, Award];

export default function StudentLeaderboard() {
  const [department, setDepartment] = useState<Department | "All">("All");
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["student-leaderboard", department],
    queryFn: () =>
      leaderboardApi.list({
        pageSize: 100,
        department: department === "All" ? undefined : department,
      }),
  });

  const leaderboard = data?.items ?? [];
  const top3 = useMemo(() => leaderboard.slice(0, 3), [leaderboard]);
  const rest = useMemo(() => leaderboard.slice(3), [leaderboard]);

  return (
    <AppLayout>
      <div className="container space-y-8 py-8">
        <div>
          <h1 className="font-display text-3xl font-bold">Leaderboard</h1>
          <p className="mt-1 text-muted-foreground">The top minds at TCET this semester.</p>
        </div>

        <div>
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
        </div>

        {isLoading && <Card className="p-6 text-center text-muted-foreground">Loading leaderboard...</Card>}
        {isError && <Card className="p-6 text-center text-destructive">{(error as Error)?.message || "Failed to load leaderboard"}</Card>}

        {!isLoading && !isError && (
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
                  <Card key={student.rank} className={cn("relative overflow-hidden p-6 shadow-elevated", index === 0 && "md:scale-105")}>
                    <div className={cn("absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br opacity-20", colors)} />
                    <div className="relative">
                      <div className="flex items-center justify-between">
                        <Icon className={cn("h-8 w-8", index === 0 ? "text-gold" : index === 1 ? "text-muted-foreground" : "text-accent")} />
                        <span className="font-display text-4xl font-bold text-muted-foreground/30">#{student.rank}</span>
                      </div>
                      <h3 className="mt-3 font-display text-xl font-bold">{student.name ?? student.email}</h3>
                      <p className="font-mono-code text-xs text-muted-foreground">{student.email}</p>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-lg font-bold">{student.problemsSolved}</div>
                          <div className="text-[10px] uppercase text-muted-foreground">Solved</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold">{student.score}</div>
                          <div className="text-[10px] uppercase text-muted-foreground">Score</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold">{student.accuracy}%</div>
                          <div className="text-[10px] uppercase text-muted-foreground">Accuracy</div>
                        </div>
                      </div>
                    </div>
                  </Card>
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
                      <th className="px-4 py-3 text-right font-semibold">Solved</th>
                      <th className="px-4 py-3 text-right font-semibold">Score</th>
                      <th className="px-4 py-3 text-right font-semibold">Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rest.map((student) => (
                      <tr key={student.rank} className="border-t border-border hover:bg-secondary/50">
                        <td className="px-4 py-3 font-display font-bold">#{student.rank}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{student.name ?? student.email}</div>
                          <div className="font-mono-code text-xs text-muted-foreground">{student.email}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono-code">{student.problemsSolved}</td>
                        <td className="px-4 py-3 text-right font-mono-code font-semibold">{student.score}</td>
                        <td className="px-4 py-3 text-right font-mono-code">{student.accuracy}%</td>
                      </tr>
                    ))}
                    {leaderboard.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
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
