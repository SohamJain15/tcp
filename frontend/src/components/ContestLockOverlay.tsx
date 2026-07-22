import { Maximize, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ContestLockOverlayProps {
  /** Re-enters fullscreen. Browsers only allow this from a user gesture, hence the button. */
  onReturnToFullscreen: () => void;
  violationCount: number;
}

/**
 * Covers the entire contest while the browser is out of fullscreen. The attempt keeps running —
 * this blocks the student from reading or answering anything until fullscreen is restored.
 */
export function ContestLockOverlay({ onReturnToFullscreen, violationCount }: ContestLockOverlayProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md border border-destructive/40 bg-card p-8 text-center shadow-elevated">
        <div className="mx-auto flex h-14 w-14 items-center justify-center border border-destructive/40 bg-destructive/10">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>

        <h2 className="mt-5 font-display text-2xl font-bold">Contest Paused</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This contest runs in fullscreen only. Your questions stay hidden until you return to
          fullscreen. Your timer is still running.
        </p>

        <Button
          className="mt-6 w-full bg-accent text-accent-foreground hover:bg-accent/90"
          size="lg"
          onClick={onReturnToFullscreen}
        >
          <Maximize className="mr-2 h-4 w-4" /> Return to Fullscreen
        </Button>

        {violationCount > 0 && (
          <p className="mt-4 text-xs text-muted-foreground">
            Screenshot attempts recorded: <span className="font-semibold text-destructive">{violationCount}</span>
          </p>
        )}
      </div>
    </div>
  );
}
