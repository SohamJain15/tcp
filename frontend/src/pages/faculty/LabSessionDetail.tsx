import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

import { labSessionApi } from "@/api/services";
import { AppLayout } from "@/components/AppLayout";
import { SubmittedAnswerSheet } from "@/components/faculty/SubmittedAnswerSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function LabSessionDetail() {
  const { id = "" } = useParams();
  const pathname = `/faculty/lab-sessions/${id}`;
  const queryClient = useQueryClient();
  // Which attempt is open in the drill-down sheet, and which of its experiments is showing.
  const [openAttempt, setOpenAttempt] = useState<{ id: string; name: string } | null>(null);
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | null>(null);

  const sessionQuery = useQuery({
    queryKey: ["faculty-lab-session", id],
    queryFn: () => labSessionApi.get(id, pathname),
    enabled: Boolean(id),
  });
  const attemptsQuery = useQuery({
    queryKey: ["faculty-lab-session-attempts", id],
    queryFn: () => labSessionApi.listAttempts(id, pathname),
    enabled: Boolean(id),
    refetchInterval: 15000,
  });

  const attemptQuery = useQuery({
    queryKey: ["faculty-lab-session-attempt", id, openAttempt?.id],
    queryFn: () => labSessionApi.getAttemptDetail(id, openAttempt!.id, pathname),
    enabled: Boolean(openAttempt),
  });

  const session = sessionQuery.data?.session;
  const attempts = attemptsQuery.data?.items ?? [];
  const attemptExperiments = attemptQuery.data?.attempt.experiments ?? [];
  // Default to the first experiment so opening a row shows something immediately.
  const selectedExperiment =
    attemptExperiments.find((experiment) => experiment.experimentId === selectedExperimentId) ??
    attemptExperiments[0] ??
    null;

  const publishMutation = useMutation({
    mutationFn: (published: boolean) => labSessionApi.publishResults(id, published, pathname),
    onSuccess: () => {
      toast.success("Updated");
      void queryClient.invalidateQueries({ queryKey: ["faculty-lab-session", id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppLayout>
      <div className="container space-y-6 px-3 py-5 sm:px-6 sm:py-8">
        <Link to="/faculty/labs" className="text-sm text-muted-foreground hover:underline">
          ← Back to Labs
        </Link>
        {session && (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl font-bold">{session.title}</h1>
              <p className="mt-1 text-muted-foreground">
                {new Date(session.startAt).toLocaleString()} · {session.durationMinutes} min ·{" "}
                {session.assignedStudents.length} assigned
              </p>
            </div>
            <Button
              type="button"
              variant={session.resultsPublished ? "outline" : "default"}
              disabled={publishMutation.isPending}
              onClick={() => publishMutation.mutate(!session.resultsPublished)}
            >
              {session.resultsPublished ? "Unpublish results" : "Publish results"}
            </Button>
          </div>
        )}

        <Card className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="px-3 py-2">Student</th>
                <th className="px-3 py-2">Roll</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Flags</th>
              </tr>
            </thead>
            <tbody>
              {attempts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    No attempts yet.
                  </td>
                </tr>
              ) : (
                attempts.map((attempt) => (
                  <tr
                    key={attempt.attemptId}
                    className="cursor-pointer border-t border-border hover:bg-muted/40"
                    onClick={() => setOpenAttempt({ id: attempt.attemptId, name: attempt.name ?? attempt.email })}
                  >
                    <td className="px-3 py-2 underline-offset-2 hover:underline">{attempt.name ?? attempt.email}</td>
                    <td className="px-3 py-2">{attempt.rollNumber ?? "—"}</td>
                    <td className="px-3 py-2">{attempt.status}</td>
                    <td className="px-3 py-2">
                      {attempt.finalScore === null ? "—" : `${attempt.finalScore} / ${attempt.totalPoints}`}
                    </td>
                    <td className="px-3 py-2">
                      {attempt.suspectedMalpractice ? (
                        <Badge variant="destructive" className="rounded-none">
                          {attempt.violationCount} violation{attempt.violationCount === 1 ? "" : "s"}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <SubmittedAnswerSheet
        open={Boolean(openAttempt)}
        onOpenChange={(open) => {
          if (!open) {
            setOpenAttempt(null);
            setSelectedExperimentId(null);
          }
        }}
        title={selectedExperiment?.title ?? "Submitted answers"}
        subtitle={openAttempt?.name}
        loading={attemptQuery.isLoading}
        facts={
          selectedExperiment
            ? [
                {
                  label: "Marks",
                  value: `${selectedExperiment.awardedPoints}/${selectedExperiment.maxPoints}`,
                  tone:
                    selectedExperiment.awardedPoints === selectedExperiment.maxPoints
                      ? ("ok" as const)
                      : ("warn" as const),
                },
                ...(selectedExperiment.kind === "coding"
                  ? [
                      {
                        label: "Tests",
                        value: `${selectedExperiment.passedCount}/${selectedExperiment.totalCount}`,
                      },
                    ]
                  : []),
              ]
            : []
        }
        body={
          selectedExperiment
            ? selectedExperiment.kind === "sql"
              ? selectedExperiment.submittedSql
                ? { language: "sql", code: selectedExperiment.submittedSql }
                : null
              : selectedExperiment.code
                ? { language: selectedExperiment.language ?? "cpp", code: selectedExperiment.code }
                : null
            : null
        }
        emptyMessage="Nothing was submitted for this experiment."
        tabs={(attemptQuery.data?.attempt.experiments ?? []).map((experiment) => ({
          id: experiment.experimentId,
          label: `${experiment.number}. ${experiment.title}`,
        }))}
        activeTabId={selectedExperiment?.experimentId ?? null}
        onSelectTab={setSelectedExperimentId}
      />
    </AppLayout>
  );
}
