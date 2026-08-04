import { EyeOff, Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FailedTestCase } from "@/api/types";

/**
 * Statuses where pointing at a specific test case actually helps.
 *
 * A compilation error never reaches a test case, and an internal error is our fault rather than
 * the student's — in both cases the existing stderr output is the useful signal.
 */
const DIAGNOSABLE_STATUSES = new Set(["WRONG_ANSWER", "RUNTIME_ERROR", "TIME_LIMIT_EXCEEDED"]);

export function shouldShowFailedTest(failedTest: FailedTestCase | null | undefined): boolean {
  return Boolean(failedTest && DIAGNOSABLE_STATUSES.has(failedTest.status));
}

function Field({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <pre
        className={cn(
          "max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-background p-2 font-mono-code text-xs",
          muted ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {value || <span className="text-muted-foreground">(empty)</span>}
      </pre>
    </div>
  );
}

/**
 * Shows the first test case a submission got wrong.
 *
 * The expected output is absent during contests and class tests. That is rendered as an explicit
 * locked note rather than an empty box, so a student reads it as "withheld" instead of "the
 * expected answer really was nothing".
 */
export function FailedTestCasePanel({ failedTest }: { failedTest: FailedTestCase }) {
  const hasExpected = failedTest.expectedOutput !== undefined;

  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
          <EyeOff className="h-3.5 w-3.5" />
          Failed on test case {failedTest.index + 1}
          {failedTest.isHidden && <span className="text-muted-foreground">(hidden)</span>}
        </div>
        {failedTest.truncated && (
          <span className="text-[11px] text-muted-foreground">truncated</span>
        )}
      </div>

      <div className="space-y-2">
        <Field label="Input" value={failedTest.input} />
        {hasExpected ? (
          <Field label="Expected output" value={failedTest.expectedOutput ?? ""} />
        ) : (
          <div className="flex items-center gap-1.5 rounded bg-background p-2 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            Expected output is hidden while the contest is running.
          </div>
        )}
        <Field label="Your output" value={failedTest.actualOutput} muted />
      </div>
    </div>
  );
}
