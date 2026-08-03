import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

import { classTestApi } from "@/api/services";
import type { ExecutableLanguage, StudentClassTestQuestion } from "@/api/types";
import { ContestCodingBody } from "@/components/ContestCodingBody";
import { AppLayout } from "@/components/AppLayout";
import { ContestLockOverlay } from "@/components/ContestLockOverlay";
import { ContestScreenGuard } from "@/components/ContestScreenGuard";
import { ContestTimer } from "@/components/ContestTimer";
import { ContestWatermark } from "@/components/ContestWatermark";
import { DesktopOnlyNotice } from "@/components/DesktopOnlyNotice";
import { useAttemptProctoring } from "@/hooks/useAttemptProctoring";
import { useIsHandheld } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

/**
 * The paper runs full-screen; once it is over the student must be handed back a normal window.
 * Auto-submit (violation limit or the deadline sweeper) ends the attempt without any click of
 * ours, so this is also called from an effect watching the attempt status.
 */
async function leaveFullscreen(): Promise<void> {
  if (!document.fullscreenElement || !document.exitFullscreen) {
    return;
  }
  try {
    await document.exitFullscreen();
  } catch {
    // Nothing more to do — the browser is already leaving fullscreen or refuses to.
  }
}

export default function ClassTestAttempt() {
  const { id = "" } = useParams();
  const pathname = `/student/class-tests/${id}`;
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  const testQuery = useQuery({
    queryKey: ["my-class-test", id],
    queryFn: () => classTestApi.getMine(id, pathname),
    enabled: Boolean(id),
  });

  // Only meaningful once the paper is closed; the attempt page itself never shows it.
  const feedbackQuery = useQuery({
    queryKey: ["class-test-feedback-status", id],
    queryFn: () => classTestApi.getFeedbackStatus(id, pathname),
    enabled: Boolean(id),
  });

  const resultQuery = useQuery({
    queryKey: ["my-class-test-result", id],
    queryFn: () => classTestApi.getResult(id, pathname),
    enabled: Boolean(id) && (testQuery.data?.classTest.resultsPublished ?? false),
  });

  const startMutation = useMutation({
    mutationFn: () => classTestApi.startAttempt(id, pathname),
    onSuccess: (data) => {
      setConfirmed(true);
      // Must ride the same user gesture as the click; browsers refuse programmatic fullscreen
      // outside one. Failure is not fatal — the lock overlay picks it up on the next interaction.
      void document.documentElement.requestFullscreen?.().catch(() => undefined);
      setAnswers(
        Object.fromEntries(
          data.classTest.answers
            .filter((a) => a.submittedAnswer !== null)
            .map((a) => [a.questionId, a.submittedAnswer as string | string[]]),
        ),
      );
      queryClient.setQueryData(["my-class-test", id], data);
    },
    onError: (error: Error) => toast.error(error.message || "Could not start the test"),
  });

  const saveMutation = useMutation({
    mutationFn: (input: { questionId: string; answer: string | string[] }) =>
      classTestApi.saveAnswer(id, input.questionId, input.answer, pathname),
  });

  const submitMutation = useMutation({
    mutationFn: () => classTestApi.submitAttempt(id, pathname),
    onSuccess: async () => {
      await leaveFullscreen();
      toast.success("Test submitted");
      void queryClient.invalidateQueries({ queryKey: ["my-class-test", id] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not submit"),
  });

  const test = testQuery.data?.classTest;
  const active = test?.attemptStatus === "ACTIVE" && confirmed;
  const isHandheld = useIsHandheld();
  const watermarkPrimary = test?.identity.uid ?? test?.identity.rollNumber ?? "";

  // The same proctoring contests use: fullscreen enforcement, lock overlay, screen guard,
  // blocked copy/paste and PrintScreen wiping. The server already scored and auto-submitted on
  // every one of these event types — only this page was doing the bare minimum before.
  const recordProctorEvent = useCallback(
    async (payload: { type: string }) => {
      const result = await classTestApi.recordProctorEvent(id, payload.type, pathname);
      if (result.autoSubmitted) {
        void queryClient.invalidateQueries({ queryKey: ["my-class-test", id] });
      }
      return { violationCount: result.violationCount, autoSubmitted: result.autoSubmitted };
    },
    [id, pathname, queryClient],
  );

  const { isLocked, isObscured, violationCount, requestFullscreen } = useAttemptProctoring({
    isAttemptActive: active,
    enabled: !isHandheld,
    maxViolations: test?.maxViolations,
    violationCount: test?.violationCount ?? 0,
    recordEvent: recordProctorEvent,
    surfaceLabel: "class test",
  });

  // Covers every way an attempt can end that is not our own submit click: the violation
  // auto-submit, the shared deadline, or landing here on an already-finished attempt.
  const attemptStatus = test?.attemptStatus;
  useEffect(() => {
    if (attemptStatus && attemptStatus !== "ACTIVE" && attemptStatus !== "NOT_STARTED") {
      void leaveFullscreen();
    }
  }, [attemptStatus]);

  const setAnswer = (questionId: string, answer: string | string[]) => {
    setAnswers((current) => ({ ...current, [questionId]: answer }));
    saveMutation.mutate({ questionId, answer });
  };

  if (isHandheld) {
    return (
      <DesktopOnlyNotice
        feature="class tests"
        backTo="/student/class-tests"
        backLabel="Back to class tests"
      />
    );
  }

  if (testQuery.isLoading || !test) {
    return (
      <AppLayout>
        <div className="container py-8 text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  // Published result view.
  if (test.resultsPublished && resultQuery.data) {
    const result = resultQuery.data.result;
    return (
      <AppLayout>
        <div className="container max-w-3xl space-y-6 py-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-accent">{result.subject}</p>
            <h1 className="mt-1 font-display text-3xl font-bold">{result.title}</h1>
            <p className="mt-2 font-display text-2xl font-bold">
              {result.finalScore} <span className="text-muted-foreground">/ {result.totalPoints}</span>
            </p>
          </div>
          {result.questions.map((q, index) => (
            <Card key={q.questionId} className="profile-card space-y-2 p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold">Q{index + 1}. {q.statement}</p>
                <span className="whitespace-nowrap font-mono-code text-sm">
                  {q.awardedPoints} / {q.maxPoints}
                </span>
              </div>
              <div className="bg-muted/40 p-3 text-sm">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Your answer</span>
                <div className="mt-1 whitespace-pre-wrap">
                  {Array.isArray(q.submittedAnswer) ? q.submittedAnswer.join(", ") : q.submittedAnswer || "—"}
                </div>
              </div>
              {q.graderNote && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Note: </span>
                  {q.graderNote}
                </p>
              )}
            </Card>
          ))}
        </div>
      </AppLayout>
    );
  }

  const finished = test.attemptStatus === "SUBMITTED" || test.attemptStatus === "AUTO_SUBMITTED";
  if (finished) {
    return (
      <AppLayout>
        <div className="container max-w-2xl py-8">
          <Card className="p-8 text-center">
            <h1 className="font-display text-2xl font-bold">Test submitted</h1>
            <p className="mt-2 text-muted-foreground">
              Your answers are recorded. Marks appear once your faculty publishes the results.
            </p>

            {/* Asked now, while the experience is fresh — not held back until results land. */}
            {!feedbackQuery.data?.submitted && (
              <Button asChild className="mt-6 bg-accent text-accent-foreground hover:bg-accent/90">
                <Link to={`/student/class-tests/${id}/feedback`}>Share your feedback</Link>
              </Button>
            )}
            {feedbackQuery.data?.submitted && (
              <p className="mt-6 text-sm text-muted-foreground">Thanks for your feedback.</p>
            )}
          </Card>
        </div>
      </AppLayout>
    );
  }

  // Identity confirmation, shown before the paper opens.
  if (!confirmed) {
    return (
      <AppLayout>
        <div className="container max-w-xl py-8">
          <Card className="profile-card space-y-4 p-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-accent">{test.subject}</p>
              <h1 className="mt-1 font-display text-2xl font-bold">{test.title}</h1>
            </div>

            {test.instructions && (
              <p className="border-l-2 border-accent bg-accent/5 p-3 text-sm">{test.instructions}</p>
            )}

            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">Confirm these details before you begin:</p>
              {[
                ["Name", test.identity.name],
                ["UID", test.identity.uid],
                ["Roll number", test.identity.rollNumber],
                ["Division", test.identity.division],
                ["Department", test.identity.department],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-border py-1.5">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{value ?? "—"}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              {test.durationMinutes} minutes · {test.questionCount} questions · {test.totalPoints} marks.
              Leaving this tab may end your test and flag it.
            </p>

            <Button
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending || test.computedStatus !== "Live"}
            >
              {test.computedStatus !== "Live"
                ? "Not started yet"
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

  // The live paper runs as its own full-screen surface — no site chrome, the same shell a contest
  // uses. AppLayout is deliberately absent: a nav bar is an exit route out of a locked exam.
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {watermarkPrimary && <ContestWatermark primary={watermarkPrimary} secondary={test.identity.name ?? undefined} />}

      <header className="shrink-0 border-b border-border bg-card">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2">
          <div className="min-w-0">
            <h1 className="truncate font-display text-base font-bold">{test.title}</h1>
            <p className="text-xs text-muted-foreground">{test.subject}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Violations: {violationCount}/{test.maxViolations}
            </span>
            <ContestTimer
              deadline={test.deadlineAt}
              className="py-1"
              onExpire={() => submitMutation.mutate()}
            />
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="container max-w-3xl space-y-5 py-6">
          {test.questions.map((question, index) => (
            <QuestionCard
              key={question.id}
              index={index}
              question={question}
              value={answers[question.id]}
              onChange={(answer) => setAnswer(question.id, answer)}
              classTestId={id}
              pathname={pathname}
              attemptIsActive={active}
            />
          ))}

          <Button
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
          >
            {submitMutation.isPending ? "Submitting…" : "Submit test"}
          </Button>
        </div>
      </main>
    </div>
  );
}

function QuestionCard({
  index,
  question,
  value,
  onChange,
  classTestId,
  pathname,
  attemptIsActive,
}: {
  index: number;
  question: StudentClassTestQuestion;
  value: string | string[] | undefined;
  onChange: (answer: string | string[]) => void;
  classTestId: string;
  pathname: string;
  attemptIsActive: boolean;
}) {
  return (
    <Card className="profile-card space-y-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold">
          Q{index + 1}. {question.problemTitle ?? question.statement}
        </p>
        <span className="whitespace-nowrap text-xs text-muted-foreground">{question.points} marks</span>
      </div>
      {question.problemTitle && <p className="text-sm text-muted-foreground">{question.statement}</p>}

      {question.type === "MCQ" && (
        <div className="space-y-2">
          {question.options?.map((option) => (
            <label key={option} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name={question.id}
                checked={value === option}
                onChange={() => onChange(option)}
              />
              {option}
            </label>
          ))}
        </div>
      )}

      {question.type === "MSQ" && (
        <div className="space-y-2">
          {question.options?.map((option) => {
            const selected = Array.isArray(value) ? value : [];
            return (
              <label key={option} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={selected.includes(option)}
                  onCheckedChange={(checked) =>
                    onChange(checked ? [...selected, option] : selected.filter((o) => o !== option))
                  }
                />
                {option}
              </label>
            );
          })}
        </div>
      )}

      {question.type === "ShortAnswer" && (
        <div>
          <Textarea
            rows={4}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
            placeholder={`Answer in about ${question.expectedSentences ?? 4} sentences.`}
          />
          <p className="mt-1 text-xs text-muted-foreground">Your faculty marks this answer by hand.</p>
        </div>
      )}

      {question.type === "Coding" && (
        // The same workspace contests use — editor, console, run and submit — pointed at the
        // class-test endpoints. The server also enforces the allowed languages, so the
        // restriction holds even if this UI is bypassed.
        <div className="h-[70vh] border border-border">
          <ContestCodingBody
            key={question.id}
            contestId={classTestId}
            questionId={question.id}
            pathname={pathname}
            attemptIsActive={attemptIsActive}
            onAfterSubmit={() => undefined}
            question={{
              id: question.id,
              title: question.problemTitle ?? question.statement,
              problemStatement: question.statement,
              constraints: question.constraints,
              inputFormat: question.inputFormat,
              outputFormat: question.outputFormat,
              sampleTestCases: question.sampleTestCases ?? [],
              supportedLanguages: question.supportedLanguages as ExecutableLanguage[] | undefined,
            }}
            codingApi={{
              run: (input) => classTestApi.runCodingQuestion(classTestId, input, pathname),
              submit: (input) => classTestApi.submitCodingQuestion(classTestId, input, pathname),
              saveDraft: (input) => classTestApi.saveCodingDraft(classTestId, input, pathname),
            }}
          />
        </div>
      )}
    </Card>
  );
}
