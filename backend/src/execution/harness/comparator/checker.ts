import { trimTrailingWhitespace } from "../canonical";
import type { CheckerPlugin, Comparator, ComparisonContext } from "./comparator";

/**
 * Delegates the verdict to a registered special judge (CHECKER mode) — for
 * problems with multiple valid answers. If the referenced checker is missing it
 * fails closed (never silently accepts).
 */
export class CheckerComparator implements Comparator {
  readonly mode = "CHECKER" as const;

  constructor(private readonly checkers: ReadonlyMap<string, CheckerPlugin>) {}

  compare(expected: string, actual: string, ctx: ComparisonContext): boolean {
    if (ctx.mode.mode !== "CHECKER") {
      return false;
    }
    const checker = this.checkers.get(ctx.mode.checkerId);
    if (!checker) {
      return false;
    }
    return checker.check(
      trimTrailingWhitespace(expected),
      trimTrailingWhitespace(actual),
      ctx.input ?? "",
    );
  }
}
