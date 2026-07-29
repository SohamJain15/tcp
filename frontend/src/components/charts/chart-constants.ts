import type { SubmissionStatus } from "@/api/types";

/**
 * Single source of truth for chart colours.
 *
 * These maps previously existed as byte-identical copies in the faculty dashboard and
 * the student profile; a third copy was about to be added for the department views.
 */

export const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: "#22c55e",
  Medium: "#eab308",
  Hard: "#ef4444",
};

export const STATUS_COLORS: Partial<Record<SubmissionStatus, string>> = {
  ACCEPTED: "hsl(var(--success))",
  WRONG_ANSWER: "hsl(var(--destructive))",
  TIME_LIMIT_EXCEEDED: "hsl(var(--warning))",
  RUNTIME_ERROR: "hsl(var(--accent))",
  COMPILATION_ERROR: "hsl(var(--muted-foreground))",
};

export const ACTIVITY_LEVEL_COLORS: Record<string, string> = {
  Inactive: "hsl(var(--muted-foreground))",
  Low: "hsl(var(--warning))",
  Moderate: "hsl(var(--accent))",
  High: "hsl(var(--success))",
};

export const SERIES_COLORS = {
  primary: "hsl(var(--primary))",
  accent: "hsl(var(--accent))",
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  muted: "hsl(var(--muted-foreground))",
} as const;
