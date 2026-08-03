import { toIsoString } from "../../shared/utils/date";
import { lowerIsBetterPercentile } from "../../shared/utils/percentile";
import { deriveStudentYearFromSemester, type StudentYear } from "../../shared/utils/student-year";
import type { UserRole } from "../../shared/types/auth";
import type { Department } from "../../shared/types/domain";
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
  /** Memory efficiency of this student's accepted code relative to the ranked field, 0-1. */
  optimizationScore: number | null;
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
 * Ranks practice standings.
 *
 *   rating DESC → accuracy DESC → optimization DESC → avg runtime ASC → solved DESC → email ASC
 *
 * Optimization here is **memory only**, unlike contests where it also covers attempt
 * efficiency. `accuracy` is already accepted ÷ submissions — that *is* attempt efficiency — and
 * it sits above this step, so folding attempts in again would count the same behaviour twice.
 *
 * A percentile is only meaningful against the whole field, so this is a factory: the pool is
 * built once from values already on the entries, adding no I/O to a hot path that today reads
 * user records only.
 */
export function buildLeaderboardRanker(entries: readonly LeaderboardEntry[]): LeaderboardRanker {
  const memoryPool = entries
    .filter((entry) => entry.avgAcceptedMemoryKb > 0)
    .map((entry) => entry.avgAcceptedMemoryKb);

  const optimizationOf = (entry: LeaderboardEntry): number =>
    entry.avgAcceptedMemoryKb > 0 ? lowerIsBetterPercentile(memoryPool, entry.avgAcceptedMemoryKb) : 0;

  const compare = (left: LeaderboardEntry, right: LeaderboardEntry): number => {
    if (right.rating !== left.rating) {
      return right.rating - left.rating;
    }

    if (right.accuracy !== left.accuracy) {
      return right.accuracy - left.accuracy;
    }

    if (memoryPool.length > 0) {
      const leftOptimization = optimizationOf(left);
      const rightOptimization = optimizationOf(right);
      if (leftOptimization !== rightOptimization) {
        return rightOptimization - leftOptimization;
      }

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
      memoryPool.length > 0 ? Number(optimizationOf(entry).toFixed(4)) : null,
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
    avgAcceptedRuntimeMs: entry.avgAcceptedRuntimeMs,
    updatedAt: toIsoString(entry.updatedAt) ?? new Date(0).toISOString(),
    lastAcceptedAt: toIsoString(entry.lastAcceptedAt),
  };
}
