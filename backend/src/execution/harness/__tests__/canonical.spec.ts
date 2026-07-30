import { describe, expect, it } from "vitest";
import { canonicalStringify, deepSort, normalizeWhitespace, trimTrailingWhitespace } from "../canonical";

describe("canonicalStringify", () => {
  it("emits compact JSON with no insignificant whitespace", () => {
    expect(canonicalStringify([1, 2, 3])).toBe("[1,2,3]");
    expect(canonicalStringify({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });

  it("sorts object keys deterministically", () => {
    expect(canonicalStringify({ b: 1, a: 2, c: 3 })).toBe('{"a":2,"b":1,"c":3}');
  });

  it("renders booleans and null canonically", () => {
    expect(canonicalStringify(true)).toBe("true");
    expect(canonicalStringify(false)).toBe("false");
    expect(canonicalStringify(null)).toBe("null");
  });

  it("keeps integers integral and handles nested structures", () => {
    expect(canonicalStringify(42)).toBe("42");
    expect(canonicalStringify([[1, 2], [3]])).toBe("[[1,2],[3]]");
    expect(canonicalStringify({ nums: [3, 1, 2], ok: true })).toBe('{"nums":[3,1,2],"ok":true}');
  });

  it("quotes and escapes strings", () => {
    expect(canonicalStringify("a\"b")).toBe('"a\\"b"');
  });
});

describe("deepSort", () => {
  it("makes unordered arrays compare equal", () => {
    expect(canonicalStringify(deepSort([3, 1, 2]))).toBe(canonicalStringify(deepSort([2, 3, 1])));
  });

  it("sorts nested collections", () => {
    const a = deepSort([[2, 1], [4, 3]]);
    const b = deepSort([[3, 4], [1, 2]]);
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
  });
});

describe("whitespace helpers", () => {
  it("trims only trailing whitespace", () => {
    expect(trimTrailingWhitespace("1 2 3\n\n")).toBe("1 2 3");
  });

  it("normalizes inner whitespace", () => {
    expect(normalizeWhitespace("  1   2\t3\n")).toBe("1 2 3");
  });
});
