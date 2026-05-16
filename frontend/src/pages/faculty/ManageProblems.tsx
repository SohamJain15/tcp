import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppLayout } from "@/components/AppLayout";
import { DifficultyBadge, StatusBadge } from "@/components/Badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { problemsApi } from "@/api/services";
import { toLifecycleLabel } from "@/api/mappers";

export default function ManageProblems() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["faculty-manage-problems"],
    queryFn: () => problemsApi.listManage({ pageSize: 100 }, "/faculty/problems"),
  });

  const stateMutation = useMutation({
    mutationFn: ({ problemId, state }: { problemId: string; state: "Published" | "Archived" }) =>
      problemsApi.updateState(problemId, state, "/faculty/problems"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faculty-manage-problems"] });
      toast.success("Problem state updated");
    },
    onError: (mutationError) => {
      toast.error((mutationError as Error)?.message || "Failed to update problem state");
    },
  });

  const rows = data?.items ?? [];

  return (
    <AppLayout>
      <div className="container space-y-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Manage Problems</h1>
            <p className="mt-1 text-muted-foreground">Edit, publish, and review problem performance.</p>
          </div>
          <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/faculty/create-problem">
              <Plus className="mr-2 h-4 w-4" /> New Problem
            </Link>
          </Button>
        </div>

        <Card className="overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left text-secondary-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Title</th>
                  <th className="px-4 py-3 font-semibold">Difficulty</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Tags</th>
                  <th className="px-4 py-3 text-right font-semibold">Submissions</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                      Loading problems...
                    </td>
                  </tr>
                )}
                {isError && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-destructive">
                      {(error as Error)?.message || "Failed to load problems"}
                    </td>
                  </tr>
                )}
                {!isLoading && !isError &&
                  rows.map((problem) => (
                    <tr key={problem.id} className="border-t border-border transition-colors hover:bg-secondary/40">
                      <td className="px-4 py-3">
                        <Link to={`/faculty/problems/${problem.id}`} className="font-medium transition-colors hover:text-accent">
                          {problem.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <DifficultyBadge d={problem.difficulty} />
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {problem.tags.map((tag) => (
                            <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono-code">{problem.totalSubmissions}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={toLifecycleLabel(problem.lifecycleState)} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <Button asChild size="icon" variant="ghost" className="h-8 w-8" aria-label={`View ${problem.title}`}>
                            <Link to={`/faculty/problems/${problem.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button asChild size="icon" variant="ghost" className="h-8 w-8" aria-label={`Edit ${problem.title}`}>
                            <Link to={`/faculty/problems/${problem.id}/edit`}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className={problem.lifecycleState === "Published" ? "h-8 w-8 text-destructive" : "h-8 w-8 text-success"}
                            aria-label={`${problem.lifecycleState === "Published" ? "Archive" : "Publish"} ${problem.title}`}
                            onClick={() =>
                              stateMutation.mutate({
                                problemId: problem.id,
                                state: problem.lifecycleState === "Published" ? "Archived" : "Published",
                              })
                            }
                            disabled={stateMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                {!isLoading && !isError && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                      No problems are currently available.
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
