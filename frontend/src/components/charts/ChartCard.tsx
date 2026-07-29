import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ChartEmptyState({ message }: { message: string }) {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{message}</div>;
}

interface ChartCardProps {
  title: string;
  /** Small clarifier under the title — used to state that a figure is capped or estimated. */
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/** The shared shell every chart on the platform sits in. */
export function ChartCard({ title, subtitle, action, className, bodyClassName, children }: ChartCardProps) {
  return (
    <Card className={cn("profile-card flex h-full flex-col p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-muted-foreground/80">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className={cn("mt-4 min-h-[220px] flex-1", bodyClassName)}>{children}</div>
    </Card>
  );
}
