import type { ContestAttempt, StudentContestQuestionSummary } from "@/api/types";

/**
 * Three mutually exclusive states. "Attempted" is authoritative and comes from the server;
 * "Visited" vs "Not Visited" only distinguishes the two flavours of not-attempted, so the union
 * of the latter two is what a student thinks of as "not attempted".
 */
export type ContestQuestionProgress = "ATTEMPTED" | "VISITED" | "NOT_VISITED";

export interface ContestProgressSummary {
  total: number;
  attempted: number;
  visited: number;
  notVisited: number;
  /** 1-based question numbers the student has not answered, for the submit confirmation. */
  unattemptedNumbers: number[];
}

export function deriveQuestionProgress(
  questionId: string,
  attempt: ContestAttempt | null,
  visitedIds: string[],
): ContestQuestionProgress {
  const state = attempt?.questionStates.find((item) => item.questionId === questionId);
  if (state && (state.status === "ATTEMPTED" || state.status === "SOLVED")) {
    return "ATTEMPTED";
  }

  return visitedIds.includes(questionId) ? "VISITED" : "NOT_VISITED";
}

export function summariseContestProgress(
  questions: StudentContestQuestionSummary[],
  attempt: ContestAttempt | null,
  visitedIds: string[],
): ContestProgressSummary {
  const summary: ContestProgressSummary = {
    total: questions.length,
    attempted: 0,
    visited: 0,
    notVisited: 0,
    unattemptedNumbers: [],
  };

  questions.forEach((question, index) => {
    const progress = deriveQuestionProgress(question.id, attempt, visitedIds);
    if (progress === "ATTEMPTED") {
      summary.attempted += 1;
      return;
    }

    if (progress === "VISITED") {
      summary.visited += 1;
    } else {
      summary.notVisited += 1;
    }

    summary.unattemptedNumbers.push(question.questionNumber ?? index + 1);
  });

  return summary;
}

export function progressLabel(progress: ContestQuestionProgress): string {
  if (progress === "ATTEMPTED") return "Attempted";
  if (progress === "VISITED") return "Visited";
  return "Not Visited";
}

/** Status dot colour, using existing theme tokens only. */
export function progressDotClass(progress: ContestQuestionProgress): string {
  if (progress === "ATTEMPTED") return "bg-success";
  if (progress === "VISITED") return "bg-warning";
  return "bg-muted-foreground/40";
}
