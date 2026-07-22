import { Link } from "react-router-dom";
import { Code2, ListChecks, Send, ShieldAlert } from "lucide-react";

import type { ContestAttempt, StudentContestQuestionSummary } from "@/api/types";
import { Button } from "@/components/ui/button";
import { ContestTimer } from "@/components/ContestTimer";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  deriveQuestionProgress,
  progressDotClass,
  progressLabel,
  summariseContestProgress,
} from "@/lib/contest-question-status";
import { cn } from "@/lib/utils";

interface ContestQuestionNavProps {
  contestId: string;
  questions: StudentContestQuestionSummary[];
  attempt: ContestAttempt | null;
  visitedIds: string[];
  /** Question currently on screen, highlighted in the list. */
  activeQuestionId?: string;
  maxViolations: number;
  onSelectQuestion: (question: StudentContestQuestionSummary) => void;
  onSubmitTest: () => void;
  onTimeUp?: () => void;
  isSubmitting?: boolean;
}

/**
 * The contest's persistent left rail: every question with its progress, the running clock, the
 * violation counter, and Submit Test — identical on the contest page and inside the coding
 * workspace so the student never loses their place.
 */
export function ContestQuestionNav({
  contestId,
  questions,
  attempt,
  visitedIds,
  activeQuestionId,
  maxViolations,
  onSelectQuestion,
  onSubmitTest,
  onTimeUp,
  isSubmitting = false,
}: ContestQuestionNavProps) {
  const summary = summariseContestProgress(questions, attempt, visitedIds);

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-r border-border bg-card">
      <div className="border-b border-border p-4">
        <ContestTimer deadline={attempt?.deadlineAt} onExpire={onTimeUp} className="w-full justify-center" />

        <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
          <ProgressStat label="Done" value={summary.attempted} dotClass="bg-success" />
          <ProgressStat label="Seen" value={summary.visited} dotClass="bg-warning" />
          <ProgressStat label="New" value={summary.notVisited} dotClass="bg-muted-foreground/40" />
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <ListChecks className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-display text-xs font-bold uppercase tracking-widest">Questions</h2>
        <span className="text-xs text-muted-foreground">({questions.length})</span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <ul className="p-2">
          {questions.map((question, index) => {
            const progress = deriveQuestionProgress(question.id, attempt, visitedIds);
            const questionNumber = question.questionNumber ?? index + 1;
            const isActive = question.id === activeQuestionId;
            const target =
              question.type === "Coding"
                ? `/student/contests/${contestId}/questions/${question.id}`
                : `/student/contests/${contestId}#question-${question.id}`;

            return (
              <li key={question.id}>
                <Link
                  to={target}
                  onClick={() => onSelectQuestion(question)}
                  className={cn(
                    "flex items-center gap-2.5 border border-transparent px-2.5 py-2 transition-colors hover:bg-secondary/60",
                    isActive && "border-accent/50 bg-accent/10",
                  )}
                  title={`Q${questionNumber} — ${progressLabel(progress)}`}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center border text-xs font-bold",
                      isActive ? "border-accent text-accent" : "border-border text-muted-foreground",
                    )}
                  >
                    {questionNumber}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {question.type === "Coding" ? (
                        <Code2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                      ) : (
                        <ListChecks className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate text-xs font-medium">{question.title}</span>
                    </span>
                    <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground">
                      {question.type} · {question.points} pts
                    </span>
                  </span>

                  <span
                    className={cn("h-2.5 w-2.5 shrink-0 rounded-full", progressDotClass(progress))}
                    aria-label={progressLabel(progress)}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </ScrollArea>

      <div className="space-y-3 border-t border-border p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldAlert
            className={cn(
              "h-3.5 w-3.5",
              (attempt?.violationCount ?? 0) > 0 ? "text-destructive" : "text-muted-foreground",
            )}
          />
          Violations: {attempt?.violationCount ?? 0}/{maxViolations}
        </div>

        <Button
          className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          onClick={onSubmitTest}
          disabled={isSubmitting}
        >
          <Send className="mr-2 h-4 w-4" /> {isSubmitting ? "Submitting..." : "Submit Test"}
        </Button>
      </div>
    </aside>
  );
}

function ProgressStat({ label, value, dotClass }: { label: string; value: number; dotClass: string }) {
  return (
    <div className="border border-border bg-background px-1.5 py-1.5">
      <div className="flex items-center justify-center gap-1">
        <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
        <span className="text-sm font-bold leading-none">{value}</span>
      </div>
      <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
