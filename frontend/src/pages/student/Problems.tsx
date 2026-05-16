import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, CheckCircle2, Circle, CircleDot } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DifficultyBadge } from "@/components/Badges";
import { problemsApi } from "@/api/services";
import type { Difficulty, StudentProblemStatus } from "@/api/types";

function StatusIcon({ status }: { status: StudentProblemStatus }) {
  if (status === "solved") {
    return <CheckCircle2 className="h-4 w-4 text-success" />;
  }

  if (status === "attempted") {
    return <CircleDot className="h-4 w-4 text-warning" />;
  }

  return <Circle className="h-4 w-4 text-muted-foreground" />;
}

export default function StudentProblems() {
  const [q, setQ] = useState("");
  const [diff, setDiff] = useState<Difficulty | "All">("All");
  const [tag, setTag] = useState<string>("All");
  const [status, setStatus] = useState<StudentProblemStatus | "All">("All");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["student-problems", q, diff, tag],
    queryFn: () =>
      problemsApi.listStudent({
        search: q || undefined,
        difficulty: diff === "All" ? undefined : diff,
        tag: tag === "All" ? undefined : tag,
        pageSize: 100,
      }),
  });

  const items = data?.items ?? [];

  const filtered = useMemo(
    () => items.filter((problem) => (status === "All" ? true : problem.userStatus === status)),
    [items, status],
  );

  const allTags = useMemo(() => Array.from(new Set(items.flatMap((problem) => problem.tags))), [items]);

  return (
    <AppLayout>
      <div className="container space-y-6 py-8">
        <div>
          <h1 className="font-display text-3xl font-bold">Problem Set</h1>
          <p className="mt-1 text-muted-foreground">Sharpen your skills, one problem at a time.</p>
        </div>

        <Card className="p-4 shadow-card">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search problems..." className="pl-9" />
            </div>
            <select value={diff} onChange={(event) => setDiff(event.target.value as Difficulty | "All")} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option>All</option>
              <option>Easy</option>
              <option>Medium</option>
              <option>Hard</option>
            </select>
            <select value={tag} onChange={(event) => setTag(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="All">All Topics</option>
              {allTags.map((topic) => (
                <option key={topic}>{topic}</option>
              ))}
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value as StudentProblemStatus | "All")} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="All">All Status</option>
              <option value="solved">Solved</option>
              <option value="attempted">Attempted</option>
              <option value="todo">To Do</option>
            </select>
          </div>
        </Card>

        <Card className="overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-secondary-foreground">
                <tr className="text-left">
                  <th className="w-12 px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Title</th>
                  <th className="px-4 py-3 font-semibold">Difficulty</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Tags</th>
                  <th className="px-4 py-3 text-right font-semibold">Acceptance</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                      Loading problems...
                    </td>
                  </tr>
                )}
                {isError && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-destructive">
                      {(error as Error)?.message || "Failed to load problems"}
                    </td>
                  </tr>
                )}
                {!isLoading && !isError &&
                  filtered.map((problem) => (
                    <tr key={problem.id} className="border-t border-border transition-colors hover:bg-secondary/50">
                      <td className="px-4 py-3">
                        <StatusIcon status={problem.userStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/student/problems/${problem.id}`} className="font-medium hover:text-accent">
                          {problem.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <DifficultyBadge d={problem.difficulty} />
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {problem.tags.map((topic) => (
                            <span key={topic} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {topic}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono-code text-xs">{problem.acceptanceRate}%</td>
                    </tr>
                  ))}
                {!isLoading && !isError && filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                      No problems match your filters.
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
