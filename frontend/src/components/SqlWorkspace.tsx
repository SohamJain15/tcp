import { useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import type * as MonacoEditor from "monaco-editor";
import { toast } from "sonner";

import type { SqlResultSet } from "@/api/types";
import { Button } from "@/components/ui/button";
import { useSqlExperiment, type SqlWorkspaceRunner } from "@/hooks/useSqlExperiment";
import { lockDownContestEditor } from "@/lib/code-editor";

/**
 * The compact student workspace for a single SQL experiment, used where a full split workspace does
 * not fit — inside a proctored lab session's question list.
 *
 * The full-screen equivalent, with a statement pane and a resizable result console, is
 * {@link import("@/components/workspace/SqlExperimentBody").SqlExperimentBody}. Both drive the same
 * `useSqlExperiment` hook, so run/submit behaviour cannot drift between them.
 */
export type { SqlWorkspaceRunner } from "@/hooks/useSqlExperiment";

export interface SqlWorkspaceProps {
  labId: string;
  experimentId: string;
  schemaSql?: string;
  pathname: string;
  initialSql?: string;
  onSolved?: () => void;
  /** When set, run/submit go through these instead of the self-paced lab endpoints. */
  runner?: SqlWorkspaceRunner;
  /** Exam surfaces block the clipboard; a self-paced lab does not. */
  lockClipboard?: boolean;
  clipboardSurfaceLabel?: string;
}

export function SqlWorkspace({
  labId,
  experimentId,
  schemaSql,
  pathname,
  initialSql,
  onSolved,
  runner,
  lockClipboard = false,
  clipboardSurfaceLabel = "lab session",
}: SqlWorkspaceProps) {
  const [showSchema, setShowSchema] = useState(false);
  const editorLockRef = useRef<(() => void) | null>(null);
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const { sql, setSql, grid, message, run, submit, isRunning, isSubmitting, busy, submitLabel } = useSqlExperiment({
    labId,
    experimentId,
    pathname,
    initialSql,
    onSolved,
    runner,
  });

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
          onMount={(editor: MonacoEditor.editor.IStandaloneCodeEditor, monaco) => {
            editorLockRef.current?.();
            // Previously absent: a proctored lab session locked the coding editor's clipboard and
            // left the SQL editor wide open.
            editorLockRef.current = lockClipboard
              ? lockDownContestEditor(editor, monaco, () =>
                  toast.info(`Copy, cut and paste are disabled during the ${clipboardSurfaceLabel}.`),
                )
              : null;
          }}
          onChange={(value) => setSql(value ?? "")}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            contextmenu: !lockClipboard,
          }}
        />
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={run}>
          {isRunning ? "Running…" : "Run"}
        </Button>
        <Button type="button" size="sm" disabled={busy} onClick={submit}>
          {isSubmitting ? "Saving…" : submitLabel}
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
