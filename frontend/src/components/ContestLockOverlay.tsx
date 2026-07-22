import { Maximize } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ContestLockOverlayProps {
  /** Re-enters fullscreen. The Fullscreen API only permits this from a user gesture. */
  onReturnToFullscreen: () => void;
  violationCount: number;
}

/**
 * Shown only when the browser refused an automatic return to fullscreen. The proctoring hook also
 * listens for the next interaction anywhere on the page, so any click or keypress dismisses this —
 * the button is just the obvious target.
 */
export function ContestLockOverlay({ onReturnToFullscreen, violationCount }: ContestLockOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex cursor-pointer items-center justify-center bg-background p-6"
      onClick={onReturnToFullscreen}
      role="presentation"
    >
      <div className="w-full max-w-md border border-border bg-card p-8 text-center shadow-elevated">
        <div className="mx-auto flex h-14 w-14 items-center justify-center border border-accent/40 bg-accent/10">
          <Maximize className="h-7 w-7 text-accent" />
        </div>

        <h2 className="mt-5 font-display text-2xl font-bold">Returning to Fullscreen</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This contest runs in fullscreen. Click anywhere to continue — your timer is still running.
        </p>

        <Button
          className="mt-6 w-full bg-accent text-accent-foreground hover:bg-accent/90"
          size="lg"
          onClick={onReturnToFullscreen}
        >
          <Maximize className="mr-2 h-4 w-4" /> Continue
        </Button>

        {violationCount > 0 && (
          <p className="mt-4 text-xs text-muted-foreground">
            Violations recorded: <span className="font-semibold text-destructive">{violationCount}</span>
          </p>
        )}
      </div>
    </div>
  );
}
