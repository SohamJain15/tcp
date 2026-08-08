import { Link } from "react-router-dom";
import { Laptop } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface DesktopOnlyNoticeProps {
  /** Plural feature name, e.g. "contests" or "class tests". */
  feature: string;
  /** Where "Back" returns to — the list page, which stays usable on mobile. Omitted when inline. */
  backTo?: string;
  backLabel?: string;
  /**
   * Inline sits in place of an action (e.g. the "Start Test" button) without taking over the
   * whole screen, so the rest of the page — contest info, registration — stays usable. The
   * default full-page variant is for surfaces that must be blocked entirely, like the live
   * question page reached by direct URL.
   */
  inline?: boolean;
  /** Overrides the default explanatory line — useful for "resume on desktop" wording. */
  message?: string;
}

const DEFAULT_MESSAGE =
  "This runs in a locked full-screen window and is proctored — switching apps or leaving the " +
  "window counts as a violation and can submit your paper automatically. A phone cannot hold " +
  "that window open, so attempting on one would put your attempt at risk.";

/**
 * Shown when a phone or tablet reaches a proctored full-screen exam surface, or in place of the
 * action that would start one.
 *
 * A contest or class test locks the browser into fullscreen, watermarks the page and treats
 * leaving the window as a violation. A phone cannot hold that state — notifications, the
 * on-screen keyboard and app switching all break it, and iOS Safari has no fullscreen for web
 * pages at all. Rather than let a student start an attempt that would auto-submit through no
 * fault of their own, we stop them at the door.
 */
export function DesktopOnlyNotice({ feature, backTo, backLabel, inline, message }: DesktopOnlyNoticeProps) {
  const card = (
    <Card className="profile-card space-y-4 p-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
        <Laptop className="h-6 w-6 text-accent" />
      </div>

      <div>
        <h1 className="font-display text-xl font-bold">
          {inline ? "Open on a laptop to continue" : `Mobile mode is disabled for ${feature}`}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {inline
            ? `${feature} must be taken on a laptop or desktop.`
            : "Open this on a laptop or desktop to continue."}
        </p>
      </div>

      <p className="border border-border bg-muted/40 p-3 text-left text-sm text-muted-foreground">
        {message ?? DEFAULT_MESSAGE}
      </p>

      {backTo && (
        <Button asChild variant="outline" className="w-full">
          <Link to={backTo}>{backLabel ?? "Back"}</Link>
        </Button>
      )}
    </Card>
  );

  // Inline: drop into the surrounding page unchanged, so registration and info stay reachable.
  if (inline) {
    return card;
  }

  return (
    <AppLayout>
      <div className="container max-w-lg py-10">{card}</div>
    </AppLayout>
  );
}
