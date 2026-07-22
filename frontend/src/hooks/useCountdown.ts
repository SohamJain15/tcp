import { useEffect, useState } from "react";

export interface CountdownState {
  /** Milliseconds left, clamped at 0. */
  msRemaining: number;
  /** HH:MM:SS while an hour or more is left, MM:SS below that. */
  label: string;
  isExpired: boolean;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

function resolveRemaining(deadline: string | Date | null | undefined): number {
  if (!deadline) {
    return 0;
  }

  const deadlineMs = deadline instanceof Date ? deadline.getTime() : new Date(deadline).getTime();
  if (Number.isNaN(deadlineMs)) {
    return 0;
  }

  return Math.max(0, deadlineMs - Date.now());
}

/**
 * Single source of truth for every contest countdown. Ticks once a second and stops on its own
 * once the deadline passes, so an expired timer costs nothing.
 */
export function useCountdown(deadline: string | Date | null | undefined): CountdownState {
  const [msRemaining, setMsRemaining] = useState(() => resolveRemaining(deadline));

  useEffect(() => {
    setMsRemaining(resolveRemaining(deadline));

    if (!deadline) {
      return;
    }

    const interval = window.setInterval(() => {
      const remaining = resolveRemaining(deadline);
      setMsRemaining(remaining);
      if (remaining <= 0) {
        window.clearInterval(interval);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [deadline]);

  return {
    msRemaining,
    label: formatCountdown(msRemaining),
    isExpired: Boolean(deadline) && msRemaining <= 0,
  };
}
