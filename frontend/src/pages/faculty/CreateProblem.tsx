import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { AppLayout } from "@/components/AppLayout";
import { ProblemEditorForm } from "@/components/ProblemEditorForm";
import { problemsApi } from "@/api/services";
import { toProblemWritePayload } from "@/api/mappers";
import type { ProblemEditorData } from "@/api/types";

export default function CreateProblem() {
  const navigate = useNavigate();

  const publishMutation = useMutation({
    mutationFn: (data: ProblemEditorData) =>
      problemsApi.create(toProblemWritePayload(data, "Published"), "/faculty/create-problem"),
    onSuccess: (response) => {
      navigate(`/faculty/problems/${response.problem.id}`);
    },
    onError: (error) => {
      toast.error((error as Error).message || "Failed to publish problem");
    },
  });

  const draftMutation = useMutation({
    mutationFn: (data: ProblemEditorData) =>
      problemsApi.create(toProblemWritePayload(data, "Draft"), "/faculty/create-problem"),
    onSuccess: (response) => {
      navigate(`/faculty/problems/${response.problem.id}`);
    },
    onError: (error) => {
      toast.error((error as Error).message || "Failed to save draft");
    },
  });

  return (
    <AppLayout>
      <ProblemEditorForm
        heading="Create New Problem"
        description="Design a meaningful challenge for your students."
        submitLabel="Publish"
        submitMessage="Problem published!"
        draftMessage="Draft saved"
        onSubmit={async (data) => publishMutation.mutateAsync(data)}
        onSaveDraft={async (data) => draftMutation.mutateAsync(data)}
        isSubmitting={publishMutation.isPending}
        isSavingDraft={draftMutation.isPending}
      />
    </AppLayout>
  );
}
