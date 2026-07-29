/**
 * Activity and consistency maths shared by the profile analytics and the department
 * participation views, so both report the same numbers from the same definitions.
 *
 * All day keys are UTC `YYYY-MM-DD`, matching the existing submission heatmap.
 */

export type ActivityLevel = "Inactive" | "Low" | "Moderate" | "High";

export interface ActivityLevelBand {
  level: ActivityLevel;
  /** Inclusive lower bound, as a fraction of the window. */
  minRatio: number;
  /** Inclusive upper bound, as a fraction of the window. */
  maxRatio: number;
}

/** Bands are exported so the API can echo them and the chart legend need not hardcode them. */
export const ACTIVITY_LEVEL_BANDS: ActivityLevelBand[] = [
  { level: "Inactive", minRatio: 0, maxRatio: 0 },
  { level: "Low", minRatio: 0.0001, maxRatio: 0.25 },
  { level: "Moderate", minRatio: 0.2501, maxRatio: 0.6 },
  { level: "High", minRatio: 0.6001, maxRatio: 1 },
];

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Every day key from `from` to `to` inclusive, so trends can be zero-filled. */
export function enumerateDateKeys(from: Date, to: Date): string[] {
  const keys: string[] = [];
  for (let cursor = new Date(from); cursor.getTime() <= to.getTime(); cursor = addDays(cursor, 1)) {
    keys.push(toDateKey(cursor));
  }
  return keys;
}

export function countDaysBetween(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
}

/** Longest run of consecutive calendar days present in the set. */
export function computeLongestStreak(dateKeys: Iterable<string>): number {
  const sorted = Array.from(new Set(dateKeys)).sort();
  let longest = 0;
  let run = 0;
  let previous: string | null = null;

  for (const key of sorted) {
    run = previous !== null && key === toDateKey(addDays(new Date(`${previous}T00:00:00.000Z`), 1)) ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = key;
  }

  return longest;
}

/**
 * Consecutive active days ending today, or ending yesterday — a student who simply
 * has not submitted yet today has not broken their streak.
 */
export function computeCurrentStreak(dateKeys: Iterable<string>, today: Date): number {
  const keys = new Set(dateKeys);
  let cursor = new Date(`${toDateKey(today)}T00:00:00.000Z`);

  if (!keys.has(toDateKey(cursor))) {
    cursor = addDays(cursor, -1);
    if (!keys.has(toDateKey(cursor))) {
      return 0;
    }
  }

  let streak = 0;
  while (keys.has(toDateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

export function classifyActivityLevel(activeDays: number, windowDays: number): ActivityLevel {
  if (activeDays <= 0 || windowDays <= 0) {
    return "Inactive";
  }

  const ratio = activeDays / windowDays;
  if (ratio <= 0.25) return "Low";
  if (ratio <= 0.6) return "Moderate";
  return "High";
}

/** ISO week key (`YYYY-Www`) used to measure week-over-week regularity. */
export function toWeekKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const target = new Date(date);
  // ISO weeks start Monday; shift to the Thursday of this week to get the year right.
  const dayOfWeek = (date.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayOfWeek + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayOfWeek = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayOfWeek + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export interface ConsistencyBreakdown {
  activeDays: number;
  windowDays: number;
  /** Share of days in the window with at least one submission. */
  activeDayRatio: number;
  weeksWithActivity: number;
  totalWeeks: number;
  /** Share of weeks in the window with at least one submission. */
  weeklyRegularity: number;
  /** 0-100, an equal blend of the two ratios above. */
  consistencyScore: number;
  currentStreakDays: number;
  longestStreakDays: number;
}

function round2(value: number): number {
  return Math.round(value * 10000) / 100;
}

/**
 * Blends "how many days were you active" with "how many weeks did you show up at all",
 * so a student who works steadily scores above one who crams the same volume into a
 * single burst. Both components are returned for display alongside the score.
 */
export function computeConsistency(dateKeys: Iterable<string>, from: Date, to: Date): ConsistencyBreakdown {
  const keys = new Set(dateKeys);
  const windowDays = countDaysBetween(from, to);
  const allWeeks = new Set(enumerateDateKeys(from, to).map(toWeekKey));
  const activeWeeks = new Set(Array.from(keys).map(toWeekKey));

  const activeDays = keys.size;
  const totalWeeks = Math.max(1, allWeeks.size);
  const weeksWithActivity = activeWeeks.size;
  const activeDayRatio = activeDays / windowDays;
  const weeklyRegularity = weeksWithActivity / totalWeeks;

  return {
    activeDays,
    windowDays,
    activeDayRatio: round2(activeDayRatio),
    weeksWithActivity,
    totalWeeks,
    weeklyRegularity: round2(weeklyRegularity),
    consistencyScore: Math.round(100 * (0.5 * activeDayRatio + 0.5 * weeklyRegularity)),
    currentStreakDays: computeCurrentStreak(keys, to),
    longestStreakDays: computeLongestStreak(keys),
  };
}

/**
 * Estimated active time, derived from submission timestamps — the platform records no
 * sessions, so this is an approximation and must be labelled as one in the UI.
 *
 * Consecutive submissions less than `gapMinutes` apart are treated as one sitting; each
 * sitting also gets a short tail so a single-submission session is not counted as zero.
 */
export function estimateActiveMinutes(
  timestamps: Date[],
  gapMinutes = 30,
  tailMinutes = 5,
): { totalMinutes: number; byDate: { date: string; minutes: number }[] } {
  if (timestamps.length === 0) {
    return { totalMinutes: 0, byDate: [] };
  }

  const sorted = timestamps.slice().sort((left, right) => left.getTime() - right.getTime());
  const gapMs = gapMinutes * 60_000;
  const minutesByDate = new Map<string, number>();

  let sessionStart = sorted[0];
  let sessionEnd = sorted[0];

  const closeSession = () => {
    const minutes = (sessionEnd.getTime() - sessionStart.getTime()) / 60_000 + tailMinutes;
    const key = toDateKey(sessionStart);
    minutesByDate.set(key, (minutesByDate.get(key) ?? 0) + minutes);
  };

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (current.getTime() - sessionEnd.getTime() > gapMs) {
      closeSession();
      sessionStart = current;
    }
    sessionEnd = current;
  }
  closeSession();

  const byDate = Array.from(minutesByDate.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([date, minutes]) => ({ date, minutes: Math.round(minutes) }));

  return {
    totalMinutes: byDate.reduce((total, entry) => total + entry.minutes, 0),
    byDate,
  };
}
