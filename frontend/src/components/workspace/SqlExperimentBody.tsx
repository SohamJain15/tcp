import { useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import type * as MonacoEditor from "monaco-editor";
import { Play, Send } from "lucide-react";
import { toast } from "sonner";

import { SqlResultTable } from "@/components/SqlWorkspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SplitWorkspace } from "@/components/workspace/SplitWorkspace";
import { useSqlExperiment, type SqlWorkspaceRunner } from "@/hooks/useSqlExperiment";
import { lockDownContestEditor } from "@/lib/code-editor";

/**
 * A SQL experiment in the same frame a coding experiment gets: the aim and schema on one side, the
 * query editor and its result grid on the other.
 *
 * Previously SQL was a 220px box with the schema hidden behind a disclosure and no statement pane
 * at all, which made a DBMS lab feel like a different, lesser product than a DSA lab. This renders
 * through {@link SplitWorkspace}, so the two are the same workspace with different innards.
 */
export interface SqlExperimentBodyProps {
  labId: string;
  experimentId: string;
  title: string;
  aim: string;
  points?: number;
  schemaSql?: string;
  pathname: string;
  initialSql?: string;
  onSolved?: () => void;
  runner?: SqlWorkspaceRunner;
  /** Exam surfaces block the clipboard; a self-paced lab does not. */
  lockClipboard?: boolean;
  clipboardSurfaceLabel?: string;
  readOnly?: boolean;
  autoSaveId?: string;
  stackedWorkHeight?: string;
}

export function SqlExperimentBody({
  labId,
  experimentId,
  title,
  aim,
  points,
  schemaSql,
  pathname,
  initialSql,
  onSolved,
  runner,
  lockClipboard = false,
  clipboardSurfaceLabel = "lab session",
  readOnly = false,
  autoSaveId,
  stackedWorkHeight = "70vh",
}: SqlExperimentBodyProps) {
  const editorLockRef = useRef<(() => void) | null>(null);
  const [isDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  const { sql, setSql, grid, message, run, submit, isRunning, isSubmitting, busy, submitLabel } = useSqlExperiment({
    labId,
    experimentId,
    pathname,
    initialSql,
    onSolved,
    runner,
  });

  return (
    <SplitWorkspace
      autoSaveId={autoSaveId}
      stackedWorkHeight={stackedWorkHeight}
      statusLine={
        message ? (
          <span
            className={
              message.tone === "ok"
                ? "text-emerald-600"
                : message.tone === "warn"
                  ? "text-amber-600"
                  : "text-destructive"
            }
          >
            {message.text}
          </span>
        ) : (
          "Run to see your result, or Submit to have it graded."
        )
      }
      description={
        <Card className="p-6 shadow-card">
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          <pre className="mt-4 whitespace-pre-wrap break-words text-sm text-muted-foreground">{aim}</pre>

          {typeof points === "number" && (
            <p className="mt-4 text-sm text-muted-foreground">
              Worth <span className="font-semibold text-foreground">{points}</span> marks.
            </p>
          )}

          {schemaSql && (
            <section className="mt-6">
              <h3 className="mb-1 font-display text-base font-semibold">Schema</h3>
              {/* Shown outright rather than behind a disclosure: you cannot write a query without
                  the table and column names in front of you. */}
              <pre className="overflow-x-auto rounded border border-border bg-muted/40 p-3 text-xs">{schemaSql}</pre>
            </section>
          )}
        </Card>
      }
      editor={
        <Card className="flex h-full flex-col overflow-hidden shadow-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="rounded-md bg-secondary px-3 py-1.5 text-sm text-secondary-foreground">query.sql</div>
            <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => setSql("SELECT * FROM ")}>
              Reset
            </Button>
          </div>
          <div className="min-h-[180px] flex-1">
            <Editor
              height="100%"
              language="sql"
              theme={isDark ? "vs-dark" : "light"}
              value={sql}
              onMount={(editor: MonacoEditor.editor.IStandaloneCodeEditor, monaco) => {
                editorLockRef.current?.();
                // The SQL editor was previously never locked down, so a proctored lab session
                // blocked the clipboard in the coding editor and left it wide open here.
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
                automaticLayout: true,
                wordWrap: "on",
                scrollBeyondLastLine: false,
                contextmenu: !lockClipboard,
                readOnly,
              }}
            />
          </div>
        </Card>
      }
      actions={
        <>
          <Button variant="secondary" disabled={busy || readOnly} onClick={run}>
            <Play className="mr-2 h-4 w-4" /> {isRunning ? "Running…" : "Run"}
          </Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            disabled={busy || readOnly}
            onClick={submit}
          >
            <Send className="mr-2 h-4 w-4" /> {isSubmitting ? "Saving…" : submitLabel}
          </Button>
        </>
      }
      console={
        grid ? (
          <SqlResultTable result={grid} />
        ) : (
          <pre className="whitespace-pre-wrap text-muted-foreground">{"-- your result grid will appear here"}</pre>
        )
      }
    />
  );
}
