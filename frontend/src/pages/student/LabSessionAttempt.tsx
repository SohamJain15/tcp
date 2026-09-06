import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Code2 } from "lucide-react";
import { toast } from "sonner";

import { labSessionApi } from "@/api/services";
import type { ExecutableLanguage } from "@/api/types";
import { AppLayout } from "@/components/AppLayout";
import { ContestCodingBody } from "@/components/ContestCodingBody";
import { ContestLockOverlay } from "@/components/ContestLockOverlay";
import { ContestScreenGuard } from "@/components/ContestScreenGuard";
import { ContestTimer } from "@/components/ContestTimer";
import { ContestWatermark } from "@/components/ContestWatermark";
import { ExpandedWorkspaceOverlay } from "@/components/ExpandedWorkspaceOverlay";
import { SqlExperimentBody } from "@/components/workspace/SqlExperimentBody";
import { useAttemptProctoring } from "@/hooks/useAttemptProctoring";
import { useIsHandheld } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

async function leaveFullscreen(): Promise<void> {
  if (!document.fullscreenElement || !document.exitFullscreen) {
    return;
  }
  try {
    await document.exitFullscreen();
  } catch {
    // already leaving or refused
  }
}

export default function LabSessionAttempt() {
  const { id = "" } = useParams();
  const pathname = `/student/lab-sessions/${id}`;
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  // Which experiment is open in the full-viewport workspace. It renders exactly once — in the
  // overlay — because two mounts would race each other's sessionStorage drafts.
  const [expandedExperimentId, setExpandedExperimentId] = useState<string | null>(null);
  const isHandheld = useIsHandheld();

  const sessionQuery = useQuery({
    queryKey: ["my-lab-session", id],
    queryFn: () => labSessionApi.getMine(id, pathname),
    enabled: Boolean(id),
  });
  const session = sessionQuery.data?.session;

  const resultQuery = useQuery({
    queryKey: ["my-lab-session-result", id],
    queryFn: () => labSessionApi.getResult(id, pathname),
    enabled: Boolean(id) && (session?.resultsPublished ?? false),
  });

  const startMutation = useMutation({
    mutationFn: () => labSessionApi.startAttempt(id, pathname),
    onSuccess: (data) => {
      setConfirmed(true);
      queryClient.setQueryData(["my-lab-session", id], data);
    },
    onError: async (error: Error) => {
      await leaveFullscreen();
      toast.error(error.message || "Could not start the session");
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => labSessionApi.submitAttempt(id, pathname),
    onSuccess: async () => {
      await leaveFullscreen();
      toast.success("Session submitted");
      void queryClient.invalidateQueries({ queryKey: ["my-lab-session", id] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not submit"),
  });

  const active = session?.attemptStatus === "ACTIVE" && confirmed;

  const recordProctorEvent = useCallback(
    async (payload: { type: string }) => {
      const result = await labSessionApi.recordProctorEvent(id, payload.type, pathname);
      if (result.autoSubmitted) {
        void queryClient.invalidateQueries({ queryKey: ["my-lab-session", id] });
      }
      return { violationCount: result.violationCount, autoSubmitted: result.autoSubmitted };
    },
    [id, pathname, queryClient],
  );

  const { isLocked, isObscured, violationCount, requestFullscreen } = useAttemptProctoring({
    isAttemptActive: active,
    maxViolations: session?.maxViolations,
    violationCount: session?.violationCount ?? 0,
    recordEvent: recordProctorEvent,
    surfaceLabel: "lab session",
    // Same best-effort handheld handling as a class test: enforced wherever the browser grants
    // fullscreen, degraded rather than locking out where it does not.
    fullscreenMode: isHandheld ? "best-effort" : "required",
    scoreBlur: !isHandheld,
  });

  const attemptStatus = session?.attemptStatus;
  useEffect(() => {
    if (attemptStatus && attemptStatus !== "ACTIVE" && attemptStatus !== "NOT_STARTED") {
      void leaveFullscreen();
    }
  }, [attemptStatus]);

  const handleStart = () => {
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {
        if (!isHandheld) toast.warning("Fullscreen was not granted. Tap the page to try again.");
      });
    }
    startMutation.mutate();
  };

  if (sessionQuery.isLoading || !session) {
    return (
      <AppLayout>
        <div className="container py-8 text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  // Published result view.
  if (session.resultsPublished && resultQuery.data) {
    const result = resultQuery.data.result;
    return (
      <AppLayout>
        <div className="container max-w-2xl space-y-4 py-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-accent">{session.subject}</p>
            <h1 className="mt-1 font-display text-3xl font-bold">{result.title}</h1>
            <p className="mt-2 font-display text-2xl font-bold">
              {result.finalScore} <span className="text-muted-foreground">/ {result.totalPoints}</span>
            </p>
          </div>
          {result.experiments.map((experiment, index) => (
            <Card key={experiment.experimentId} className="profile-card flex items-center justify-between p-4">
              <span className="text-sm font-medium">
                Experiment {index + 1}. {experiment.title} <span className="text-muted-foreground">({experiment.kind})</span>
              </span>
              <span className="font-mono-code text-sm">
                {experiment.awardedPoints} / {experiment.maxPoints}
              </span>
            </Card>
          ))}
        </div>
      </AppLayout>
    );
  }

  const finished = session.attemptStatus === "SUBMITTED" || session.attemptStatus === "AUTO_SUBMITTED";
  if (finished) {
    return (
      <AppLayout>
        <div className="container max-w-2xl py-8">
          <Card className="p-8 text-center">
            <h1 className="font-display text-2xl font-bold">Session submitted</h1>
            <p className="mt-2 text-muted-foreground">
              Your work is recorded. Marks appear once your faculty publishes the results.
            </p>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (!confirmed) {
    return (
      <AppLayout>
        <div className="container max-w-xl py-8">
          <Card className="profile-card space-y-4 p-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-accent">{session.subject}</p>
              <h1 className="mt-1 font-display text-2xl font-bold">{session.title}</h1>
            </div>
            <p className="text-xs text-muted-foreground">
              {session.durationMinutes} minutes · {session.experimentCount} experiments · {session.totalPoints} marks.
              Leaving this tab may end your session and flag it.
            </p>
            <div className="space-y-1 border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
              <p className="font-semibold">Proctoring notice</p>
              <p>Leaving this tab or switching apps is recorded and can submit your session automatically.</p>
            </div>
            <Button
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={handleStart}
              disabled={startMutation.isPending || session.computedStatus !== "Live"}
            >
              {session.computedStatus !== "Live"
                ? "Not live yet"
                : startMutation.isPending
                  ? "Opening…"
                  : "Confirm and start"}
            </Button>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (isObscured) {
    return <ContestScreenGuard />;
  }
  if (isLocked) {
    return <ContestLockOverlay onReturnToFullscreen={requestFullscreen} violationCount={violationCount} />;
  }

  const answerFor = (experimentId: string) =>
    session.answers.find((answer) => answer.experimentId === experimentId);

  const expandedExperiment =
    session.experiments.find((experiment) => experiment.id === expandedExperimentId) ?? null;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      <ContestWatermark primary={session.title} />
      <header className="shrink-0 border-b border-border bg-card">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2">
          <div className="min-w-0">
            <h1 className="truncate font-display text-base font-bold">{session.title}</h1>
            <p className="text-xs text-muted-foreground">{session.subject}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Violations: {violationCount}/{session.maxViolations}
            </span>
            {session.deadlineAt && (
              <ContestTimer deadline={session.deadlineAt} className="py-1" onExpire={() => submitMutation.mutate()} />
            )}
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="container max-w-3xl space-y-5 px-3 py-4 sm:px-6 sm:py-6">
          {session.experiments.map((experiment, index) => (
            <Card key={experiment.id} className="profile-card space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold">
                  Experiment {index + 1}. {experiment.title}
                </p>
                <span className="whitespace-nowrap text-xs text-muted-foreground">{experiment.points} marks</span>
              </div>
              <p className="text-sm text-muted-foreground">{experiment.aim}</p>

              {/* A 3xl column cannot hold a split workspace; it opens full-viewport instead,
                  without leaving the page, the attempt or the proctoring listeners. */}
              <div>
                <Button
                  variant="secondary"
                  disabled={!active}
                  onClick={() => setExpandedExperimentId(experiment.id)}
                >
                  <Code2 className="mr-2 h-4 w-4" />
                  {answerFor(experiment.id)?.submittedSql || answerFor(experiment.id)?.draftCode
                    ? "Reopen workspace"
                    : "Open workspace"}
                </Button>
              </div>
            </Card>
          ))}

          <Button
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
          >
            {submitMutation.isPending ? "Submitting…" : "Submit session"}
          </Button>
        </div>
      </main>

      <ExpandedWorkspaceOverlay
        open={Boolean(expandedExperiment)}
        onClose={() => setExpandedExperimentId(null)}
        title={
          expandedExperiment
            ? `Experiment ${
                session.experiments.findIndex((item) => item.id === expandedExperiment.id) + 1
              }. ${expandedExperiment.title}`
            : ""
        }
        headerRight={
          <>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Violations: {violationCount}/{session.maxViolations}
            </span>
            {session.deadlineAt && (
              <ContestTimer deadline={session.deadlineAt} className="py-1" onExpire={() => submitMutation.mutate()} />
            )}
          </>
        }
      >
        {expandedExperiment &&
          (expandedExperiment.kind === "sql" ? (
            <SqlExperimentBody
              key={expandedExperiment.id}
              labId={id}
              experimentId={expandedExperiment.id}
              title={expandedExperiment.title}
              aim={expandedExperiment.aim}
              points={expandedExperiment.points}
              schemaSql={expandedExperiment.schemaSql}
              pathname={pathname}
              initialSql={answerFor(expandedExperiment.id)?.submittedSql ?? undefined}
              runner={{
                run: (sql) => labSessionApi.runSql(id, expandedExperiment.id, sql, pathname),
                submit: (sql) => labSessionApi.saveSql(id, expandedExperiment.id, sql, pathname),
                submitLabel: "Save answer",
              }}
              lockClipboard={active}
              clipboardSurfaceLabel="lab session"
              readOnly={!active}
              autoSaveId="lab-session-sql"
              stackedWorkHeight="100%"
            />
          ) : (
            <ContestCodingBody
              key={expandedExperiment.id}
              contestId={id}
              questionId={expandedExperiment.id}
              pathname={pathname}
              attemptIsActive={active}
              lockClipboard={active}
              clipboardSurfaceLabel="lab session"
              onAfterSubmit={() => undefined}
              autoSaveId="lab-session-coding"
              stackedWorkHeight="100%"
              question={{
                id: expandedExperiment.id,
                title: expandedExperiment.title,
                problemStatement: expandedExperiment.aim,
                constraints: expandedExperiment.constraints,
                inputFormat: expandedExperiment.inputFormat,
                outputFormat: expandedExperiment.outputFormat,
                sampleTestCases: expandedExperiment.sampleTestCases ?? [],
                supportedLanguages: expandedExperiment.supportedLanguages as ExecutableLanguage[] | undefined,
              }}
              codingApi={{
                run: (input) =>
                  labSessionApi.runCoding(
                    id,
                    { experimentId: input.questionId, code: input.code, language: input.language },
                    pathname,
                  ),
                submit: (input) =>
                  labSessionApi.submitCoding(
                    id,
                    { experimentId: input.questionId, code: input.code, language: input.language },
                    pathname,
                  ),
                saveDraft: (input) =>
                  labSessionApi.saveCodingDraft(
                    id,
                    { experimentId: input.questionId, code: input.code, language: input.language },
                    pathname,
                  ),
              }}
            />
          ))}
      </ExpandedWorkspaceOverlay>
    </div>
  );
}
