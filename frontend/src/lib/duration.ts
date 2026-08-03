/**
 * How long a *person* took — attempt duration, solve time, average time taken.
 *
 * This is deliberately not used for program runtime. A judged submission's `runtimeMs` stays in
 * milliseconds everywhere, because milliseconds are the meaningful unit for code execution and
 * rounding a 4 ms run up to "0s" would destroy the number.
 *
 * Replaces four near-identical local formatters that had drifted apart (one rounded seconds,
 * one ceiled them, one showed hours, one did not), so every screen and the exported PDF now
 * agree on the same string.
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) {
    return "-";
  }

  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  // Sub-minute solves keep their seconds rather than collapsing to "0 min", so a fast
  // submission stays distinguishable from a slow one.
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
