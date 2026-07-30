import { normalizeWhitespace, trimTrailingWhitespace } from "../canonical";
import type { Comparator, ComparisonContext } from "./comparator";

/** Matches Judge0's own comparison: trailing whitespace trimmed, otherwise exact. */
export class ExactComparator implements Comparator {
  readonly mode = "EXACT" as const;
  compare(expected: string, actual: string): boolean {
    return trimTrailingWhitespace(expected) === trimTrailingWhitespace(actual);
  }
}

/** Collapses all inner whitespace before comparing. */
export class WhitespaceComparator implements Comparator {
  readonly mode = "WHITESPACE" as const;
  compare(expected: string, actual: string): boolean {
    return normalizeWhitespace(expected) === normalizeWhitespace(actual);
  }
}

export function makeExactContext(): ComparisonContext {
  return { mode: { mode: "EXACT" } };
}
