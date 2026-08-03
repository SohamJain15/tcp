/**
 * Percentile helpers shared by the AI report and the two leaderboards.
 *
 * These live here rather than in `report.model.ts` because `report.model.ts` imports
 * `contest.model.ts`, so the contest module cannot import back from report without creating a
 * cycle. The implementation is unchanged from where it started life in the report module.
 */

function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Where `value` sits in `values` when **lower is better** (runtime, memory, solve time).
 *
 * Returns 1 for the best value in the set and 0 for the worst. Ties share a score: a set where
 * every value is identical scores 0.5 across the board, which correctly says "nobody had an
 * edge" rather than arbitrarily crowning whichever record happened to be read first.
 */
export function lowerIsBetterPercentile(values: readonly number[], value: number): number {
  if (values.length <= 1) {
    return 1;
  }

  let beaten = 0;
  let ties = 0;
  for (const candidate of values) {
    if (candidate > value) {
      beaten += 1;
    } else if (candidate === value) {
      ties += 1;
    }
  }

  // Exclude the value's own entry from the tie count.
  const tiesExcludingSelf = Math.max(0, ties - 1);
  return round((beaten + 0.5 * tiesExcludingSelf) / (values.length - 1), 4);
}
