import { EyeOff } from "lucide-react";

/**
 * Blanks the contest the instant the window loses focus. OS-level capture tools (Snipping Tool,
 * Game Bar, macOS screenshot) run outside the browser and cannot be blocked, but they photograph
 * whatever is on screen — so the defence is to have nothing on screen while the browser is not
 * focused. Sits above the lock overlay.
 */
export function ContestScreenGuard() {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-background p-6"
      aria-live="assertive"
    >
      <div className="max-w-sm text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center border border-border bg-secondary/40">
          <EyeOff className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="mt-5 font-display text-2xl font-bold">Contest Hidden</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The contest is hidden while this window is not focused. Click back into the window to
          continue — your timer is still running and this was recorded.
        </p>
      </div>
    </div>
  );
}
