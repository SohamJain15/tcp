import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
// Correctness is never shown during the contest — a saved answer is just saved, never marked right
// or wrong, and always editable until the whole test is submitted.

import { contestsApi } from "@/api/services";
import type { ContestAttempt, ObjectiveContestQuestionDetail } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

interface ContestObjectiveQuestionProps {
  contestId: string;
  pathname: string;
  question: ObjectiveContestQuestionDetail;
  attempt: ContestAttempt | null;
  attemptIsActive: boolean;
  onAttemptUpdate: (attempt: ContestAttempt) => void;
}

const MSQ_AUTOSAVE_DELAY_MS = 400;

function optionKey(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Reads the answer this student has already saved for the question, if any. */
function initialSelection(
  question: ObjectiveContestQuestionDetail,
  attempt: ContestAttempt | null,
): string[] {
  const submitted = attempt?.questionStates.find((state) => state.questionId === question.id)?.submittedAnswer;
  if (submitted == null) {
    return [];
  }

  return Array.isArray(submitted) ? [...submitted] : [submitted];
}

/**
 * Objective question with auto-save. There is no "Submit Answer" button — selecting an option saves
 * it immediately (MSQ toggles are debounced), so a choice is always server-persisted and always
 * reflected when the student navigates back to the question.
 */
export function ContestObjectiveQuestion({
  contestId,
  pathname,
  question,
  attempt,
  attemptIsActive,
  onAttemptUpdate,
}: ContestObjectiveQuestionProps) {
  const state = attempt?.questionStates.find((item) => item.questionId === question.id) ?? null;
  // Editable for the whole live attempt — never locked on "correct", because correctness is hidden.
  const disabled = !attemptIsActive;

  // Seeded from the server answer; the component is keyed by questionId in the parent, so this
  // initialises correctly each time the student opens a different question.
  const [selection, setSelection] = useState<string[]>(() => initialSelection(question, attempt));
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const msqTimerRef = useRef<number | null>(null);

  const answerMutation = useMutation({
    mutationFn: (answer: string | string[]) => contestsApi.answerQuestion(contestId, { questionId: question.id, answer }, pathname),
    onSuccess: (response) => {
      onAttemptUpdate(response.attempt);
      setSavedAt(Date.now());
    },
    onError: (error) => {
      toast.error((error as Error)?.message || "Failed to save your answer");
    },
  });

  const { mutate: saveAnswer } = answerMutation;

  useEffect(
    () => () => {
      if (msqTimerRef.current) {
        window.clearTimeout(msqTimerRef.current);
      }
    },
    [],
  );

  const submittedLabel = useMemo(() => {
    if (answerMutation.isPending) return "saving";
    if (savedAt || (state && state.submittedAnswer != null)) return "saved";
    return "none";
  }, [answerMutation.isPending, savedAt, state]);

  const handleMcqChange = (value: string) => {
    setSelection([value]);
    saveAnswer(value);
  };

  const handleMsqToggle = (key: string, checked: boolean) => {
    setSelection((current) => {
      const next = checked ? [...current, key] : current.filter((entry) => entry !== key);

      if (msqTimerRef.current) {
        window.clearTimeout(msqTimerRef.current);
      }
      // Debounced so ticking several boxes in a row is one save, not one request per click.
      msqTimerRef.current = window.setTimeout(() => saveAnswer(next), MSQ_AUTOSAVE_DELAY_MS);
      return next;
    });
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-y-auto p-6">
      <Card className="border border-border bg-background p-6 shadow-card sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Q{question.questionNumber}</Badge>
          <Badge variant="outline">{question.type}</Badge>
          <Badge variant="outline">{question.points} pts</Badge>
          {question.type === "MSQ" && (
            <Badge variant="outline" className="text-muted-foreground">Select all that apply</Badge>
          )}
          <SaveIndicator status={submittedLabel} className="ml-auto" />
        </div>

        <h1 className="mt-4 font-display text-2xl font-bold">{question.title}</h1>
        {question.statement && question.statement !== question.title && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{question.statement}</p>
        )}

        <div className="mt-6 space-y-3">
          {question.type === "MCQ" ? (
            <RadioGroup value={selection[0] ?? ""} onValueChange={handleMcqChange} disabled={disabled}>
              {question.options.map((option, index) => {
                const key = optionKey(index);
                const active = selection[0] === key;
                return (
                  <label
                    key={`${question.id}-${key}`}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 border border-border p-3.5 transition-colors",
                      active && "border-accent/60 bg-accent/10",
                      disabled && "cursor-not-allowed opacity-70",
                    )}
                  >
                    <RadioGroupItem value={key} id={`${question.id}-${key}`} />
                    <span className="text-sm">
                      <span className="font-semibold">{key}.</span> {option}
                    </span>
                  </label>
                );
              })}
            </RadioGroup>
          ) : (
            question.options.map((option, index) => {
              const key = optionKey(index);
              const active = selection.includes(key);
              return (
                <label
                  key={`${question.id}-${key}`}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 border border-border p-3.5 transition-colors",
                    active && "border-accent/60 bg-accent/10",
                    disabled && "cursor-not-allowed opacity-70",
                  )}
                >
                  <Checkbox
                    checked={active}
                    disabled={disabled}
                    onCheckedChange={(checked) => handleMsqToggle(key, checked === true)}
                  />
                  <span className="text-sm">
                    <span className="font-semibold">{key}.</span> {option}
                  </span>
                </label>
              );
            })
          )}
        </div>

        {attemptIsActive ? (
          <p className="mt-5 text-xs text-muted-foreground">
            Your answer is saved automatically and can be changed any time before you submit the test.
            Results are shown after faculty publishes them.
          </p>
        ) : (
          <p className="mt-5 text-sm text-muted-foreground">This attempt is no longer active.</p>
        )}
      </Card>
    </div>
  );
}

function SaveIndicator({ status, className }: { status: "saving" | "saved" | "none"; className?: string }) {
  if (status === "none") {
    return null;
  }

  return (
    <span className={cn("flex items-center gap-1.5 text-xs font-medium text-muted-foreground", className)}>
      {status === "saving" ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
        </>
      ) : (
        <>
          <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Saved
        </>
      )}
    </span>
  );
}
