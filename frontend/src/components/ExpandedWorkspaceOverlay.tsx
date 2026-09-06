import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * A full-viewport frame for one question's workspace, opened from inside a scrolling paper.
 *
 * A class test puts every question in one `max-w-3xl` column, which leaves a coding question about
 * 360px per pane — unusable. Rather than move coding questions to their own route, which would
 * remount the page and re-run the proctoring hook's fullscreen check mid-attempt, this expands the
 * workspace in place.
 *
 * It renders **inside the same React tree, not a portal**: the proctoring listeners, watermark,
 * timer and the paper's own answer state are all untouched, and closing returns the student to the
 * paper with Submit still in reach. It is `fixed` and sits under the lock (z-100) and screen-guard
 * (z-110) overlays, so a violation still covers it.
 */
export interface ExpandedWorkspaceOverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** The attempt's timer and violation counter — they must stay visible while expanded. */
  headerRight?: ReactNode;
  children: ReactNode;
}

export function ExpandedWorkspaceOverlay({
  open,
  onClose,
  title,
  headerRight,
  children,
}: ExpandedWorkspaceOverlayProps) {
  // Escape closes the workspace. Bound in the capture phase so Monaco does not swallow it first,
  // and only while open so a stray Escape never closes something that is not showing.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    // 100dvh, not 100vh: under a mobile URL bar the latter overflows and hides the console row.
    <div className="fixed inset-0 z-40 flex h-[100dvh] flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-3 sm:px-4">
        <p className="min-w-0 truncate text-sm font-semibold">{title}</p>
        <div className="flex shrink-0 items-center gap-3">
          {headerRight}
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="mr-1 h-4 w-4" /> Close
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
