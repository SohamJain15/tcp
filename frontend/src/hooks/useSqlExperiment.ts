import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { labApi } from "@/api/services";
import type { LabSqlRunResponse, LabSqlSubmitResponse, SqlResultSet } from "@/api/types";

/**
 * Run / submit for one SQL experiment, plus the editor and result state around them.
 *
 * "Run" shows the grid the query returns against a freshly seeded sandbox; "Submit" grades it
 * against the reference result. Both are synchronous — the SQL sandbox is fast, so unlike the
 * Judge0 coding path there is nothing to poll.
 *
 * Extracted from the original inline SQL workspace so the compact embedded editor and the
 * full-screen split workspace run the same logic rather than two copies of it.
 */
export interface SqlWorkspaceRunner {
  run: (sql: string) => Promise<LabSqlRunResponse>;
  submit: (sql: string) => Promise<LabSqlSubmitResponse | { saved: boolean }>;
  /** Overrides the Submit button label (e.g. "Save answer" inside a timed session). */
  submitLabel?: string;
}

export interface SqlExperimentMessage {
  tone: "ok" | "warn" | "err";
  text: string;
}

export interface UseSqlExperimentOptions {
  labId: string;
  experimentId: string;
  pathname: string;
  initialSql?: string;
  onSolved?: () => void;
  /** When set, run/submit go through these instead of the self-paced lab endpoints. */
  runner?: SqlWorkspaceRunner;
}

export function useSqlExperiment({
  labId,
  experimentId,
  pathname,
  initialSql,
  onSolved,
  runner,
}: UseSqlExperimentOptions) {
  const [sql, setSql] = useState(initialSql ?? "SELECT * FROM ");
  const [grid, setGrid] = useState<SqlResultSet | null>(null);
  const [message, setMessage] = useState<SqlExperimentMessage | null>(null);

  const runMutation = useMutation({
    mutationFn: () => (runner ? runner.run(sql) : labApi.runSql(labId, experimentId, sql, pathname)),
    onSuccess: (result) => {
      if (result.ok && result.result) {
        setGrid(result.result);
        setMessage(null);
      } else {
        setGrid(null);
        setMessage({ tone: "err", text: result.timedOut ? "Your query timed out." : result.error ?? "Query failed." });
      }
    },
    onError: (error: Error) => toast.error(error.message || "Could not run the query"),
  });

  const submitMutation = useMutation({
    mutationFn: () => (runner ? runner.submit(sql) : labApi.submitSql(labId, experimentId, sql, pathname)),
    onSuccess: (result) => {
      if ("passed" in result) {
        setGrid(result.result ?? null);
        if (result.passed) {
          setMessage({ tone: "ok", text: `Correct! Awarded ${result.awardedPoints}/${result.maxPoints} marks.` });
          onSolved?.();
        } else {
          setMessage({ tone: "warn", text: result.message ?? "Not quite — your result does not match." });
        }
      } else {
        // Session "Save": stored, graded after the window closes — no verdict shown now.
        setMessage({ tone: "ok", text: "Saved. Your query will be graded when the session ends." });
        onSolved?.();
      }
    },
    onError: (error: Error) => toast.error(error.message || "Could not submit"),
  });

  return {
    sql,
    setSql,
    grid,
    message,
    run: () => runMutation.mutate(),
    submit: () => submitMutation.mutate(),
    isRunning: runMutation.isPending,
    isSubmitting: submitMutation.isPending,
    busy: runMutation.isPending || submitMutation.isPending,
    submitLabel: runner?.submitLabel ?? "Submit",
  };
}
