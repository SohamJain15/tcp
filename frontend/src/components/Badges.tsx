import { cn } from "@/lib/utils";
import type { Difficulty } from "@/api/types";

export function DifficultyBadge({ d }: { d: Difficulty }) {
  const styles = {
    Easy: "bg-success/15 text-success border-success/30",
    Medium: "bg-warning/15 text-warning border-warning/40",
    Hard: "bg-destructive/15 text-destructive border-destructive/40",
  }[d];

  return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border", styles)}>{d}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACCEPTED: "bg-success/15 text-success border-success/30",
    Accepted: "bg-success/15 text-success border-success/30",
    "Ran Successfully": "bg-success/15 text-success border-success/30",
    QUEUED: "bg-muted text-muted-foreground border-border",
    Queued: "bg-muted text-muted-foreground border-border",
    RUNNING: "bg-warning/15 text-warning border-warning/40",
    Running: "bg-warning/15 text-warning border-warning/40",
    WRONG_ANSWER: "bg-destructive/15 text-destructive border-destructive/40",
    "Wrong Answer": "bg-destructive/15 text-destructive border-destructive/40",
    TIME_LIMIT_EXCEEDED: "bg-warning/15 text-warning border-warning/40",
    "Time Limit Exceeded": "bg-warning/15 text-warning border-warning/40",
    TLE: "bg-warning/15 text-warning border-warning/40",
    RUNTIME_ERROR: "bg-destructive/15 text-destructive border-destructive/40",
    "Runtime Error": "bg-destructive/15 text-destructive border-destructive/40",
    COMPILATION_ERROR: "bg-destructive/15 text-destructive border-destructive/40",
    "Compilation Error": "bg-destructive/15 text-destructive border-destructive/40",
    INTERNAL_ERROR: "bg-destructive/15 text-destructive border-destructive/40",
    "Internal Error": "bg-destructive/15 text-destructive border-destructive/40",
    Published: "bg-success/15 text-success border-success/30",
    Draft: "bg-muted text-muted-foreground border-border",
    Archived: "bg-secondary text-secondary-foreground border-border",
  };

  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border", map[status] ?? "bg-muted text-muted-foreground border-border")}>
      {status}
    </span>
  );
}
