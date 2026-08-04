import { toIsoString } from "../../shared/utils/date";
import { buildLanguagePercentileScorer } from "../../shared/utils/language-percentile";
import { deriveStudentYearFromSemester, type StudentYear } from "../../shared/utils/student-year";
import type { UserRole } from "../../shared/types/auth";
import type { Department, ExecutableLanguage } from "../../shared/types/domain";
import type { UserRecord } from "../user/user.model";

export interface LeaderboardEntry {
  email: string;
  role: UserRole;
  name: string | null;
  uid: string | null;
  department: Department | null;
  semester: number | null;
  year: StudentYear | null;
  rating: number;
  score: number;
  problemsSolved: number;
  submissionCount: number;
  acceptedSubmissionCount: number;
  accuracy: number;
  avgAcceptedRuntimeMs: number;
  avgAcceptedMemoryKb: number;
  /** Bucket for the efficiency percentiles; null until the student has an accepted submission. */
  primaryLanguage: ExecutableLanguage | null;
  createdAt: Date;
  updatedAt: Date;
  lastAcceptedAt: Date | null;
}

export interface LeaderboardListItem {
  rank: number;
  email: string;
  role: UserRole;
  name: string | null;
  uid: string | null;
  department: Department | null;
  semester: number | null;
  year: StudentYear | null;
  rating: number;
  score: number;
  problemsSolved: number;
  submissionCount: number;
  acceptedSubmissionCount: number;
  accuracy: number;
  /**
   * Runtime + memory efficiency of this student's accepted code, 0-1, measured against others
   * who write in the same language. Null when nobody in the field has measured code.
   */
  optimizationScore: number | null;
  /** Shown alongside the score so students can see which pool they were compared against. */
  primaryLanguage: ExecutableLanguage | null;
  avgAcceptedRuntimeMs: number;
  updatedAt: string;
  lastAcceptedAt: string | null;
}

export function buildLeaderboardEntryFromUser(user: UserRecord): LeaderboardEntry {
  return {
    email: user.email,
    role: user.role,
    name: user.name,
    uid: user.uid,
    department: user.department,
    semester: user.semester,
    year: deriveStudentYearFromSemester(user.semester),
    rating: user.rating,
    score: user.rating,
    problemsSolved: user.problemsSolved,
    submissionCount: user.submissionCount,
    acceptedSubmissionCount: user.acceptedSubmissionCount,
    accuracy: user.accuracy,
    avgAcceptedRuntimeMs: user.avgAcceptedRuntimeMs,
    avgAcceptedMemoryKb: user.avgAcceptedMemoryKb,
    primaryLanguage: user.primaryLanguage,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastAcceptedAt: user.lastAcceptedAt,
  };
}

export function isRankedLeaderboardEntry(entry: Pick<LeaderboardEntry, "role" | "department" | "name" | "uid"> & {
  isProfileComplete?: boolean;
}): boolean {
  return entry.role === "STUDENT" && entry.isProfileComplete !== false;
}

export interface LeaderboardRanker {
  compare: (left: LeaderboardEntry, right: LeaderboardEntry) => number;
  /** Null when nobody in the field has measured code, so the UI can hide the column. */
  optimizationScoreFor: (entry: LeaderboardEntry) => number | null;
}

/**
 * Relative pull of the two efficiency signals inside `optimizationScore`.
 *
 * Runtime leads because it is what a student can actually attack by choosing a better algorithm;
 * memory is more often a property of the language's runtime than of the solution. These mirror
 * the contest weights so a student's optimization score means the same thing on both boards.
 */
export const PRACTICE_OPTIMIZATION_WEIGHTS = { runtime: 0.6, memory: 0.4 } as const;

/**
 * Ranks practice standings, mirroring how contests rank.
 *
 *   rating DESC → optimization DESC → accuracy DESC → avg runtime ASC → solved DESC → email ASC
 *
 * Optimization sits directly under rating: among students who have solved equally much, the one
 * who wrote the more efficient code ranks higher. Accuracy drops below it — a student who
 * submits carefully but writes slow code should not outrank one who iterated to a fast solution.
 *
 * The score is a **language-normalized** blend of runtime and memory. Comparing a Python
 * student's raw milliseconds against a C++ student's ranks the language rather than the person,
 * so each student is scored against others who chose the same language (see
 * `buildLanguagePercentileScorer` for the small-sample fallback).
 *
 * A percentile is only meaningful against the whole field, so this is a factory: the pools are
 * built once from values already on the entries, adding no I/O to a hot path that today reads
 * user records only.
 */
export function buildLeaderboardRanker(entries: readonly LeaderboardEntry[]): LeaderboardRanker {
  // Unset only for students with no accepted code, who score 0 either way.
  const languageOf = (entry: LeaderboardEntry): string => entry.primaryLanguage ?? "unknown";

  const runtimeScorer = buildLanguagePercentileScorer(entries, {
    languageOf,
    valueOf: (entry) => entry.avgAcceptedRuntimeMs,
  });
  const memoryScorer = buildLanguagePercentileScorer(entries, {
    languageOf,
    valueOf: (entry) => entry.avgAcceptedMemoryKb,
  });

  const hasMeasuredField = !runtimeScorer.isEmpty || !memoryScorer.isEmpty;

  const optimizationOf = (entry: LeaderboardEntry): number =>
    runtimeScorer.scoreFor(entry) * PRACTICE_OPTIMIZATION_WEIGHTS.runtime +
    memoryScorer.scoreFor(entry) * PRACTICE_OPTIMIZATION_WEIGHTS.memory;

  const compare = (left: LeaderboardEntry, right: LeaderboardEntry): number => {
    if (right.rating !== left.rating) {
      return right.rating - left.rating;
    }

    if (hasMeasuredField) {
      const leftOptimization = optimizationOf(left);
      const rightOptimization = optimizationOf(right);
      if (leftOptimization !== rightOptimization) {
        return rightOptimization - leftOptimization;
      }
    }

    if (right.accuracy !== left.accuracy) {
      return right.accuracy - left.accuracy;
    }

    if (hasMeasuredField) {
      // A student with no accepted code has no runtime either; sort them after someone who has.
      const leftRuntime = left.avgAcceptedRuntimeMs || Number.MAX_SAFE_INTEGER;
      const rightRuntime = right.avgAcceptedRuntimeMs || Number.MAX_SAFE_INTEGER;
      if (leftRuntime !== rightRuntime) {
        return leftRuntime - rightRuntime;
      }
    }

    if (right.problemsSolved !== left.problemsSolved) {
      return right.problemsSolved - left.problemsSolved;
    }

    return left.email.localeCompare(right.email);
  };

  return {
    compare,
    optimizationScoreFor: (entry) =>
      hasMeasuredField ? Number(optimizationOf(entry).toFixed(4)) : null,
  };
}

export function toLeaderboardListItem(
  entry: LeaderboardEntry,
  rank: number,
  optimizationScore: number | null = null,
): LeaderboardListItem {
  return {
    rank,
    email: entry.email,
    role: entry.role,
    name: entry.name,
    uid: entry.uid,
    department: entry.department,
    semester: entry.semester,
    year: entry.year,
    rating: entry.rating,
    score: entry.rating,
    problemsSolved: entry.problemsSolved,
    submissionCount: entry.submissionCount,
    acceptedSubmissionCount: entry.acceptedSubmissionCount,
    accuracy: entry.accuracy,
    optimizationScore,
    primaryLanguage: entry.primaryLanguage,
    avgAcceptedRuntimeMs: entry.avgAcceptedRuntimeMs,
    updatedAt: toIsoString(entry.updatedAt) ?? new Date(0).toISOString(),
    lastAcceptedAt: toIsoString(entry.lastAcceptedAt),
  };
}
