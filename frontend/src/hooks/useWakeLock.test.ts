import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useWakeLock } from "./useWakeLock";

function mockWakeLock() {
  const release = vi.fn().mockResolvedValue(undefined);
  const sentinel = { release, addEventListener: vi.fn() };
  const request = vi.fn().mockResolvedValue(sentinel);
  Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
  return { request, release };
}

function clearWakeLock() {
  Reflect.deleteProperty(navigator, "wakeLock");
}

afterEach(() => {
  clearWakeLock();
  vi.restoreAllMocks();
});

describe("useWakeLock", () => {
  it("no-ops cleanly on a browser without the API", () => {
    clearWakeLock();
    // The point: an unsupported browser must not throw and take the whole attempt page with it.
    expect(() => renderHook(() => useWakeLock(true)).unmount()).not.toThrow();
  });

  it("requests a screen lock while the attempt is active", async () => {
    const { request } = mockWakeLock();
    renderHook(() => useWakeLock(true));
    await Promise.resolve();
    expect(request).toHaveBeenCalledWith("screen");
  });

  it("does not request one when the attempt is not active", async () => {
    const { request } = mockWakeLock();
    renderHook(() => useWakeLock(false));
    await Promise.resolve();
    expect(request).not.toHaveBeenCalled();
  });

  it("releases the lock when the attempt ends", async () => {
    const { release } = mockWakeLock();
    const { unmount } = renderHook(() => useWakeLock(true));
    await Promise.resolve();
    unmount();
    await Promise.resolve();
    expect(release).toHaveBeenCalled();
  });

  it("survives a rejected request", async () => {
    const request = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
    const { unmount } = renderHook(() => useWakeLock(true));
    await Promise.resolve();
    expect(() => unmount()).not.toThrow();
  });

  it("watches visibility so the lock can be re-taken after the page is hidden", async () => {
    mockWakeLock();
    // The browser releases the lock whenever the page hides, so the hook has to be listening for
    // the way back; without this the second half of a paper would run with no lock at all.
    const addEventListener = vi.spyOn(document, "addEventListener");
    const { unmount } = renderHook(() => useWakeLock(true));
    await Promise.resolve();

    expect(addEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));

    const removeEventListener = vi.spyOn(document, "removeEventListener");
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });
});
