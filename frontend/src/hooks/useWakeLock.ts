import { useEffect } from "react";

/**
 * Holds a screen wake lock while an attempt is open.
 *
 * On a phone, a screen that dims and sleeps mid-paper produces exactly the signals proctoring
 * scores — the document goes hidden, the window blurs — so an honest student reading a long
 * question could rack up violations for doing nothing at all. Holding the lock removes that whole
 * class of false positive, and as a side effect keeps the paper readable.
 *
 * The lock is released by the browser whenever the page is hidden, so it has to be re-acquired on
 * the way back. Everything is feature-detected: `wakeLock` is absent on desktop Safari and older
 * Android browsers, and the request rejects outright if the document is not visible.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      return;
    }

    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    const acquire = async () => {
      if (released || document.visibilityState !== "visible" || sentinel) {
        return;
      }
      try {
        sentinel = await navigator.wakeLock.request("screen");
        sentinel.addEventListener("release", () => {
          sentinel = null;
        });
      } catch {
        // Denied, or the document went hidden mid-request. Proctoring still works without it.
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      // Promise.resolve, not a bare .catch: a sentinel whose release() returns undefined would
      // otherwise throw here and take the unmounting attempt page down with it.
      void Promise.resolve(sentinel?.release()).catch(() => {
        // Already released by the browser.
      });
      sentinel = null;
    };
  }, [active]);
}
