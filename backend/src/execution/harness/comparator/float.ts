import { canonicalParse, trimTrailingWhitespace, type CanonicalValue } from "../canonical";
import type { Comparator, ComparisonContext } from "./comparator";

/**
 * Compares numeric answers within an absolute-or-relative tolerance. Works on a
 * bare number, an array of numbers, or nested arrays of numbers; structure must
 * match exactly, only leaf numbers get the tolerance.
 */
export class FloatComparator implements Comparator {
  readonly mode = "FLOAT" as const;

  compare(expected: string, actual: string, ctx: ComparisonContext): boolean {
    const epsilon = ctx.mode.mode === "FLOAT" ? ctx.mode.epsilon : 1e-6;
    try {
      const e = canonicalParse(trimTrailingWhitespace(expected));
      const a = canonicalParse(trimTrailingWhitespace(actual));
      return closeEnough(e, a, epsilon);
    } catch {
      return trimTrailingWhitespace(expected) === trimTrailingWhitespace(actual);
    }
  }
}

function closeEnough(e: CanonicalValue, a: CanonicalValue, epsilon: number): boolean {
  if (typeof e === "number" && typeof a === "number") {
    const diff = Math.abs(e - a);
    return diff <= epsilon || diff <= epsilon * Math.max(Math.abs(e), Math.abs(a));
  }
  if (Array.isArray(e) && Array.isArray(a)) {
    if (e.length !== a.length) {
      return false;
    }
    return e.every((child, i) => closeEnough(child, a[i], epsilon));
  }
  if (e && a && typeof e === "object" && typeof a === "object") {
    const ek = Object.keys(e).sort();
    const ak = Object.keys(a).sort();
    if (ek.length !== ak.length || ek.some((k, i) => k !== ak[i])) {
      return false;
    }
    return ek.every((k) =>
      closeEnough((e as Record<string, CanonicalValue>)[k], (a as Record<string, CanonicalValue>)[k], epsilon),
    );
  }
  return e === a;
}
