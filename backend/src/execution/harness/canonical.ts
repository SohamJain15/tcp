/**
 * Canonical JSON is the single wire + comparison format for metadata-driven
 * problems. Rules:
 *   - no insignificant whitespace (separators are "," and ":")
 *   - object keys sorted lexicographically (deterministic across languages)
 *   - booleans as true/false, absent/null as null
 *   - integers printed without a trailing ".0"; non-integers via the shortest
 *     round-trippable JS representation
 *
 * Every language harness must emit byte-identical output to {@link canonicalStringify}
 * for the same logical value, so verdicts are pure text comparison.
 */

export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

export function canonicalStringify(value: unknown): string {
  return stringify(value as CanonicalValue);
}

function stringify(value: CanonicalValue): string {
  if (value === null || value === undefined) {
    return "null";
  }
  const t = typeof value;
  if (t === "boolean") {
    return value ? "true" : "false";
  }
  if (t === "number") {
    return stringifyNumber(value as number);
  }
  if (t === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stringify).join(",")}]`;
  }
  // object
  const obj = value as { [key: string]: CanonicalValue };
  const keys = Object.keys(obj).sort();
  const body = keys.map((k) => `${JSON.stringify(k)}:${stringify(obj[k])}`).join(",");
  return `{${body}}`;
}

function stringifyNumber(n: number): string {
  if (!Number.isFinite(n)) {
    // NaN / Infinity are not valid JSON; surface as null so comparisons stay well-defined.
    return "null";
  }
  if (Number.isInteger(n)) {
    return String(n);
  }
  return String(n);
}

export function canonicalParse(text: string): CanonicalValue {
  return JSON.parse(text) as CanonicalValue;
}

/**
 * Recursively sorts arrays and object keys so two "unordered" answers compare
 * equal. Used by the UNORDERED comparator up to an optional depth.
 */
export function deepSort(value: CanonicalValue, depth = Infinity): CanonicalValue {
  if (depth < 0) {
    return value;
  }
  if (Array.isArray(value)) {
    const sortedChildren = value.map((v) => deepSort(v, depth - 1));
    return [...sortedChildren].sort((a, b) =>
      canonicalStringify(a) < canonicalStringify(b) ? -1 : canonicalStringify(a) > canonicalStringify(b) ? 1 : 0,
    );
  }
  if (value && typeof value === "object") {
    const obj = value as { [key: string]: CanonicalValue };
    const out: { [key: string]: CanonicalValue } = {};
    for (const k of Object.keys(obj)) {
      out[k] = deepSort(obj[k], depth - 1);
    }
    return out;
  }
  return value;
}

/** Trailing-whitespace trim to match Judge0's comparison of exact stdout. */
export function trimTrailingWhitespace(text: string): string {
  return text.replace(/[ \t\r\n]+$/g, "");
}

/** Collapse all runs of inner whitespace to single spaces and trim (WHITESPACE mode). */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
