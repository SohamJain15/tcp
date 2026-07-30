import type { ComparisonMode } from "../contract";

export interface ComparisonContext {
  mode: ComparisonMode;
  /** The declared per-test input (JSON-lines), available to CHECKER strategies. */
  input?: string;
}

/**
 * Decides whether produced stdout satisfies the expected output. `EXACT` is
 * delegated to Judge0 and never reaches a Comparator; the others run locally in
 * the backend on the program's stdout.
 */
export interface Comparator {
  readonly mode: ComparisonMode["mode"];
  compare(expected: string, actual: string, ctx: ComparisonContext): boolean;
}

/** A registered special judge for CHECKER comparison mode. */
export interface CheckerPlugin {
  readonly id: string;
  check(expected: string, actual: string, input: string): boolean;
}
