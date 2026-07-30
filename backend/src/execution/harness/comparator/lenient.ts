import { trimTrailingWhitespace } from "../canonical";
import type { Comparator } from "./comparator";

/**
 * Format-tolerant comparison for "passthrough" submissions (the student wrote a
 * full program instead of using the harness skeleton). It compares the *content*,
 * not the exact bytes:
 *   - JSON punctuation (`[] {} , "`) is treated as separators, so `[0,1]`, `0 1`
 *     and `0, 1` are equal;
 *   - numeric tokens are compared numerically (`2.5` == `2.50`);
 *   - `true`/`false` are compared case-insensitively (so Python's `True` matches).
 *
 * Only used when the student opts out of the harness — harness output stays EXACT.
 */
export class LenientComparator implements Comparator {
  readonly mode = "LENIENT" as const;

  compare(expected: string, actual: string): boolean {
    const e = tokenize(expected);
    const a = tokenize(actual);
    if (e.length !== a.length) {
      return false;
    }
    for (let i = 0; i < e.length; i += 1) {
      if (!tokensEqual(e[i], a[i])) {
        return false;
      }
    }
    return true;
  }
}

function tokenize(text: string): string[] {
  return trimTrailingWhitespace(text)
    .replace(/[[\]{}(),"']/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function tokensEqual(x: string, y: string): boolean {
  const nx = Number(x);
  const ny = Number(y);
  if (x !== "" && y !== "" && !Number.isNaN(nx) && !Number.isNaN(ny)) {
    return nx === ny;
  }
  const bx = /^(true|false)$/i.test(x);
  const by = /^(true|false)$/i.test(y);
  if (bx && by) {
    return x.toLowerCase() === y.toLowerCase();
  }
  return x === y;
}
