import { Hammer } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface FeatureComingSoonProps {
  title: string;
  description?: string;
}

/**
 * Placeholder shown in place of a feature that is built but not yet released.
 *
 * Rendered instead of the real page by a flag in `lib/feature-flags.ts`; the page it replaces is
 * untouched and still compiled.
 */
export function FeatureComingSoon({ title, description }: FeatureComingSoonProps) {
  return (
    <AppLayout>
      <div className="container py-16">
        <Card className="mx-auto max-w-xl border border-border bg-background p-10 text-center shadow-none">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-border text-accent">
            <Hammer className="h-6 w-6" />
          </span>
          <Badge variant="outline" className="mt-5">
            Under development
          </Badge>
          <h1 className="mt-4 font-display text-2xl font-bold">{title}</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            {description ?? "This feature is under development and will be rolled out soon."}
          </p>
        </Card>
      </div>
    </AppLayout>
  );
}
