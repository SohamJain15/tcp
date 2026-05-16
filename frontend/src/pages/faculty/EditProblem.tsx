import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, Eye, FileText, Layers3 } from "lucide-react";
import { toast } from "sonner";

import { AppLayout } from "@/components/AppLayout";
import { DifficultyBadge, StatusBadge } from "@/components/Badges";
import { ProblemEditorForm } from "@/components/ProblemEditorForm";
import { Card } from "@/components/ui/card";
import { problemsApi } from "@/api/services";
import { toEditorDataFromManageProblem, toLifecycleLabel, toProblemUpdatePayload } from "@/api/mappers";
import type { ProblemEditorData } from "@/api/types";

export default function EditProblem() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["faculty-edit-problem", id],
    queryFn: () => problemsApi.getManageDetail(id, `/faculty/problems/${id}/edit`),
    enabled: Boolean(id),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ editorData, asDraft }: { editorData: ProblemEditorData; asDraft: boolean }) => {
      const updated = await problemsApi.update(id, toProblemUpdatePayload(editorData), `/faculty/problems/${id}/edit`);
      if (asDraft) {
        await problemsApi.updateState(id, "Draft", `/faculty/problems/${id}/edit`);
      }
      return updated;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["faculty-edit-problem", id] }),
        queryClient.invalidateQueries({ queryKey: ["faculty-problem-detail", id] }),
        queryClient.invalidateQueries({ queryKey: ["faculty-manage-problems"] }),
      ]);
      navigate(`/faculty/problems/${id}`);
    },
    onError: (mutationError) => {
      toast.error((mutationError as Error).message || "Failed to update problem");
    },
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container py-8 text-muted-foreground">Loading problem...</div>
      </AppLayout>
    );
  }

  if (isError || !data) {
    return (
      <AppLayout>
        <div className="container py-8 text-destructive">{(error as Error)?.message || "Failed to load problem"}</div>
      </AppLayout>
    );
  }

  const problem = data.problem;
  const initialProblem = toEditorDataFromManageProblem(problem);

  return (
    <AppLayout>
      <ProblemEditorForm
        key={problem.id}
        heading="Edit Problem"
        description={`Refine ${problem.title} while keeping the faculty console style, spacing, and publishing flow intact.`}
        submitLabel="Update Problem"
        submitMessage="Problem updated"
        draftMessage="Draft changes saved"
        initialProblem={initialProblem}
        onSubmit={async (editorData) => updateMutation.mutateAsync({ editorData, asDraft: false })}
        onSaveDraft={async (editorData) => updateMutation.mutateAsync({ editorData, asDraft: true })}
        isSubmitting={updateMutation.isPending}
        isSavingDraft={updateMutation.isPending}
        topSlot={
          <div className="space-y-3">
            <Link
              to={`/faculty/problems/${problem.id}`}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-accent"
            >
              <ArrowLeft className="h-4 w-4" /> Back to problem overview
            </Link>

            <Card className="grid gap-4 p-5 shadow-card md:grid-cols-4">
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current State</div>
                <div className="flex items-center gap-2">
                  <DifficultyBadge d={problem.difficulty} />
                  <StatusBadge status={toLifecycleLabel(problem.lifecycleState)} />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Layers3 className="h-3.5 w-3.5 text-accent" />
                  Topic Count
                </div>
                <div className="font-display text-2xl font-bold">{problem.tags.length}</div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Eye className="h-3.5 w-3.5 text-accent" />
                  Submissions
                </div>
                <div className="font-display text-2xl font-bold">{problem.totalSubmissions}</div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5 text-accent" />
                  Last Updated
                </div>
                <div className="font-mono-code text-sm font-semibold">{new Date(problem.updatedAt).toLocaleString()}</div>
              </div>
              <div className="rounded-lg border border-border bg-secondary/35 px-4 py-3 text-sm text-muted-foreground md:col-span-4">
                <span className="mr-2 inline-flex items-center gap-1 font-semibold text-foreground">
                  <FileText className="h-4 w-4 text-accent" /> Editing notes
                </span>
                Keep the description, constraints, and testcase coverage aligned with the student-facing preview before publishing updates.
              </div>
            </Card>
          </div>
        }
      />
    </AppLayout>
  );
}
