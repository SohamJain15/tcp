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
  /** True whenever the contest is active but the browser is not in fullscreen. */
  isLocked: boolean;
  violationCount: number;
  /** Must be called from a user gesture — browsers refuse programmatic fullscreen otherwise. */
  requestFullscreen: () => void;
}

const COOLDOWN_MS = 1500;

/** Shortcuts that would open a new surface, leave the page, or reveal devtools. */
function isBlockedShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  const withModifier = event.ctrlKey || event.metaKey;

  if (key === "f11" || key === "f12") {
    return true;
  }

  if (withModifier && event.shiftKey && ["i", "j", "c"].includes(key)) {
    return true;
  }

  if (withModifier && ["t", "n", "w", "r", "p", "s", "u", "tab"].includes(key)) {
    return true;
  }

  if (key === "f5") {
    return true;
  }

  return false;
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

    // Events are recorded for faculty review. Only screenshots are scored server-side; the rest
    // are behaviours we block outright, so they never cost the student points.
    const logEvent = async (payload: ContestProctoringPayload, bucket: string, warning: string, scored: boolean) => {
      if (shouldSkip(bucket)) {
        return;
      }

      try {
        const response = await contestsApi.recordProctorEvent(contestId, payload, pathname);
        onAttemptUpdate(response.attempt);
        if (scored) {
          toast.warning(`${warning} Violation ${response.attempt.violationCount}/${maxViolations}.`);
        } else {
          toast.warning(warning);
        }
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
        "Fullscreen is required. Return to fullscreen to continue.",
        false,
      );
      // Try to recover silently; if the browser refuses, the overlay stays up until the student
      // clicks through it.
      requestFullscreen();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void logEvent(
          { type: "VISIBILITY_LOSS", details: "Document hidden" },
          "switch",
          "Tab switching is disabled during the contest.",
          false,
        );
        return;
      }

      if (!document.fullscreenElement) {
        setIsLocked(true);
      }
    };

    const onBlur = () => {
      void logEvent(
        { type: "TAB_SWITCH", details: "Window blurred" },
        "switch",
        "Leaving the contest window is disabled.",
        false,
      );
      if (!document.fullscreenElement) {
        setIsLocked(true);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "PrintScreen") {
        void logEvent(
          { type: "PRINT_SCREEN", details: "PrintScreen pressed" },
          "printscreen",
          "Screenshots are not allowed.",
          true,
        );
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
      void logEvent({ type: "CONTEXT_MENU", details: "Right click blocked" }, "contextmenu", "Right-click is disabled during the contest.", false);
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    // The attempt may already have been started elsewhere (e.g. navigating into the coding
    // workspace), so reflect the current fullscreen state on mount rather than assuming.
    setIsLocked(!document.fullscreenElement);

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("copy", blockClipboard);
    document.addEventListener("cut", blockClipboard);
    document.addEventListener("paste", blockClipboard);
    document.addEventListener("contextmenu", blockContextMenu);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("copy", blockClipboard);
      document.removeEventListener("cut", blockClipboard);
      document.removeEventListener("paste", blockClipboard);
      document.removeEventListener("contextmenu", blockContextMenu);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [contestId, isActive, maxViolations, onAttemptUpdate, pathname, requestFullscreen]);

  return {
    isLocked: isActive && isLocked,
    violationCount: attempt?.violationCount ?? 0,
    requestFullscreen,
  };
}
