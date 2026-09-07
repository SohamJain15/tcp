import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

import {
  classroomApi,
  newRequestKey,
  type ClassroomDetail,
  type ClassroomSession,
  type ClassroomWork,
  type WorkOutput,
} from "@/api/classrooms";
import { toStatusLabel } from "@/api/mappers";
import type {
  FacultyLabExperiment,
  SqlScriptResult,
  SqlTableSnapshot,
  SubmissionStatus,
} from "@/api/types";
import { StatusBadge } from "@/components/Badges";
import { SchemaTables } from "@/components/SchemaTables";
import { SqlResultTable } from "@/components/SqlWorkspace";
import { SplitWorkspace } from "@/components/workspace/SplitWorkspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useIsNarrow } from "@/hooks/use-mobile";
import { configureCodeEditor, getMonacoLanguage } from "@/lib/code-editor";
import { cn } from "@/lib/utils";

const formatTime = (iso: string) =>
  `${new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST`;

/** Submit is the platform's accent action everywhere else; labs used the default (blue) variant. */
const ACCENT_ACTION = "bg-accent text-accent-foreground hover:bg-accent/90";

type ConsoleTab = "result" | "tables" | "checks";

export function LabWorkspace({
  classroomId,
  session,
  experimentId,
  mode,
  detail,
  refresh,
  onClose,
}: {
  classroomId: string;
  session: ClassroomSession;
  experimentId: string;
  mode: "official" | "practice";
  detail: ClassroomDetail;
  refresh: () => void;
  onClose: () => void;
}) {
  const experiment = session.experiments.find((e) => e.id === experimentId)!;
  const isSql = session.language === "sql";
  const isScript = isSql && experiment.sqlMode === "script";
  const editorLabel = isSql ? "Your SQL" : "Your code";

  const prior = detail.work
    .filter((w) => w.sessionId === session.id && w.experimentId === experimentId && w.mode === mode)
    .slice(-1)[0];
  const draft = detail.drafts.find(
    (d) => d.sessionId === session.id && d.experimentId === experimentId && d.mode === mode,
  );
  const [code, setCode] = useState(
    draft && (!prior || draft.updatedAt > prior.createdAt) ? draft.code : (prior?.code ?? ""),
  );
  const [lastWork, setLastWork] = useState<ClassroomWork | undefined>(prior);
  const [tab, setTab] = useState<ConsoleTab>("result");
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const isNarrow = useIsNarrow();

  useEffect(() => {
    if (!lastWork || lastWork.output) return;
    const completed = detail.work.find((work) => work.id === lastWork.id);
    if (completed?.output) setLastWork(completed);
  }, [detail.work, lastWork]);

  const writable = mode === "practice" ? session.computedStatus === "Ended" : session.computedStatus === "Active";

  const run = useMutation({
    mutationFn: (action: "run" | "submit" | "draft") =>
      classroomApi.work(classroomId, session.id, {
        requestKey: newRequestKey(),
        experimentId,
        mode,
        action,
        language: session.language,
        code,
      }),
    onSuccess: (response, action) => {
      if (response.work) setLastWork(response.work);
      refresh();
      // A script run puts the interesting part in the tables it built, not in a result grid.
      if (action !== "draft") setTab(isScript ? "tables" : "result");
      toast.success(
        action === "submit"
          ? mode === "official"
            ? "Experiment submitted · Performed"
            : "Practice saved"
          : action === "draft"
            ? "Draft saved"
            : "Execution finished",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const output = lastWork?.output ?? null;
  const stale = lastWork !== undefined && lastWork.code !== code;

  // Portalled to <body> because AppLayout's <main> carries `animate-fade-in`, whose transform
  // creates a stacking context — inside it the overlay's z-50 is trapped below the navbar's
  // sticky z-40, and the navbar bleeds through the top of the workspace.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label={experiment.title}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Badge variant="secondary">
            {mode === "official" ? "Official session" : "Practice · does not affect attendance or marks"}
          </Badge>
          <span className="truncate text-sm font-semibold">
            {experiment.number}. {experiment.title}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close workspace
        </Button>
      </header>

      <div className="min-h-0 flex-1">
        <SplitWorkspace
          autoSaveId="lab-workspace"
          stackedWorkHeight="100%"
          description={
            <LabDescription
              classroomId={classroomId}
              sessionId={session.id}
              experiment={experiment}
              language={session.language}
              isScript={isScript}
            />
          }
          editor={
            <Card className="flex h-full flex-col overflow-hidden shadow-card">
              <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
                <span className="text-xs font-semibold">{editorLabel}</span>
                <span className="font-mono-code text-[11px] uppercase text-muted-foreground">
                  {isScript ? "SQL script" : session.language}
                </span>
              </div>
              <div className="min-h-[240px] flex-1 bg-[hsl(220_50%_8%)]">
                <Editor
                  beforeMount={(monaco) => configureCodeEditor(monaco)}
                  onMount={(instance) => {
                    editorRef.current = instance;
                  }}
                  path={`${session.id}/${experimentId}/${mode}`}
                  height="100%"
                  language={getMonacoLanguage(session.language)}
                  theme="vs-dark"
                  value={code}
                  onChange={(next) => setCode(next ?? "")}
                  // The accessible name lives on the wrapper: Monaco's own textarea is an internal
                  // implementation detail with no stable label of its own.
                  wrapperProps={{ "aria-label": editorLabel }}
                  options={{
                    automaticLayout: true,
                    fontFamily: "var(--font-mono, 'Fira Code', monospace)",
                    fontLigatures: true,
                    fontSize: 14,
                    lineHeight: 24,
                    minimap: { enabled: false },
                    padding: { top: 12, bottom: 12 },
                    readOnly: !writable,
                    renderLineHighlight: "all",
                    scrollBeyondLastLine: false,
                    smoothScrolling: true,
                    tabSize: 2,
                    wordWrap: isNarrow ? "on" : "off",
                  }}
                />
              </div>
              {!writable && (
                <p className="border-t border-border px-3 py-1.5 text-xs text-destructive">
                  The session has ended. Your saved work remains available in history.
                </p>
              )}
            </Card>
          }
          statusLine={<WorkStatusLine output={output} stale={stale} pending={run.isPending} />}
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={!writable || run.isPending}
                onClick={() => run.mutate("draft")}
              >
                Save draft
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!writable || !code.trim() || run.isPending}
                onClick={() => run.mutate("run")}
              >
                Run
              </Button>
              <Button
                size="sm"
                className={ACCENT_ACTION}
                disabled={!writable || !code.trim() || run.isPending}
                onClick={() => run.mutate("submit")}
              >
                {run.isPending
                  ? "Saving / executing…"
                  : mode === "official"
                    ? "Submit experiment"
                    : "Save practice"}
              </Button>
            </>
          }
          console={
            <LabConsole
              output={output}
              isScript={isScript}
              tab={tab}
              onTabChange={setTab}
              createdAt={lastWork?.createdAt}
            />
          }
        />
      </div>
    </div>,
    document.body,
  );
}

function LabDescription({
  classroomId,
  sessionId,
  experiment,
  language,
  isScript,
}: {
  classroomId: string;
  sessionId: string;
  experiment: FacultyLabExperiment;
  language: string;
  isScript: boolean;
}) {
  return (
    <Card className="p-6 shadow-card">
      <h1 className="font-display text-2xl font-bold">
        {experiment.number}. {experiment.title}
      </h1>
      <p className="mt-1 text-xs text-muted-foreground">
        {experiment.points} points · Required language: {language}
        {isScript && " · write a full script"}
      </p>
      <pre className="mt-4 whitespace-pre-wrap break-words text-sm text-muted-foreground">{experiment.aim}</pre>

      {isScript && (
        <section className="mt-6">
          <h3 className="mb-1 font-display text-base font-semibold">How your work is checked</h3>
          {experiment.checkLabels && experiment.checkLabels.length > 0 ? (
            <>
              <p className="mb-2 text-xs text-muted-foreground">
                Your tables can be named anything — these are the conditions your finished database
                must satisfy. Your teacher sets the final mark.
              </p>
              <ul className="space-y-1 text-sm">
                {experiment.checkLabels.map((label, index) => (
                  <li key={index} className="flex gap-2 text-muted-foreground">
                    <span className="text-accent">•</span>
                    <span>{label}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your teacher will review this experiment and mark it themselves. Run your script to see
              the tables it creates.
            </p>
          )}
        </section>
      )}

      {experiment.schemaSql ? (
        <ExperimentSchema classroomId={classroomId} sessionId={sessionId} experiment={experiment} />
      ) : (
        isScript && (
          <section className="mt-6">
            <h3 className="mb-1 font-display text-base font-semibold">Starting point</h3>
            <p className="text-sm text-muted-foreground">
              You get an empty database of your own. Create the tables yourself.
            </p>
          </section>
        )
      )}

      {experiment.sampleTestCases && experiment.sampleTestCases.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-1 font-display text-base font-semibold">Sample Test Cases</h3>
          <div className="space-y-2">
            {experiment.sampleTestCases.map((sample, index) => (
              <div key={index} className="rounded border border-border p-3 text-xs">
                <div className="font-semibold text-accent">Input</div>
                <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono-code">
                  {sample.input}
                </pre>
                <div className="mt-2 font-semibold text-accent">Expected Output</div>
                <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono-code">
                  {sample.output}
                </pre>
              </div>
            ))}
          </div>
        </section>
      )}
    </Card>
  );
}

/**
 * The experiment's seeded tables.
 *
 * Normally free: the server computes the preview when the experiment is saved and ships it with the
 * experiment, so a whole batch opening the same experiment costs no sandbox runs. Experiments saved
 * before previews existed carry none, and only those fall back to asking the server to seed one.
 */
function ExperimentSchema({
  classroomId,
  sessionId,
  experiment,
}: {
  classroomId: string;
  sessionId: string;
  experiment: FacultyLabExperiment;
}) {
  const stored = experiment.schemaPreview;
  const preview = useQuery({
    queryKey: ["classroom-schema", classroomId, sessionId, experiment.id],
    queryFn: () => classroomApi.experimentSchema(classroomId, sessionId, experiment.id),
    enabled: stored === undefined,
    staleTime: Infinity,
    retry: false,
  });

  const tables = stored ?? (preview.data?.error ? undefined : preview.data?.tables);
  return (
    <SchemaTables
      tables={tables}
      schemaSql={experiment.schemaSql ?? ""}
      isLoading={stored === undefined && preview.isLoading}
      error={stored === undefined && (preview.isError || Boolean(preview.data?.error))}
      emptyMessage="This experiment starts with no tables."
    />
  );
}

/**
 * The one-line summary beside the console's collapse chevron. Uses the shared status badge rather
 * than printing the raw enum, so a lab reads the same as every other workspace on the platform.
 */
function WorkStatusLine({
  output,
  stale,
  pending,
}: {
  output: WorkOutput | null;
  stale: boolean;
  pending: boolean;
}) {
  if (pending) return <span>Executing…</span>;
  if (!output) return <span>Run your work to see the output here.</span>;
  const verdict = output.evaluationStatus ?? output.status;
  const label = verdict === "EXECUTED" ? "Ran Successfully" : toStatusLabel(verdict as SubmissionStatus);
  return (
    <span className="flex items-center gap-2">
      <StatusBadge status={label} />
      <span>{output.runtimeMs} ms</span>
      {stale && <span className="text-warning">· editor changed since this run</span>}
    </span>
  );
}

function LabConsole({
  output,
  isScript,
  tab,
  onTabChange,
  createdAt,
}: {
  output: WorkOutput | null;
  isScript: boolean;
  tab: ConsoleTab;
  onTabChange: (tab: ConsoleTab) => void;
  createdAt?: string;
}) {
  const script = output?.script;
  const tabs = useMemo(() => {
    if (!isScript) return [] as Array<{ id: ConsoleTab; label: string }>;
    const list: Array<{ id: ConsoleTab; label: string }> = [
      { id: "result", label: "Result" },
      { id: "tables", label: `Tables${script ? ` (${script.snapshot.length})` : ""}` },
    ];
    if (script?.checks?.length) list.push({ id: "checks", label: "Checks" });
    return list;
  }, [isScript, script]);

  if (!output) {
    return <p className="text-muted-foreground">Execution pending. Your work is saved.</p>;
  }

  const active = tabs.some((entry) => entry.id === tab) ? tab : "result";

  return (
    <div className="space-y-3">
      {createdAt && <p className="text-[11px] text-muted-foreground">Output from {formatTime(createdAt)}</p>}

      {tabs.length > 0 && (
        <div className="flex gap-1 border-b border-border">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onTabChange(entry.id)}
              className={cn(
                "border-b-2 px-3 py-1.5 text-xs font-semibold transition-colors",
                active === entry.id
                  ? "border-accent text-accent"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}

      {output.stderr && (
        <pre className="whitespace-pre-wrap break-words text-destructive">{output.stderr}</pre>
      )}

      {isScript && script ? (
        <>
          {active === "result" && <ScriptStatements script={script} />}
          {active === "tables" && <ScriptTables script={script} />}
          {active === "checks" && <ScriptChecks script={script} />}
        </>
      ) : output.table ? (
        <SqlResultTable result={output.table} />
      ) : (
        <pre className="whitespace-pre-wrap break-words">{output.stdout || "No standard output."}</pre>
      )}

      {output.truncated && <p className="text-muted-foreground">Output was truncated when captured.</p>}
    </div>
  );
}

/**
 * A saved run rendered outside the workspace — submission history and the faculty gradebook. No
 * tabs there, because the reader is scanning rather than working: everything stacks so the checks
 * and the tables the student actually built are visible at a glance.
 */
export function LabOutput({ output }: { output: WorkOutput | null }) {
  if (!output) {
    return <p className="text-sm text-muted-foreground">Execution pending. Your work is saved.</p>;
  }
  const script = output.script;
  const verdict = output.evaluationStatus ?? output.status;
  return (
    <div className="space-y-3 font-mono-code text-xs">
      <div className="flex items-center gap-2">
        <StatusBadge status={verdict === "EXECUTED" ? "Ran Successfully" : toStatusLabel(verdict as SubmissionStatus)} />
        <span className="text-muted-foreground">{output.runtimeMs} ms</span>
      </div>
      {output.stderr && <pre className="whitespace-pre-wrap break-words text-destructive">{output.stderr}</pre>}
      {script ? (
        <>
          {script.checks && script.checks.length > 0 && <ScriptChecks script={script} />}
          <ScriptTables script={script} />
        </>
      ) : output.table ? (
        <SqlResultTable result={output.table} />
      ) : (
        <pre className="whitespace-pre-wrap break-words">{output.stdout || "No standard output."}</pre>
      )}
      {output.truncated && <p className="text-muted-foreground">Output was truncated when captured.</p>}
    </div>
  );
}

/** Per-statement outcomes: a grid for a SELECT, a row count for a write, "OK" for DDL. */
function ScriptStatements({ script }: { script: SqlScriptResult }) {
  if (script.statements.length === 0) {
    return <p className="text-muted-foreground">Nothing ran.</p>;
  }
  return (
    <div className="space-y-3">
      {script.statements.map((statement, index) => (
        <div key={index} className="rounded border border-border">
          <div className="flex items-start gap-2 border-b border-border bg-secondary/40 px-3 py-1.5">
            <span className="shrink-0 text-muted-foreground">{index + 1}.</span>
            <code className="min-w-0 flex-1 break-words">{statement.sql}</code>
          </div>
          <div className="p-3">
            {statement.error ? (
              <p className="whitespace-pre-wrap break-words text-destructive">{statement.error}</p>
            ) : statement.result ? (
              <SqlResultTable result={statement.result} />
            ) : (
              <p className="text-muted-foreground">
                {statement.kind === "write"
                  ? `${statement.affectedRows ?? 0} row${statement.affectedRows === 1 ? "" : "s"} affected`
                  : "OK"}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The database the script left behind — the answer to "show me the actual tables". */
function ScriptTables({ script }: { script: SqlScriptResult }) {
  if (script.snapshot.length === 0) {
    return <p className="text-muted-foreground">Your database has no tables yet.</p>;
  }
  return (
    <div className="space-y-3">
      {script.snapshot.map((table) => (
        <TableSnapshot key={table.name} table={table} />
      ))}
      {script.snapshotTruncated && (
        <p className="text-muted-foreground">Only the first tables are shown.</p>
      )}
    </div>
  );
}

function TableSnapshot({ table }: { table: SqlTableSnapshot }) {
  return (
    <details open className="rounded border border-border">
      <summary className="cursor-pointer bg-secondary/40 px-3 py-1.5 font-semibold">
        {table.name}{" "}
        <span className="font-normal text-muted-foreground">
          · {table.rowCount} row{table.rowCount === 1 ? "" : "s"}
        </span>
      </summary>
      <div className="space-y-2 p-3">
        <p className="text-[11px] text-muted-foreground">
          {table.columns
            .map(
              (column) =>
                `${column.name} ${column.dataType}${column.nullable ? "" : " NOT NULL"}${column.key === "PRI" ? " PK" : column.key === "UNI" ? " UNIQUE" : column.key === "MUL" ? " KEY" : ""}`,
            )
            .join(" · ")}
        </p>
        <SqlResultTable
          result={{
            columns: table.columns.map((column) => column.name),
            rows: table.rows,
            truncated: table.truncated,
          }}
        />
      </div>
    </details>
  );
}

function ScriptChecks({ script }: { script: SqlScriptResult }) {
  const checks = script.checks ?? [];
  if (checks.length === 0) {
    return (
      <p className="text-muted-foreground">
        This experiment has no automatic checks — your teacher marks it directly.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {checks.map((check, index) => (
        <li key={index} className="flex items-start gap-2">
          {check.passed ? (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
          ) : (
            <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
          )}
          <span className="min-w-0">
            <span className={check.passed ? "" : "text-destructive"}>{check.label}</span>
            {!check.passed && check.detail && (
              <span className="block text-[11px] text-muted-foreground">{check.detail}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
