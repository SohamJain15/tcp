import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Code2 } from "lucide-react";
import { toast } from "sonner";

import { classTestApi } from "@/api/services";
import type { ClassTestCodingPayload, ExecutableLanguage, StudentClassTestQuestion } from "@/api/types";
import type { CodingWorkspaceInput } from "@/components/workspace/types";
import { ContestCodingBody } from "@/components/ContestCodingBody";
import { CrosswordGrid } from "@/components/CrosswordGrid";
import { AppLayout } from "@/components/AppLayout";
import { ContestLockOverlay } from "@/components/ContestLockOverlay";
import { ContestScreenGuard } from "@/components/ContestScreenGuard";
import { ContestTimer } from "@/components/ContestTimer";
import { ContestWatermark } from "@/components/ContestWatermark";
import { ExpandedWorkspaceOverlay } from "@/components/ExpandedWorkspaceOverlay";
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
/** Renders a crossword's serialized answer (`{"1-across":"CAT"}`) as a readable "1 across: CAT" list. */
/**
 * Narrow the shared coding-workspace input for class tests.
 *
 * `CodingWorkspaceInput` is shared with contests, which now carry SQL questions, so its language is
 * the wider `SubmissionLanguage`. Class tests have no SQL question type — their language picker
 * never offers it — so "sql" arriving here means the workspace was wired to the wrong question
 * kind, and failing loudly beats posting a language the class-test API cannot judge.
 */
function toClassTestPayload(input: CodingWorkspaceInput): ClassTestCodingPayload {
  if (input.language === "sql") {
    throw new Error("Class tests do not support SQL questions.");
  }
  return { ...input, language: input.language };
}

function formatCrosswordAnswer(value: string | string[] | null): string {
  if (typeof value !== "string" || value.trim() === "") {
    return "—";
  }
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const parts = Object.entries(parsed)
      .filter(([, word]) => typeof word === "string" && word.trim() !== "")
      .map(([key, word]) => `${key.replace("-", " ")}: ${String(word).toUpperCase()}`);
    return parts.length > 0 ? parts.join(", ") : "—";
  } catch {
    return "—";
  }
}

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
  // Which coding question is open in the full-viewport workspace, if any. The workspace renders
  // exactly once — in the overlay — because two mounts would race each other's sessionStorage
  // drafts in useContestCodeDrafts.
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const isHandheld = useIsHandheld();

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
      // Fullscreen only where it is enforced — on a phone iOS has none, so skip it rather than
      // throw. Must ride the same user gesture as the click; browsers refuse it otherwise.
      setAnswers(
        Object.fromEntries(
          data.classTest.answers
            .filter((a) => a.submittedAnswer !== null)
            .map((a) => [a.questionId, a.submittedAnswer as string | string[]]),
        ),
      );
      queryClient.setQueryData(["my-class-test", id], data);
    },
    onError: async (error: Error) => {
      await leaveFullscreen();
      toast.error(error.message || "Could not start the test");
    },
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
    maxViolations: test?.maxViolations,
    violationCount: test?.violationCount ?? 0,
    recordEvent: recordProctorEvent,
    surfaceLabel: "class test",
    // Handhelds get the same enforcement, best-effort: Android Chrome grants fullscreen and is
    // policed exactly like a desktop, while a browser that has no fullscreen for web pages (iOS
    // Safari) degrades instead of locking an honest student out of a paper they cannot re-enter.
    // Leaving the app is caught either way by visibilitychange/pagehide and still auto-submits.
    fullscreenMode: isHandheld ? "best-effort" : "required",
    // Still off on touch: the soft keyboard fires blur, so scoring it would auto-submit a student
    // the moment they start typing.
    scoreBlur: !isHandheld,
  });

  // Covers every way an attempt can end that is not our own submit click: the violation
  // auto-submit, the shared deadline, or landing here on an already-finished attempt.
  const expandedCodingQuestion =
    test?.questions.find((question) => question.id === expandedQuestionId && question.type === "Coding") ?? null;

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

  const handleStart = () => {
    // The Fullscreen API only accepts a request made during this tap; an async mutation success
    // callback is too late on Chromium-based mobile browsers.
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {
        if (!isHandheld) toast.warning("Fullscreen was not granted. Tap the paper to try again before continuing.");
      });
    }
    startMutation.mutate();
  };

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
                  {q.type === "Crossword"
                    ? formatCrosswordAnswer(q.submittedAnswer)
                    : Array.isArray(q.submittedAnswer)
                      ? q.submittedAnswer.join(", ")
                      : q.submittedAnswer || "—"}
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

            <div className="space-y-1 border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
              <p className="font-semibold">Proctoring notice</p>
              <p>Leaving this tab or switching apps is recorded and can submit your test automatically.</p>
              {isHandheld && (
                <p className="text-muted-foreground">
                  Mobile-safe mode is active. Fullscreen is requested on Start where your browser supports it; keep this page open.
                </p>
              )}
            </div>

            <Button
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={handleStart}
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
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
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
        {isHandheld && (
          <div className="border-t border-warning/30 bg-warning/10 px-4 py-2 text-xs text-foreground">
            Proctoring is active on mobile: switching apps, leaving this tab or exiting fullscreen is a
            violation. Keep this page open until submission.
          </div>
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="container max-w-3xl space-y-5 px-3 py-4 sm:px-6 sm:py-6">
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
              onOpenWorkspace={() => setExpandedQuestionId(question.id)}
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

      {/* Rendered inside this tree, not a portal: proctoring listeners, the watermark and the
          answer state above all stay exactly as they are while a question is expanded. */}
      <ExpandedWorkspaceOverlay
        open={Boolean(expandedCodingQuestion)}
        onClose={() => setExpandedQuestionId(null)}
        title={
          expandedCodingQuestion
            ? `Q${test.questions.findIndex((question) => question.id === expandedCodingQuestion.id) + 1}. ${
                expandedCodingQuestion.problemTitle ?? expandedCodingQuestion.statement
              }`
            : ""
        }
        headerRight={
          <>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Violations: {violationCount}/{test.maxViolations}
            </span>
            <ContestTimer deadline={test.deadlineAt} className="py-1" onExpire={() => submitMutation.mutate()} />
          </>
        }
      >
        {expandedCodingQuestion && (
          <ContestCodingBody
            key={expandedCodingQuestion.id}
            contestId={id}
            questionId={expandedCodingQuestion.id}
            pathname={pathname}
            attemptIsActive={active}
            lockClipboard={active}
            clipboardSurfaceLabel="class test"
            onAfterSubmit={() => undefined}
            autoSaveId="class-test-coding"
            stackedWorkHeight="100%"
            question={{
              id: expandedCodingQuestion.id,
              title: expandedCodingQuestion.problemTitle ?? expandedCodingQuestion.statement,
              problemStatement: expandedCodingQuestion.statement,
              constraints: expandedCodingQuestion.constraints,
              inputFormat: expandedCodingQuestion.inputFormat,
              outputFormat: expandedCodingQuestion.outputFormat,
              sampleTestCases: expandedCodingQuestion.sampleTestCases ?? [],
              supportedLanguages: expandedCodingQuestion.supportedLanguages as ExecutableLanguage[] | undefined,
            }}
            codingApi={{
              run: (input) => classTestApi.runCodingQuestion(id, toClassTestPayload(input), pathname),
              submit: (input) => classTestApi.submitCodingQuestion(id, toClassTestPayload(input), pathname),
              saveDraft: (input) => classTestApi.saveCodingDraft(id, toClassTestPayload(input), pathname),
            }}
          />
        )}
      </ExpandedWorkspaceOverlay>
    </div>
  );
}

function QuestionCard({
  index,
  question,
  value,
  onChange,
  attemptIsActive,
  onOpenWorkspace,
}: {
  index: number;
  question: StudentClassTestQuestion;
  value: string | string[] | undefined;
  onChange: (answer: string | string[]) => void;
  classTestId: string;
  pathname: string;
  attemptIsActive: boolean;
  /** Opens this question's full-viewport workspace; the paper only shows a summary. */
  onOpenWorkspace: () => void;
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

      {question.type === "Crossword" && question.crossword && (
        <CrosswordGrid
          crossword={question.crossword}
          value={typeof value === "string" ? value : undefined}
          onChange={(serialized) => onChange(serialized)}
        />
      )}

      {question.type === "Coding" && (
        // The paper is a max-w-3xl column; a full IDE inside it leaves ~360px per pane. The
        // workspace opens full-viewport instead, without leaving the page or the attempt.
        <div className="rounded border border-border p-4">
          <p className="text-sm text-muted-foreground">
            This is a coding question. It opens in a full-screen workspace with the statement, editor and
            console — you can close it and come back at any time without losing your code.
          </p>
          <Button className="mt-3" variant="secondary" onClick={onOpenWorkspace} disabled={!attemptIsActive}>
            <Code2 className="mr-2 h-4 w-4" /> Open workspace
          </Button>
        </div>
      )}
    </Card>
  );
}
