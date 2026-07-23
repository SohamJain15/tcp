import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { contestsApi } from "@/api/services";
import type { ContestAttempt, ContestProctoringPayload } from "@/api/types";

interface UseContestProctoringOptions {
  contestId: string;
  pathname: string;
  attempt: ContestAttempt | null;
  maxViolations?: number;
  onAttemptUpdate: (attempt: ContestAttempt) => void;
}

interface UseContestProctoringResult {
  /** Browser is out of fullscreen — cover the contest until it is restored. */
  isLocked: boolean;
  /** Window lost focus — blank the contest so off-browser capture tools get nothing. */
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

export function useContestProctoring({
  contestId,
  pathname,
  attempt,
  maxViolations = 3,
  onAttemptUpdate,
}: UseContestProctoringOptions): UseContestProctoringResult {
  const cooldownsRef = useRef<Record<string, number>>({});
  const isRestoringRef = useRef(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isObscured, setIsObscured] = useState(false);

  const isActive = attempt?.status === "ACTIVE";

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
        const response = await contestsApi.recordProctorEvent(contestId, payload, pathname);
        onAttemptUpdate(response.attempt);

        if (response.attempt.status === "AUTO_SUBMITTED") {
          toast.error(`${warning} Violation limit reached — your test has been submitted.`);
          return;
        }

        toast.warning(
          scored
            ? `${warning} Violation ${response.attempt.violationCount}/${maxViolations}.`
            : warning,
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
        setIsObscured(true);
        void logEvent(
          { type: "VISIBILITY_LOSS", details: "Document hidden" },
          "focus",
          "Leaving the contest tab is recorded.",
          true,
        );
        return;
      }

      setIsObscured(false);
      if (!document.fullscreenElement) {
        setIsLocked(true);
      }
    };

    const onBlur = () => {
      // Blank the contest the instant focus leaves, so a Snipping Tool or Alt+Tab capture taken
      // while the browser is in the background contains nothing readable.
      setIsObscured(true);
      void logEvent(
        { type: "TAB_SWITCH", details: "Window blurred" },
        "focus",
        "Leaving the contest window is recorded.",
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
        "Copy, cut and paste are disabled during the contest.",
        false,
      );
    };

    const blockContextMenu = (event: Event) => {
      event.preventDefault();
      void logEvent(
        { type: "CONTEXT_MENU", details: "Right click blocked" },
        "contextmenu",
        "Right-click is disabled during the contest.",
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
    // workspace), so reflect the current fullscreen state rather than assuming it.
    setIsLocked(!document.fullscreenElement);

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
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
  }, [contestId, isActive, maxViolations, onAttemptUpdate, pathname, requestFullscreen]);

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
    violationCount: attempt?.violationCount ?? 0,
    requestFullscreen,
  };
}
