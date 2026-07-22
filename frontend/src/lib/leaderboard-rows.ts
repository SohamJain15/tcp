import type { ContestStandingItem, LeaderboardItem } from "@/api/types";

export type LeaderboardMode = "problem" | "contest";

/**
 * One row shape for both leaderboards. The two APIs return genuinely different records — problem
 * ratings carry accuracy, contest standings carry time and violations — so normalising here keeps
 * the table from reaching for fields that only exist in one mode.
 */
export interface LeaderboardRow {
  key: string;
  rank: number;
  email: string;
  name: string | null;
  uid: string | null;
  year: 1 | 2 | 3 | 4 | null;
  score: number;
  solved: number;
  /** Problem mode only. */
  accuracy: number | null;
  /** Contest mode only. */
  timeTakenMs: number | null;
  /** Contest mode only. */
  violationCount: number | null;
}

export function toProblemLeaderboardRows(items: LeaderboardItem[]): LeaderboardRow[] {
  return items.map((item) => ({
    key: item.email,
    rank: item.rank,
    email: item.email,
    name: item.name,
    uid: item.uid,
    year: item.year,
    score: item.score,
    solved: item.problemsSolved,
    accuracy: item.accuracy,
    timeTakenMs: null,
    violationCount: null,
  }));
}

export function toContestLeaderboardRows(items: ContestStandingItem[]): LeaderboardRow[] {
  // Reads the user* fields rather than the duplicate email/name/uid aliases the backend also
  // emits, so this stays type-safe against the declared ContestStandingItem shape.
  return items.map((item) => ({
    key: item.attemptId,
    rank: item.rank,
    email: item.userEmail,
    name: item.userName,
    uid: item.userUid,
    year: item.year,
    score: item.score,
    solved: item.solvedCount,
    accuracy: null,
    timeTakenMs: item.timeTakenMs,
    violationCount: item.violationCount,
  }));
}

export function formatLeaderboardDuration(timeTakenMs: number | null): string {
  if (timeTakenMs === null) {
    return "-";
  }

  const totalSeconds = Math.max(0, Math.ceil(timeTakenMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function getYearLabel(year: 1 | 2 | 3 | 4): string {
  return year === 1 ? "1st Year" : year === 2 ? "2nd Year" : year === 3 ? "3rd Year" : "4th Year";
}

/**
 * Rank of each entry within its own year, used to highlight the top performers per year in a
 * mixed-year contest table.
 */
export function buildYearRanks(rows: LeaderboardRow[]): Map<string, number> {
  const counts = new Map<number, number>();
  const ranks = new Map<string, number>();

  for (const row of rows) {
    if (row.year == null) {
      continue;
    }

    const nextRank = (counts.get(row.year) ?? 0) + 1;
    counts.set(row.year, nextRank);
    ranks.set(row.key, nextRank);
  }

  return ranks;
}
