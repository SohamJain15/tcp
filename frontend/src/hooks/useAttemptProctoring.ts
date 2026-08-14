import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { ContestProctoringPayload } from "@/api/types";

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
   * Whether the surface is locked into fullscreen. False on a phone, where iOS Safari has no
   * fullscreen for web pages — leaving it on would lock the student out permanently. Leaving the
   * app is still caught by `visibilitychange`, so the attempt stays proctored.
   */
  requireFullscreen?: boolean;
  /**
   * Whether a window `blur` counts as leaving. False on touch devices, where opening the soft
   * keyboard fires `blur` — scoring it would auto-submit an honest student the moment they type.
   * Real app-switching still registers through `visibilitychange`.
   */
  scoreBlur?: boolean;
}

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
  requireFullscreen = true,
  scoreBlur = true,
}: UseAttemptProctoringOptions): UseAttemptProctoringResult {
  const cooldownsRef = useRef<Record<string, number>>({});
  const isRestoringRef = useRef(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isObscured, setIsObscured] = useState(false);

  const isActive = enabled && isAttemptActive;

  const requestFullscreen = useCallback(() => {
    if (document.fullscreenElement || isRestoringRef.current) {
      setIsLocked(false);
      return;
    }

    isRestoringRef.current = true;
    void Promise.resolve(document.documentElement.requestFullscreen?.())
      .then(() => setIsLocked(false))
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
        setIsLocked(false);
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

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    // The attempt may have been started on another page (e.g. navigating into the coding
    // workspace), so reflect the current fullscreen state rather than assuming it. On surfaces
    // that do not require fullscreen (a phone) there is nothing to lock.
    if (requireFullscreen) {
      setIsLocked(!document.fullscreenElement);
      document.addEventListener("fullscreenchange", onFullscreenChange);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
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
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
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
  }, [isActive, maxViolations, recordEvent, requestFullscreen, requireFullscreen, scoreBlur, surfaceLabel]);

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
