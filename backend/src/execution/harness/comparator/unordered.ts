import { canonicalParse, canonicalStringify, deepSort, trimTrailingWhitespace } from "../canonical";
import type { Comparator, ComparisonContext } from "./comparator";

/**
 * Treats collections as unordered by deep-sorting both sides before comparing.
 * Used for problems whose answer is a set / any-order list. Falls back to exact
 * text compare when either side is not valid canonical JSON.
 */
export class UnorderedComparator implements Comparator {
  readonly mode = "UNORDERED" as const;

  compare(expected: string, actual: string, ctx: ComparisonContext): boolean {
    const depth = ctx.mode.mode === "UNORDERED" ? ctx.mode.depth ?? Infinity : Infinity;
    try {
      const e = deepSort(canonicalParse(trimTrailingWhitespace(expected)), depth);
      const a = deepSort(canonicalParse(trimTrailingWhitespace(actual)), depth);
      return canonicalStringify(e) === canonicalStringify(a);
    } catch {
      return trimTrailingWhitespace(expected) === trimTrailingWhitespace(actual);
    }
  }
}
