import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useIsHandheld, useIsNarrow } from "./use-mobile";

/** Answers `true` only for the queries listed, mirroring how a real browser evaluates them. */
function mockMatchMedia(matching: string[]) {
  const value = (query: string) => ({
    matches: matching.includes(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
  vi.spyOn(window, "matchMedia").mockImplementation(value as unknown as typeof window.matchMedia);
}

const NARROW = "(max-width: 1023px)";
const HANDHELD = "(max-width: 1023px) and (pointer: coarse)";

describe("useIsHandheld", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is true on a small touch screen", () => {
    mockMatchMedia([NARROW, HANDHELD]);
    expect(renderHook(() => useIsHandheld()).result.current).toBe(true);
  });

  it("stays false for a narrow desktop window", () => {
    // The whole point of requiring a coarse pointer: a student who resizes their browser mid-test
    // must never be treated as mobile and ejected from a contest they are legitimately sitting.
    mockMatchMedia([NARROW]);
    expect(renderHook(() => useIsHandheld()).result.current).toBe(false);
  });

  it("stays false on a wide screen", () => {
    mockMatchMedia([]);
    expect(renderHook(() => useIsHandheld()).result.current).toBe(false);
  });

  it("resolves on the very first render, so a blocked page never flashes its content first", () => {
    mockMatchMedia([NARROW, HANDHELD]);
    const { result } = renderHook(() => useIsHandheld());
    // No act()/effect flush between render and this assertion — the value must already be right.
    expect(result.current).toBe(true);
  });
});

describe("useIsNarrow", () => {
  afterEach(() => vi.restoreAllMocks());

  it("tracks width alone, so it also covers a resized desktop window", () => {
    mockMatchMedia([NARROW]);
    expect(renderHook(() => useIsNarrow()).result.current).toBe(true);
  });
});
