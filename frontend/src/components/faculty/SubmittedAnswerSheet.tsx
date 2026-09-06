import Editor from "@monaco-editor/react";

import { toLanguageLabel, toStatusLabel } from "@/api/mappers";
import type { ExecutableLanguage, SubmissionStatus, SupportedLanguage } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getMonacoLanguage } from "@/lib/code-editor";

/**
 * A student's submitted answer, shown to faculty.
 *
 * The editor is read-only but deliberately **not** clipboard-locked: a faculty member marking work
 * needs to be able to copy a query into a client, or a snippet into feedback. The lockdown exists
 * to stop a student importing an answer during an exam, which is not what is happening here.
 */
export interface SubmittedAnswerCodingAttempt {
  submissionId: string;
  status: string;
  language: string;
  passedCount: number;
  totalCount: number;
  runtimeMs: number;
  memoryKb: number;
  createdAt: string;
}

export interface SubmittedAnswerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Who wrote it — shown under the title so a sheet is never ambiguous about whose work it is. */
  subtitle?: string;
  loading?: boolean;
  /** Verdict / marks chips across the top. */
  facts?: { label: string; value: string; tone?: "ok" | "warn" | "muted" }[];
  /** The answer itself. `language` picks the Monaco mode; "sql" for a query. */
  body: { language: string; code: string } | null;
  emptyMessage?: string;
  history?: SubmittedAnswerCodingAttempt[];
  /**
   * Optional switcher across several answers by the same student — a lab session attempt covers
   * every experiment at once, so the sheet needs a way to move between them.
   */
  tabs?: { id: string; label: string }[];
  activeTabId?: string | null;
  onSelectTab?: (id: string) => void;
}

export function SubmittedAnswerSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  loading = false,
  facts = [],
  body,
  emptyMessage = "This student has not submitted an answer to this experiment.",
  history = [],
  tabs = [],
  activeTabId,
  onSelectTab,
}: SubmittedAnswerSheetProps) {
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  // The body may be SQL, which is not one of the judged languages the mappers know about.
  const monacoLanguage = body ? (body.language === "sql" ? "sql" : getMonacoLanguage(body.language as ExecutableLanguage)) : "plaintext";
  const languageLabel = (language: string) =>
    language === "sql" ? "SQL" : toLanguageLabel(language as SupportedLanguage);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 sm:max-w-2xl">
        <SheetHeader className="space-y-1 text-left">
          <SheetTitle className="pr-8">{title}</SheetTitle>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </SheetHeader>

        {tabs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab?.(tab.id)}
                className={
                  tab.id === activeTabId
                    ? "rounded border border-accent bg-accent/10 px-2 py-1 text-xs font-medium"
                    : "rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                }
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {facts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {facts.map((fact) => (
              <Badge
                key={fact.label}
                variant={fact.tone === "muted" ? "outline" : "secondary"}
                className={
                  fact.tone === "ok"
                    ? "rounded-none bg-emerald-600 text-white"
                    : fact.tone === "warn"
                      ? "rounded-none bg-amber-600 text-white"
                      : "rounded-none"
                }
              >
                {fact.label}: {fact.value}
              </Badge>
            ))}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : body ? (
          <div className="min-h-0 flex-1 overflow-hidden rounded border border-border">
            <Editor
              height="100%"
              language={monacoLanguage}
              theme={isDark ? "vs-dark" : "light"}
              value={body.code}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 13,
                wordWrap: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        )}

        {history.length > 0 && (
          <div className="shrink-0">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Earlier attempts
            </h3>
            <div className="max-h-40 overflow-y-auto rounded border border-border">
              <table className="w-full text-xs">
                <tbody>
                  {history.map((attempt) => (
                    <tr key={attempt.submissionId} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-1.5">{new Date(attempt.createdAt).toLocaleString()}</td>
                      <td className="px-3 py-1.5">{languageLabel(attempt.language)}</td>
                      <td className="px-3 py-1.5">{toStatusLabel(attempt.status as SubmissionStatus)}</td>
                      <td className="px-3 py-1.5 text-right">
                        {attempt.passedCount}/{attempt.totalCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
