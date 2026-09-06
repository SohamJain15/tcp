import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { ContestProctoringPayload } from "@/api/types";
import { useWakeLock } from "@/hooks/useWakeLock";

/** What the caller's endpoint tells us back after an event is recorded. */
export interface ProctoringEventResult {
  violationCount: number;
  autoSubmitted: boolean;
}

interface UseAttemptProctoringOptions {
  /** Whether the attempt is open. Listeners are only bound while this holds. */
  isAttemptActive: boolean;
  /**
   * Escape hatch for surfaces that must never engage proctoring — notably a handheld, where
   * fullscreen cannot be held. Kept as a flag rather than a conditional hook call so the
   * caller can still obey the rules of hooks.
   */
  enabled?: boolean;
  maxViolations?: number;
  violationCount: number;
  /** Injected so contests and class tests can share this without either importing the other. */
  recordEvent: (payload: ContestProctoringPayload) => Promise<ProctoringEventResult>;
  /** Wording differs per surface ("contest" / "class test"). */
  surfaceLabel?: string;
  /**
   * How hard fullscreen is enforced.
   *
   * - `"required"`: desktop. Exiting fullscreen locks the paper and is scored.
   * - `"best-effort"`: handhelds. Fullscreen is requested, and on a browser that grants it
   *   (Android Chrome) enforcement is identical to desktop. Where the API does not exist at all
   *   (iOS Safari on iPhone) nothing is scored, because a student cannot re-enter a mode their
   *   browser has never offered. Leaving the app is still caught by `visibilitychange`.
   * - `"off"`: no fullscreen handling.
   */
  fullscreenMode?: "required" | "best-effort" | "off";
  /** @deprecated Pass `fullscreenMode` instead. `false` maps to `"off"`, `true` to `"required"`. */
  requireFullscreen?: boolean;
  /**
   * Whether a window `blur` counts as leaving. False on touch devices, where opening the soft
   * keyboard fires `blur` — scoring it would auto-submit an honest student the moment they type.
   * Real app-switching still registers through `visibilitychange`.
   */
  scoreBlur?: boolean;
}

/**
 * Below this fraction of the tallest height seen, the viewport has been split or shrunk — a
 * split-screen app, or a picture-in-picture window taking the space. Recorded, never scored: it is
 * something a phone does on its own and is not by itself evidence of anything.
 */
const RESIZE_SHRINK_RATIO = 0.65;
const RESIZE_DEBOUNCE_MS = 500;

interface UseAttemptProctoringResult {
  /** Browser is out of fullscreen — cover the paper until it is restored. */
  isLocked: boolean;
  /** Window lost focus — blank the paper so off-browser capture tools get nothing. */
  isObscured: boolean;
  violationCount: number;
  /** Must run inside a user gesture; browsers reject programmatic fullscreen otherwise. */
  requestFullscreen: () => void;
}

// One student action often fires several DOM events (Esc → fullscreenchange + blur; Alt+Tab →
// blur + visibilitychange). Events sharing a bucket inside this window are reported once, so a
// single action costs exactly one violation.
const COOLDOWN_MS = 2500;

function isPrintScreenKey(event: KeyboardEvent): boolean {
  return (
    event.key === "PrintScreen" ||
    event.code === "PrintScreen" ||
    // Some keyboard drivers still emit the legacy DOM 3 name.
    event.key === "Snapshot"
  );
}

/** Shortcuts that would open another surface, leave the page, or reveal devtools. */
function isBlockedShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  const withModifier = event.ctrlKey || event.metaKey;

  if (key === "f11" || key === "f12" || key === "f5") {
    return true;
  }

  if (withModifier && event.shiftKey && ["i", "j", "c", "tab"].includes(key)) {
    return true;
  }

  if (withModifier && ["t", "n", "w", "r", "p", "s", "u", "a", "tab"].includes(key)) {
    return true;
  }

  return false;
}

/**
 * A PrintScreen capture lands on the system clipboard. Overwriting it immediately is the only
 * lever a web page has over a screenshot that has already been taken. Requires document focus,
 * so failure is expected and ignored.
 */
async function wipeClipboard(): Promise<void> {
  try {
    await navigator.clipboard?.writeText(" ");
  } catch {
    // Permission denied or the document lost focus — nothing further we can do.
  }
}

export function useAttemptProctoring({
  isAttemptActive,
  enabled = true,
  maxViolations = 3,
  violationCount,
  recordEvent,
  surfaceLabel = "contest",
  fullscreenMode,
  requireFullscreen = true,
  scoreBlur = true,
}: UseAttemptProctoringOptions): UseAttemptProctoringResult {
  const cooldownsRef = useRef<Record<string, number>>({});
  const isRestoringRef = useRef(false);
  // Whether fullscreen was ever actually granted. On a browser that has no fullscreen for web
  // pages, an "exit" can never happen and must never be scored.
  const fullscreenEverGrantedRef = useRef(false);
  const tallestHeightRef = useRef(0);
  const [isLocked, setIsLocked] = useState(false);
  const [isObscured, setIsObscured] = useState(false);

  const isActive = enabled && isAttemptActive;
  const mode = fullscreenMode ?? (requireFullscreen ? "required" : "off");
  const supportsFullscreen =
    typeof document !== "undefined" && typeof document.documentElement.requestFullscreen === "function";

  // A sleeping screen looks exactly like an app switch to the checks below.
  useWakeLock(isActive);

  const requestFullscreen = useCallback(() => {
    if (document.fullscreenElement || isRestoringRef.current) {
      setIsLocked(false);
      return;
    }

    isRestoringRef.current = true;
    void Promise.resolve(document.documentElement.requestFullscreen?.())
      .then(() => {
        fullscreenEverGrantedRef.current = true;
        setIsLocked(false);
      })
      .catch(() => setIsLocked(true))
      .finally(() => {
        isRestoringRef.current = false;
      });
  }, []);

  useEffect(() => {
    if (!isActive) {
      setIsLocked(false);
      setIsObscured(false);
      return;
    }

    const shouldSkip = (bucket: string) => {
      const now = Date.now();
      const previous = cooldownsRef.current[bucket] ?? 0;
      if (now - previous < COOLDOWN_MS) {
        return true;
      }

      cooldownsRef.current[bucket] = now;
      return false;
    };
    let wasHidden = false;

    const logEvent = async (
      payload: ContestProctoringPayload,
      bucket: string,
      warning: string,
      scored: boolean,
    ) => {
      if (shouldSkip(bucket)) {
        return;
      }

      try {
        const result = await recordEvent(payload);

        if (result.autoSubmitted) {
          toast.error(`${warning} Violation limit reached — your test has been submitted.`);
          return;
        }

        toast.warning(
          scored ? `${warning} Violation ${result.violationCount}/${maxViolations}.` : warning,
        );
      } catch {
        // A logging failure must never interrupt the attempt itself.
        toast.warning(warning);
      }
    };

    const onFullscreenChange = () => {
      if (document.fullscreenElement) {
        fullscreenEverGrantedRef.current = true;
        setIsLocked(false);
        return;
      }

      // Best-effort mode on a browser that never granted fullscreen: there is nothing to exit, so
      // neither lock the paper nor record a violation.
      if (mode === "best-effort" && !fullscreenEverGrantedRef.current) {
        return;
      }

      setIsLocked(true);
      void logEvent(
        { type: "FULLSCREEN_EXIT", details: "Exited fullscreen" },
        "fullscreen",
        "Leaving fullscreen is recorded.",
        true,
      );
      // Try to return immediately. This succeeds while the browser still considers the page
      // user-activated; otherwise the overlay's click-anywhere handler picks it up.
      requestFullscreen();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        wasHidden = true;
        setIsObscured(true);
        void logEvent(
          { type: "VISIBILITY_LOSS", details: "Document hidden" },
          "focus",
          `Leaving the ${surfaceLabel} tab is recorded.`,
          true,
        );
        return;
      }

      setIsObscured(false);
      if (wasHidden) {
        wasHidden = false;
        toast.warning(`You returned to the ${surfaceLabel}. The app switch was recorded.`);
      }
      if (!document.fullscreenElement) {
        setIsLocked(true);
      }
    };

    const onBlur = () => {
      // Blank the paper the instant focus leaves, so a Snipping Tool or Alt+Tab capture taken
      // while the browser is in the background contains nothing readable.
      setIsObscured(true);
      void logEvent(
        { type: "TAB_SWITCH", details: "Window blurred" },
        "focus",
        `Leaving the ${surfaceLabel} window is recorded.`,
        true,
      );
    };

    const onFocus = () => {
      setIsObscured(false);
      if (!document.fullscreenElement) {
        setIsLocked(true);
      }
    };

    const onScreenshotKey = (event: KeyboardEvent) => {
      if (!isPrintScreenKey(event)) {
        return;
      }

      event.preventDefault();
      void wipeClipboard();
      void logEvent(
        { type: "PRINT_SCREEN", details: `PrintScreen (${event.type})` },
        "printscreen",
        "Screenshots are recorded.",
        true,
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // Windows browsers deliver PrintScreen on keyup only, so detection lives in its own handler
      // bound to both events; this branch just suppresses the default where it does fire.
      if (isPrintScreenKey(event)) {
        onScreenshotKey(event);
        return;
      }

      if (isBlockedShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const blockClipboard = (event: Event) => {
      event.preventDefault();
      const type = event.type.toUpperCase() as "COPY" | "CUT" | "PASTE";
      void logEvent(
        { type, details: `${event.type} blocked` },
        event.type,
        `Copy, cut and paste are disabled during the ${surfaceLabel}.`,
        false,
      );
    };

    const blockContextMenu = (event: Event) => {
      event.preventDefault();
      void logEvent(
        { type: "CONTEXT_MENU", details: "Right click blocked" },
        "contextmenu",
        `Right-click is disabled during the ${surfaceLabel}.`,
        false,
      );
    };

    // Question text cannot be selected or dragged out of the page. The code editor manages its own
    // selection, so anything inside Monaco is exempt.
    const blockSelection = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".monaco-editor")) {
        return;
      }
      event.preventDefault();
    };

    /**
     * iOS backgrounds a tab without reliably firing `visibilitychange`; `pagehide` and `freeze` are
     * the events it does deliver. Same bucket as the visibility check, so one app switch still
     * costs exactly one violation.
     */
    const onPageHidden = () => {
      wasHidden = true;
      setIsObscured(true);
      void logEvent(
        { type: "VISIBILITY_LOSS", details: "Page hidden or frozen" },
        "focus",
        `Leaving the ${surfaceLabel} is recorded.`,
        true,
      );
    };

    const onOrientationChange = () => {
      void logEvent(
        { type: "ORIENTATION_CHANGE", details: screen.orientation?.type ?? "unknown" },
        "orientation",
        "Rotating your device is recorded.",
        false,
      );
    };

    // Split-screen and picture-in-picture are not directly detectable from a web page. A sudden,
    // large drop in viewport height while the page is still visible is the observable trace of
    // both, so it is recorded as a note for faculty rather than scored as cheating.
    let resizeTimer: number | null = null;
    const onResize = () => {
      tallestHeightRef.current = Math.max(tallestHeightRef.current, window.innerHeight);
      if (resizeTimer) {
        window.clearTimeout(resizeTimer);
      }
      resizeTimer = window.setTimeout(() => {
        const tallest = tallestHeightRef.current;
        if (tallest === 0 || document.visibilityState !== "visible") {
          return;
        }
        if (window.innerHeight / tallest >= RESIZE_SHRINK_RATIO) {
          return;
        }
        void logEvent(
          { type: "RESIZE", details: `Viewport height ${window.innerHeight} of ${tallest}` },
          "resize",
          "Your screen was split or resized. This is recorded.",
          false,
        );
      }, RESIZE_DEBOUNCE_MS);
    };

    const onEnterPictureInPicture = () => {
      void logEvent(
        { type: "PICTURE_IN_PICTURE", details: "Entered picture-in-picture" },
        "pip",
        "Picture-in-picture is recorded.",
        false,
      );
    };

    // Pinch-zoom on iOS can scroll parts of the paper out from under the overlays.
    const blockGesture = (event: Event) => event.preventDefault();

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    // The attempt may have been started on another page (e.g. navigating into the coding
    // workspace), so reflect the current fullscreen state rather than assuming it. On surfaces
    // that do not require fullscreen (a phone) there is nothing to lock.
    if (mode !== "off") {
      // Best-effort on a browser without the API: nothing to lock, and nothing will ever fire.
      setIsLocked(mode === "required" ? !document.fullscreenElement : false);
      if (mode === "required" || supportsFullscreen) {
        document.addEventListener("fullscreenchange", onFullscreenChange);
      }
    }
    tallestHeightRef.current = window.innerHeight;
    // CSS the hook owns rather than each page: kills pull-to-refresh, the iOS long-press callout
    // and text selection outside the editor for exactly as long as the attempt is open.
    document.body.classList.add("attempt-locked");
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHidden);
    document.addEventListener("freeze", onPageHidden);
    window.addEventListener("resize", onResize);
    window.addEventListener("gesturestart", blockGesture);
    document.addEventListener("enterpictureinpicture", onEnterPictureInPicture, true);
    screen.orientation?.addEventListener?.("change", onOrientationChange);
    if (scoreBlur) {
      window.addEventListener("blur", onBlur);
    }
    window.addEventListener("focus", onFocus);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onScreenshotKey, true);
    document.addEventListener("copy", blockClipboard);
    document.addEventListener("cut", blockClipboard);
    document.addEventListener("paste", blockClipboard);
    document.addEventListener("contextmenu", blockContextMenu);
    document.addEventListener("selectstart", blockSelection);
    document.addEventListener("dragstart", blockSelection);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      if (resizeTimer) {
        window.clearTimeout(resizeTimer);
      }
      document.body.classList.remove("attempt-locked");
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHidden);
      document.removeEventListener("freeze", onPageHidden);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("gesturestart", blockGesture);
      document.removeEventListener("enterpictureinpicture", onEnterPictureInPicture, true);
      screen.orientation?.removeEventListener?.("change", onOrientationChange);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onScreenshotKey, true);
      document.removeEventListener("copy", blockClipboard);
      document.removeEventListener("cut", blockClipboard);
      document.removeEventListener("paste", blockClipboard);
      document.removeEventListener("contextmenu", blockContextMenu);
      document.removeEventListener("selectstart", blockSelection);
      document.removeEventListener("dragstart", blockSelection);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [isActive, maxViolations, mode, recordEvent, requestFullscreen, scoreBlur, supportsFullscreen, surfaceLabel]);

  // While locked out of fullscreen, the very next interaction anywhere on the page counts as the
  // gesture the Fullscreen API demands — so the student never has to find a button.
  useEffect(() => {
    if (!isActive || !isLocked) {
      return;
    }

    const restore = () => requestFullscreen();

    window.addEventListener("pointerdown", restore, true);
    window.addEventListener("keydown", restore, true);
    window.addEventListener("touchstart", restore, true);

    return () => {
      window.removeEventListener("pointerdown", restore, true);
      window.removeEventListener("keydown", restore, true);
      window.removeEventListener("touchstart", restore, true);
    };
  }, [isActive, isLocked, requestFullscreen]);

  return {
    isLocked: isActive && isLocked,
    isObscured: isActive && isObscured,
    violationCount,
    requestFullscreen,
  };
}
