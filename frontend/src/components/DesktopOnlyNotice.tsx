import { Link } from "react-router-dom";
import { Laptop } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface DesktopOnlyNoticeProps {
  /** Plural feature name, e.g. "contests" or "class tests". */
  feature: string;
  /** Where "Back" returns to — the list page, which stays usable on mobile. */
  backTo: string;
  backLabel: string;
}

/**
 * Shown when a phone or tablet opens a contest or a class test.
 *
 * Both are full-screen proctored exams: they lock the browser into fullscreen, watermark the
 * page and treat leaving the window as a violation that can auto-submit the attempt. A phone
 * cannot hold that state — notifications, the on-screen keyboard and app switching all break it,
 * and iOS Safari has no fullscreen for web pages at all. Rather than let a student start an
 * attempt that would auto-submit through no fault of their own, we stop them at the door.
 */
export function DesktopOnlyNotice({ feature, backTo, backLabel }: DesktopOnlyNoticeProps) {
  return (
    <AppLayout>
      <div className="container max-w-lg py-10">
        <Card className="profile-card space-y-4 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
            <Laptop className="h-6 w-6 text-accent" />
          </div>

          <div>
            <h1 className="font-display text-xl font-bold">Mobile mode is disabled for {feature}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Open this on a laptop or desktop to continue.
            </p>
          </div>

          <p className="border border-border bg-muted/40 p-3 text-left text-sm text-muted-foreground">
            {feature === "contests" ? "Contests" : "Class tests"} run in a locked full-screen window
            and are proctored — switching apps or leaving the window counts as a violation and can
            submit your paper automatically. A phone cannot hold that window open, so attempting on
            one would put your attempt at risk.
          </p>

          <Button asChild variant="outline" className="w-full">
            <Link to={backTo}>{backLabel}</Link>
          </Button>
        </Card>
      </div>
    </AppLayout>
  );
}
