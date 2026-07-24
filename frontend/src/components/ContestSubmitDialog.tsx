import { AlertTriangle, CheckCircle2 } from "lucide-react";

import type { ContestAttempt, StudentContestQuestionSummary } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { summariseContestProgress } from "@/lib/contest-question-status";
import { cn } from "@/lib/utils";

interface ContestSubmitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questions: StudentContestQuestionSummary[];
  attempt: ContestAttempt | null;
  visitedIds: string[];
  onConfirm: () => void;
  isSubmitting: boolean;
}

/**
 * Final confirmation before ending the attempt. Submitting is irreversible, so the student sees
 * exactly what they are leaving unanswered first.
 */
export function ContestSubmitDialog({
  open,
  onOpenChange,
  questions,
  attempt,
  visitedIds,
  onConfirm,
  isSubmitting,
}: ContestSubmitDialogProps) {
  const summary = summariseContestProgress(questions, attempt, visitedIds);
  const notAttempted = summary.visited + summary.notVisited;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Submit your test?</DialogTitle>
          <DialogDescription>
            Any code you have written but not submitted will be submitted and run against all test
            cases automatically. Once submitted you cannot return to the questions or change any
            answer.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2.5">
          <SummaryTile
            label="Attempted"
            value={summary.attempted}
            total={summary.total}
            tone="success"
          />
          <SummaryTile
            label="Not Attempted"
            value={notAttempted}
            total={summary.total}
            tone={notAttempted > 0 ? "warning" : "muted"}
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5 text-sm">
          <div className="border border-border bg-secondary/30 p-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Visited, unanswered
            </div>
            <div className="mt-1 font-bold">{summary.visited}</div>
          </div>
          <div className="border border-border bg-secondary/30 p-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Never opened
            </div>
            <div className="mt-1 font-bold">{summary.notVisited}</div>
          </div>
        </div>

        {summary.unattemptedNumbers.length > 0 ? (
          <div className="border border-warning/40 bg-warning/10 p-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Unanswered questions
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {summary.unattemptedNumbers.map((questionNumber) => (
                <span
                  key={questionNumber}
                  className="flex h-6 w-6 items-center justify-center border border-warning/50 text-xs font-bold"
                >
                  {questionNumber}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 border border-success/40 bg-success/10 p-3 text-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            You have attempted every question.
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Keep Working
          </Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Submitting..." : "Submit Test"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryTile({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "success" | "warning" | "muted";
}) {
  return (
    <div
      className={cn(
        "border p-3",
        tone === "success" && "border-success/40 bg-success/10",
        tone === "warning" && "border-warning/40 bg-warning/10",
        tone === "muted" && "border-border bg-secondary/30",
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-display text-2xl font-bold leading-none">
        {value}
        <span className="text-sm font-medium text-muted-foreground">/{total}</span>
      </div>
    </div>
  );
}
