import { useEffect, useRef } from "react";
import { Timer } from "lucide-react";

import { useCountdown } from "@/hooks/useCountdown";
import { cn } from "@/lib/utils";

interface ContestTimerProps {
  /** ISO timestamp the attempt (or contest window) closes at. */
  deadline: string | null | undefined;
  label?: string;
  /** Fired once, when the countdown crosses zero while mounted. */
  onExpire?: () => void;
  className?: string;
}

const WARNING_THRESHOLD_MS = 5 * 60_000;
const CRITICAL_THRESHOLD_MS = 60_000;

export function ContestTimer({ deadline, label = "Time left", onExpire, className }: ContestTimerProps) {
  const { msRemaining, label: countdownLabel, isExpired } = useCountdown(deadline);
  const hasFiredRef = useRef(false);

  useEffect(() => {
    if (!isExpired || hasFiredRef.current) {
      return;
    }

    hasFiredRef.current = true;
    onExpire?.();
  }, [isExpired, onExpire]);

  // A fresh deadline (e.g. a new attempt) re-arms the expiry callback.
  useEffect(() => {
    hasFiredRef.current = false;
  }, [deadline]);

  if (!deadline) {
    return null;
  }

  const isCritical = msRemaining <= CRITICAL_THRESHOLD_MS;
  const isWarning = !isCritical && msRemaining <= WARNING_THRESHOLD_MS;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 border border-border bg-secondary/40 px-3 py-1.5",
        isWarning && "border-warning/50 bg-warning/10",
        isCritical && "border-destructive/50 bg-destructive/10",
        className,
      )}
      role="timer"
      aria-live={isCritical ? "assertive" : "off"}
    >
      <Timer
        className={cn(
          "h-4 w-4 shrink-0 text-muted-foreground",
          isWarning && "text-warning",
          isCritical && "text-destructive",
        )}
      />
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono-code text-sm font-bold tabular-nums",
          isWarning && "text-warning",
          isCritical && "text-destructive",
        )}
      >
        {countdownLabel}
      </span>
    </div>
  );
}
