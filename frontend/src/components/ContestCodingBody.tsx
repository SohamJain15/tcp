import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import type * as MonacoEditor from "monaco-editor";
import { Play, Send } from "lucide-react";
import { toast } from "sonner";

import { submissionsApi } from "@/api/services";
import { FailedTestCasePanel, shouldShowFailedTest } from "@/components/FailedTestCasePanel";
import { EXECUTABLE_LANGUAGES, toLanguageLabel, toStatusLabel } from "@/api/mappers";
import type { ExecutableLanguage, Submission, SubmissionLanguage, SubmissionResult } from "@/api/types";
import { SqlResultTable } from "@/components/SqlWorkspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThemedSelect } from "@/components/ThemedSelect";
import { CodingDescription } from "@/components/workspace/CodingDescription";
import { SplitWorkspace } from "@/components/workspace/SplitWorkspace";
import type {
  CodingWorkspaceApi,
  CodingWorkspaceInput,
  CodingWorkspaceQuestion,
} from "@/components/workspace/types";
import { useContestCodeDrafts } from "@/hooks/useContestCodeDrafts";
import {
  configureCodeEditor,
  formatCodeInEditor,
  getMonacoLanguage,
  lockDownContestEditor,
  supportsFullFormatting,
} from "@/lib/code-editor";
import { pollSubmissionUntilComplete } from "@/pages/student/submissionPolling";

const STARTER_TEMPLATES: Partial<Record<ExecutableLanguage, string>> = {
  c: `// main.c\n#include <stdio.h>\n\nint main(void) {\n    return 0;\n}\n`,
  cpp: `// Solution.cpp\n#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    return 0;\n}\n`,
  csharp: `// Program.cs\nusing System;\n\npublic class Program {\n    public static void Main(string[] args) {\n    }\n}\n`,
  dart: `// main.dart\nvoid main() {\n}\n`,
  go: `// main.go\npackage main\n\nimport "fmt"\n\nfunc main() {\n    _ = fmt.Sprintf("")\n}\n`,
  java: `// Main.java\nimport java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n    }\n}\n`,
  python: `# solution.py\ndef solve():\n    pass\n\nif __name__ == "__main__":\n    solve()\n`,
  javascript: `// solution.js\nfunction solve() {\n}\n\nsolve();\n`,
  kotlin: `// Main.kt\nfun main() {\n}\n`,
  php: `<?php\n\nfunction solve(): void\n{\n}\n\nsolve();\n`,
  ruby: `# main.rb\ndef solve\nend\n\nsolve\n`,
  rust: `// main.rs\nfn main() {\n}\n`,
  scala: `// Main.scala\nobject Main {\n  def main(args: Array[String]): Unit = {\n  }\n}\n`,
  swift: `// main.swift\nfunc solve() {\n}\n\nsolve()\n`,
  typescript: `// solution.ts\nfunction solve(): void {\n}\n\nsolve();\n`,
};

function getStarterCode(language: SubmissionLanguage): string {
  if (language === "sql") return "-- Write your SQL query here\n";
  return STARTER_TEMPLATES[language] ?? `// Start coding in ${language}\n`;
}

function getFileExtension(language: SubmissionLanguage): string {
  if (language === "sql") return "sql";
  const map: Partial<Record<ExecutableLanguage, string>> = {
    c: "c", cpp: "cpp", csharp: "cs", dart: "dart", php: "php", java: "java", python: "py",
    javascript: "js", ruby: "rb", scala: "scala", swift: "swift", typescript: "ts", go: "go",
    kotlin: "kt", rust: "rs",
  };
  return map[language] ?? language;
}

const DRAFT_AUTOSAVE_DELAY_MS = 1000;

export type {
  CodingWorkspaceApi,
  CodingWorkspaceInput,
  CodingWorkspaceQuestion,
} from "@/components/workspace/types";

interface ContestCodingBodyProps {
  /** Namespaces the per-question sessionStorage drafts; any stable id works. */
  contestId: string;
  questionId: string;
  pathname: string;
  question: CodingWorkspaceQuestion;
  attemptIsActive: boolean;
  /**
   * Whether copy / cut / paste are blocked inside the editor.
   *
   * Deliberately separate from `attemptIsActive`, which governs read-only and whether the buttons
   * work. A self-paced lab is "active" — the student is expected to type and submit — but it is not
   * an exam, so clipboard lockdown there is wrong. Defaults to `attemptIsActive`, so every caller
   * that predates this prop keeps exactly today's behaviour.
   */
  lockClipboard?: boolean;
  /** Wording in the lockdown toast: "…disabled during the {label}." */
  clipboardSurfaceLabel?: string;
  /** Refetch the attempt so the nav reflects the new "attempted" status after a submit. */
  onAfterSubmit: () => void;
  codingApi: CodingWorkspaceApi;
  /** Persists the pane split for this surface, per tab. */
  autoSaveId?: string;
  /** Height the work pane gets when stacked on mobile. Full-screen shells pass "100%". */
  stackedWorkHeight?: string;
}

/**
 * The coding workspace for one question. Mounted **keyed by questionId** so each question has its own
 * fresh run/verdict state, with the code itself persisted per question+language via sessionStorage.
 * Submit judges against every test case, shows the verdict, and stays fully editable and
 * resubmittable — nothing locks until the whole contest is submitted.
 */
export function ContestCodingBody({
  contestId,
  questionId,
  pathname,
  question,
  attemptIsActive,
  lockClipboard,
  clipboardSurfaceLabel = "contest",
  onAfterSubmit,
  codingApi,
  autoSaveId,
  stackedWorkHeight = "80vh",
}: ContestCodingBodyProps) {
  const editorRef = useRef<MonacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const editorLockRef = useRef<(() => void) | null>(null);
  const { getDraft, setDraft, getLanguage, setLanguage: persistLanguage } = useContestCodeDrafts(contestId);
  const autoSaveTimerRef = useRef<number | null>(null);
  const shouldLockClipboard = lockClipboard ?? attemptIsActive;

  // A question may restrict which languages it accepts (class tests do; contests offer all).
  const availableLanguages: SubmissionLanguage[] = question.kind === "sql"
    ? ["sql"]
    : question.supportedLanguages && question.supportedLanguages.length > 0
      ? question.supportedLanguages
      : (EXECUTABLE_LANGUAGES as ExecutableLanguage[]);

  // Reopen the question in whatever language it was last written in, otherwise a student who wrote
  // Python and navigated away would come back to an empty default-language editor. A remembered
  // language the question no longer allows is ignored.
  const [language, setLanguage] = useState<SubmissionLanguage>(() => {
    const remembered = getLanguage(questionId) as SubmissionLanguage | null;
    if (remembered && availableLanguages.includes(remembered)) {
      return remembered;
    }
    return availableLanguages[0] ?? ("cpp" as ExecutableLanguage);
  });
  // Per-language edits for this question, seeded from the persisted draft.
  const [drafts, setDrafts] = useState<Partial<Record<SubmissionLanguage, string>>>({});
  const [runResult, setRunResult] = useState<SubmissionResult | null>(null);
  const [verdict, setVerdict] = useState<Submission | null>(null);

  const code = drafts[language] ?? getDraft(questionId, language) ?? getStarterCode(language);

  const changeLanguage = (next: SubmissionLanguage) => {
    setLanguage(next);
    persistLanguage(questionId, next);
  };

  const setCode = (value: string) => {
    setDrafts((current) => ({ ...current, [language]: value }));
    setDraft(questionId, language, value);

    // Mirror the code to the server (debounced) so it is auto-submitted for the student if the
    // attempt ends without them pressing Submit. Untouched starter templates are never sent, which
    // is what keeps never-attempted questions out of the auto-submit set.
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    if (!attemptIsActive || value === getStarterCode(language)) {
      return;
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      void codingApi
        .saveDraft({ questionId, code: value, language })
        .catch(() => {
          // Best-effort: the local draft is still safe in sessionStorage.
        });
    }, DRAFT_AUTOSAVE_DELAY_MS);
  };

  useEffect(
    () => () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    },
    [],
  );

  const runMutation = useMutation({
    mutationFn: () => codingApi.run({ questionId, code, language }),
    onSuccess: (response) => {
      setRunResult(response.result);
      setVerdict(null);
      toast.success("Sample run completed");
    },
    onError: (error) => {
      toast.error((error as Error)?.message || "Run failed");
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const receipt = await codingApi.submit({ questionId, code, language });
      // Wait for the judge so we can show a real verdict + pass count against all test cases.
      return pollSubmissionUntilComplete(receipt.submissionId, (id) =>
        submissionsApi.getById(id, pathname).then((envelope) => envelope.submission),
      );
    },
    onSuccess: (submission) => {
      setVerdict(submission);
      setRunResult(null);
      onAfterSubmit();
      toast.success("Submitted and judged. You can keep editing and resubmit.");
    },
    onError: (error) => {
      toast.error((error as Error)?.message || "Submission failed");
    },
  });

  const busy = runMutation.isPending || submitMutation.isPending;

  const statusLine = useMemo(() => {
    if (runResult) {
      return question.kind === "sql"
        ? `${runResult.status === "ACCEPTED" ? "Query ran successfully" : toStatusLabel(runResult.status)} · Runtime ${runResult.runtimeMs} ms`
        : `${runResult.status === "ACCEPTED" ? "Ran Successfully" : toStatusLabel(runResult.status)} · Runtime ${runResult.runtimeMs} ms · Memory ${Math.max(runResult.memoryKb / 1024, 0).toFixed(1)} MB`;
    }
    if (submitMutation.isPending) {
      return "Judging against all test cases…";
    }
    if (verdict) {
      return `${toStatusLabel(verdict.status)} · ${verdict.passedCount}/${verdict.totalCount} test cases passed`;
    }
    return question.kind === "sql" ? "Run your query, or Submit to compare its result with the expected result." : "Run against sample cases, or Submit to judge against all test cases.";
  }, [question.kind, runResult, submitMutation.isPending, verdict]);

  const output = runResult ?? verdict;

  return (
    <SplitWorkspace
      autoSaveId={autoSaveId}
      stackedWorkHeight={stackedWorkHeight}
      statusLine={statusLine}
      description={<><CodingDescription question={question} />{question.kind === "sql" && question.sqlSchema && <Card className="m-4 p-4"><h3 className="mb-2 font-semibold">Database schema and seed data</h3><pre className="whitespace-pre-wrap font-mono-code text-xs">{question.sqlSchema}</pre></Card>}</>}
      editor={
        <Card className="flex h-full flex-col overflow-hidden shadow-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="flex items-center gap-2">
              {availableLanguages.length > 1 ? (
                <ThemedSelect
                  value={language}
                  onValueChange={(value) => changeLanguage(value as SubmissionLanguage)}
                  disabled={!attemptIsActive}
                  triggerClassName="h-9 w-auto min-w-[130px] text-sm"
                  options={availableLanguages.map((supportedLanguage) => ({
                    value: supportedLanguage,
                    label: toLanguageLabel(supportedLanguage),
                  }))}
                />
              ) : (
                // Exactly one allowed language: a dropdown with a single item is just noise.
                <div className="rounded-md bg-secondary px-3 py-1.5 text-sm text-secondary-foreground">
                  {toLanguageLabel(language)}
                </div>
              )}
              <div className="rounded-md bg-secondary px-3 py-1.5 text-sm text-secondary-foreground">
                Main.{getFileExtension(language)}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (!editorRef.current) return;
                try {
                  await formatCodeInEditor(editorRef.current, language);
                  toast.success(
                    language === "sql"
                      ? "Cleaned up spacing — SQL is not reformatted"
                      : supportsFullFormatting(language)
                        ? "Code formatted"
                        : `${toLanguageLabel(language)} is indentation-sensitive — cleaned up spacing only`,
                  );
                } catch (error) {
                  toast.error((error as Error).message || "Format failed");
                }
              }}
            >
              Format
            </Button>
          </div>

          <div className="min-h-[200px] flex-1">
            <Editor
              height="100%"
              language={getMonacoLanguage(language)}
              theme="vs-dark"
              value={code}
              onMount={(editor, monaco) => {
                editorRef.current = editor;
                configureCodeEditor(monaco);
                editorLockRef.current?.();
                editorLockRef.current = shouldLockClipboard
                  ? lockDownContestEditor(editor, monaco, () =>
                      toast.info(`Copy, cut and paste are disabled during the ${clipboardSurfaceLabel}.`),
                    )
                  : null;
                editor.focus();
              }}
              onChange={(value) => setCode(value ?? "")}
              options={{
                fontSize: 15,
                minimap: { enabled: false },
                automaticLayout: true,
                wordWrap: "on",
                scrollBeyondLastLine: false,
                fontFamily: "JetBrains Mono, monospace",
                tabSize: 2,
                formatOnPaste: false,
                // The right-click menu is a clipboard bypass while locked down; elsewhere it is
                // simply not part of this editor's affordances.
                contextmenu: !shouldLockClipboard,
                readOnly: !attemptIsActive,
              }}
            />
          </div>
        </Card>
      }
      actions={
        <>
          <Button variant="secondary" onClick={() => runMutation.mutate()} disabled={!attemptIsActive || busy}>
            <Play className="mr-2 h-4 w-4" /> {runMutation.isPending ? "Running..." : "Run"}
          </Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => submitMutation.mutate()}
            disabled={!attemptIsActive || busy}
          >
            <Send className="mr-2 h-4 w-4" /> {submitMutation.isPending ? "Submitting..." : "Submit"}
          </Button>
        </>
      }
      console={
        <>
          {output?.sqlResult && <SqlResultTable result={output.sqlResult} />}
          {shouldShowFailedTest(output?.failedTest) && <FailedTestCasePanel failedTest={output!.failedTest!} />}
          {output && (output.stdout || output.stderr) ? (
            <>
              {output.stdout && <pre className="whitespace-pre-wrap break-words">{output.stdout}</pre>}
              {output.stderr && <pre className="whitespace-pre-wrap break-words text-destructive">{output.stderr}</pre>}
            </>
          ) : (
            <pre className="whitespace-pre-wrap text-muted-foreground">{"// stdout and stderr will appear here"}</pre>
          )}
        </>
      }
    />
  );
}
