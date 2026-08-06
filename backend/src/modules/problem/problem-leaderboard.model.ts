import type { Department, ExecutableLanguage } from "../../shared/types/domain";
import { toIsoString } from "../../shared/utils/date";
import { buildLanguagePercentileScorer } from "../../shared/utils/language-percentile";
import type { SubmissionAnalyticsRecord } from "../submission/submission.repository";

/**
 * Relative pull of runtime and memory in the per-problem optimization score.
 *
 * Mirrors the practice board so a student's "efficiency" means the same thing wherever they see
 * it. Runtime leads because it is the part a better algorithm actually moves.
 */
export const PROBLEM_OPTIMIZATION_WEIGHTS = { runtime: 0.6, memory: 0.4 } as const;

/**
 * One row of a problem's submission leaderboard.
 *
 * There is deliberately **no `code` field**. Students may compare how efficient each other's
 * solutions were, but not read them — a per-problem board carrying source would just be a
 * solutions page. The service enforces this at the query level too, by reading through
 * `listForAnalytics`, so adding a field here could not leak code by itself.
 */
export interface ProblemLeaderboardItem {
  rank: number;
  submissionId: string;
  userEmail: string;
  userName: string | null;
  userUid: string | null;
  userDepartment: Department | null;
  language: ExecutableLanguage;
  runtimeMs: number;
  memoryKb: number;
  /** Efficiency against others solving this problem in the same language, 0-1. */
  optimizationScore: number;
  submittedAt: string;
  isCurrentUser: boolean;
}

export interface ProblemLeaderboardPodium {
  /** The three strongest accepted solutions after language-normalized scoring. */
  overall: ProblemLeaderboardItem[];
  /** The highest-ranked accepted solution for every represented language. */
  byLanguage: ProblemLeaderboardItem[];
}

export interface ProblemLeaderboardUserSnapshot {
  name: string | null;
  uid: string | null;
}

/**
 * Picks each student's single best accepted submission for a problem.
 *
 * Selection uses raw runtime then memory rather than the optimization score, because the score
 * depends on the pool and the pool is exactly what is being chosen — ranking two of one
 * student's own submissions against each other would be circular. Within one student and one
 * problem, "fastest, then leanest" is the same judgement the score would make anyway.
 */
function selectBestPerUser(
  submissions: readonly SubmissionAnalyticsRecord[],
): SubmissionAnalyticsRecord[] {
  const bestByUser = new Map<string, SubmissionAnalyticsRecord>();

  for (const submission of submissions) {
    const incumbent = bestByUser.get(submission.userEmail);
    if (!incumbent) {
      bestByUser.set(submission.userEmail, submission);
      continue;
    }

    const isFaster =
      submission.runtimeMs < incumbent.runtimeMs ||
      (submission.runtimeMs === incumbent.runtimeMs && submission.memoryKb < incumbent.memoryKb);
    if (isFaster) {
      bestByUser.set(submission.userEmail, submission);
    }
  }

  return [...bestByUser.values()];
}

function resolveSubmittedAt(submission: SubmissionAnalyticsRecord): Date {
  return submission.judgedAt ?? submission.createdAt;
}

/**
 * Ranks a problem's accepted submissions, most optimized first.
 *
 *   optimization DESC → runtime ASC → memory ASC → solved earliest → email ASC
 *
 * Optimization is language-normalized, so the board is not simply every C++ solution followed by
 * every Python one. Solving earlier breaks a genuine tie, which rewards getting there first
 * without letting it outweigh writing better code.
 */
export function buildProblemLeaderboard(
  submissions: readonly SubmissionAnalyticsRecord[],
  options: {
    currentUserEmail: string;
    userSnapshots: Map<string, ProblemLeaderboardUserSnapshot>;
  },
): ProblemLeaderboardItem[] {
  const best = selectBestPerUser(submissions);

  const languageOf = (submission: SubmissionAnalyticsRecord): string => submission.language;
  const runtimeScorer = buildLanguagePercentileScorer(best, {
    languageOf,
    valueOf: (submission) => submission.runtimeMs,
  });
  const memoryScorer = buildLanguagePercentileScorer(best, {
    languageOf,
    valueOf: (submission) => submission.memoryKb,
  });

  const optimizationOf = (submission: SubmissionAnalyticsRecord): number =>
    runtimeScorer.scoreFor(submission) * PROBLEM_OPTIMIZATION_WEIGHTS.runtime +
    memoryScorer.scoreFor(submission) * PROBLEM_OPTIMIZATION_WEIGHTS.memory;

  const currentUserEmail = options.currentUserEmail.toLowerCase();

  return best
    .map((submission) => ({ submission, optimization: optimizationOf(submission) }))
    .sort((left, right) => {
      if (left.optimization !== right.optimization) {
        return right.optimization - left.optimization;
      }
      if (left.submission.runtimeMs !== right.submission.runtimeMs) {
        return left.submission.runtimeMs - right.submission.runtimeMs;
      }
      if (left.submission.memoryKb !== right.submission.memoryKb) {
        return left.submission.memoryKb - right.submission.memoryKb;
      }

      const leftAt = resolveSubmittedAt(left.submission).getTime();
      const rightAt = resolveSubmittedAt(right.submission).getTime();
      if (leftAt !== rightAt) {
        return leftAt - rightAt;
      }

      return left.submission.userEmail.localeCompare(right.submission.userEmail);
    })
    .map(({ submission, optimization }, index) => {
      const snapshot = options.userSnapshots.get(submission.userEmail);

      return {
        rank: index + 1,
        submissionId: submission.id,
        userEmail: submission.userEmail,
        userName: snapshot?.name ?? null,
        userUid: snapshot?.uid ?? null,
        userDepartment: submission.userDepartment,
        language: submission.language,
        runtimeMs: submission.runtimeMs,
        memoryKb: submission.memoryKb,
        optimizationScore: Number(optimization.toFixed(4)),
        submittedAt: toIsoString(resolveSubmittedAt(submission)) ?? new Date(0).toISOString(),
        isCurrentUser: submission.userEmail.toLowerCase() === currentUserEmail,
      };
    });
}

/** Builds leaderboard highlights from the complete field, before pagination trims table rows. */
export function buildProblemLeaderboardPodium(
  ranked: readonly ProblemLeaderboardItem[],
): ProblemLeaderboardPodium {
  const seenLanguages = new Set<ExecutableLanguage>();

  return {
    overall: ranked.slice(0, 3),
    byLanguage: ranked.filter((entry) => {
      if (seenLanguages.has(entry.language)) {
        return false;
      }
      seenLanguages.add(entry.language);
      return true;
    }),
  };
}
