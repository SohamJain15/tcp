import { useState } from "react";
import Editor from "@monaco-editor/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { labApi } from "@/api/services";
import type { SqlResultSet } from "@/api/types";
import { Button } from "@/components/ui/button";

/**
 * The student workspace for a single SQL experiment.
 *
 * "Run" shows the grid the query returns against a freshly seeded sandbox; "Submit" grades it
 * against the reference result. Both are synchronous — the SQL sandbox is fast, so unlike the
 * Judge0 coding path there is nothing to poll.
 */
export interface SqlWorkspaceProps {
  labId: string;
  experimentId: string;
  schemaSql?: string;
  pathname: string;
  initialSql?: string;
  onSolved?: () => void;
}

export function SqlWorkspace({ labId, experimentId, schemaSql, pathname, initialSql, onSolved }: SqlWorkspaceProps) {
  const [sql, setSql] = useState(initialSql ?? "SELECT * FROM ");
  const [grid, setGrid] = useState<SqlResultSet | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);
  const [showSchema, setShowSchema] = useState(false);
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  const runMutation = useMutation({
    mutationFn: () => labApi.runSql(labId, experimentId, sql, pathname),
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
    mutationFn: () => labApi.submitSql(labId, experimentId, sql, pathname),
    onSuccess: (result) => {
      setGrid(result.result ?? null);
      if (result.passed) {
        setMessage({ tone: "ok", text: `Correct! Awarded ${result.awardedPoints}/${result.maxPoints} marks.` });
        onSolved?.();
      } else {
        setMessage({ tone: "warn", text: result.message ?? "Not quite — your result does not match." });
      }
    },
    onError: (error: Error) => toast.error(error.message || "Could not submit"),
  });

  const busy = runMutation.isPending || submitMutation.isPending;

  return (
    <div className="space-y-3">
      {schemaSql && (
        <div className="rounded border border-border">
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            onClick={() => setShowSchema((open) => !open)}
          >
            Schema {showSchema ? "▾" : "▸"}
          </button>
          {showSchema && (
            <pre className="overflow-x-auto border-t border-border bg-muted/40 p-3 text-xs">{schemaSql}</pre>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded border border-border">
        <Editor
          height="220px"
          language="sql"
          theme={isDark ? "vs-dark" : "light"}
          value={sql}
          onChange={(value) => setSql(value ?? "")}
          options={{ minimap: { enabled: false }, fontSize: 14, lineNumbers: "on", scrollBeyondLastLine: false }}
        />
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => runMutation.mutate()}>
          {runMutation.isPending ? "Running…" : "Run"}
        </Button>
        <Button type="button" size="sm" disabled={busy} onClick={() => submitMutation.mutate()}>
          {submitMutation.isPending ? "Submitting…" : "Submit"}
        </Button>
      </div>

      {message && (
        <p
          className={
            message.tone === "ok"
              ? "text-sm font-medium text-emerald-600"
              : message.tone === "warn"
                ? "text-sm font-medium text-amber-600"
                : "text-sm font-medium text-destructive"
          }
        >
          {message.text}
        </p>
      )}

      {grid && <SqlResultTable result={grid} />}
    </div>
  );
}

export function SqlResultTable({ result }: { result: SqlResultSet }) {
  if (result.columns.length === 0) {
    return <p className="text-sm text-muted-foreground">Query ran, but returned no columns.</p>;
  }
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50">
            {result.columns.map((column, index) => (
              <th key={index} className="border-b border-border px-3 py-1.5 text-left font-semibold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="odd:bg-muted/20">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border-b border-border px-3 py-1.5 font-mono-code">
                  {cell === null ? <span className="text-muted-foreground italic">NULL</span> : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.truncated && (
        <p className="px-3 py-1.5 text-xs text-muted-foreground">Showing the first {result.rows.length} rows.</p>
      )}
      {result.rows.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No rows.</p>}
    </div>
  );
}
