import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "sonner";

import { classTestApi } from "@/api/services";
import type { ExecutableLanguage, StudentClassTestQuestion } from "@/api/types";
import { ContestCodingBody } from "@/components/ContestCodingBody";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

/** Counts down to the shared deadline every student in the class shares. */
function useCountdown(deadlineAt: string | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!deadlineAt) return "";
  const remaining = Math.max(0, new Date(deadlineAt).getTime() - now);
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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

  const resultQuery = useQuery({
    queryKey: ["my-class-test-result", id],
    queryFn: () => classTestApi.getResult(id, pathname),
    enabled: Boolean(id) && (testQuery.data?.classTest.resultsPublished ?? false),
  });

  const startMutation = useMutation({
    mutationFn: () => classTestApi.startAttempt(id, pathname),
    onSuccess: (data) => {
      setConfirmed(true);
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
    onSuccess: () => {
      toast.success("Test submitted");
      void queryClient.invalidateQueries({ queryKey: ["my-class-test", id] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not submit"),
  });

  const test = testQuery.data?.classTest;
  const active = test?.attemptStatus === "ACTIVE" && confirmed;
  const countdown = useCountdown(active ? test?.deadlineAt ?? null : null);

  // Proctoring: leaving the tab or the window is reported, and the server decides whether that
  // ends the attempt. Registered only while the paper is actually open.
  const reportedRef = useRef(false);
  useEffect(() => {
    if (!active) return;

    const report = (type: string) => {
      if (reportedRef.current) return;
      reportedRef.current = true;
      classTestApi
        .recordProctorEvent(id, type, pathname)
        .then((result) => {
          if (result.autoSubmitted) {
            toast.error("Test auto-submitted — leaving the test window is not allowed");
            void queryClient.invalidateQueries({ queryKey: ["my-class-test", id] });
          }
          reportedRef.current = false;
        })
        .catch(() => {
          reportedRef.current = false;
        });
    };

    const onVisibility = () => {
      if (document.hidden) report("VISIBILITY_LOSS");
    };
    const onBlur = () => report("TAB_SWITCH");

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [active, id, pathname, queryClient]);

  const setAnswer = (questionId: string, answer: string | string[]) => {
    setAnswers((current) => ({ ...current, [questionId]: answer }));
    saveMutation.mutate({ questionId, answer });
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

  return (
    <AppLayout>
      <div className="container max-w-3xl space-y-5 py-8">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background py-3">
          <div>
            <h1 className="font-display text-xl font-bold">{test.title}</h1>
            <p className="text-xs text-muted-foreground">{test.subject}</p>
          </div>
          <Badge className="rounded-none font-mono-code text-base">{countdown}</Badge>
        </div>

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
    </AppLayout>
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
