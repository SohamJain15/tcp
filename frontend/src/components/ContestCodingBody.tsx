import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import type * as MonacoEditor from "monaco-editor";
import { Play, Send } from "lucide-react";
import { toast } from "sonner";

import { contestsApi, submissionsApi } from "@/api/services";
import { EXECUTABLE_LANGUAGES, toLanguageLabel, toStatusLabel } from "@/api/mappers";
import type {
  CodingContestQuestionDetail,
  ContestAttempt,
  ExecutableLanguage,
  Submission,
  SubmissionResult,
} from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThemedSelect } from "@/components/ThemedSelect";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useContestCodeDrafts } from "@/hooks/useContestCodeDrafts";
import {
  configureCodeEditor,
  formatCodeInEditor,
  getMonacoLanguage,
  lockDownContestEditor,
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

function getStarterCode(language: ExecutableLanguage): string {
  return STARTER_TEMPLATES[language] ?? `// Start coding in ${language}\n`;
}

function getFileExtension(language: ExecutableLanguage): string {
  const map: Partial<Record<ExecutableLanguage, string>> = {
    c: "c", cpp: "cpp", csharp: "cs", dart: "dart", php: "php", java: "java", python: "py",
    javascript: "js", ruby: "rb", scala: "scala", swift: "swift", typescript: "ts", go: "go",
    kotlin: "kt", rust: "rs",
  };
  return map[language] ?? language;
}

interface ContestCodingBodyProps {
  contestId: string;
  questionId: string;
  pathname: string;
  question: CodingContestQuestionDetail;
  attempt: ContestAttempt | null;
  attemptIsActive: boolean;
  /** Refetch the attempt so the nav reflects the new "attempted" status after a submit. */
  onAfterSubmit: () => void;
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
  attempt,
  attemptIsActive,
  onAfterSubmit,
}: ContestCodingBodyProps) {
  const editorRef = useRef<MonacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const editorLockRef = useRef<(() => void) | null>(null);
  const { getDraft, setDraft } = useContestCodeDrafts(contestId);

  const [language, setLanguage] = useState<ExecutableLanguage>(
    (EXECUTABLE_LANGUAGES[0] ?? "cpp") as ExecutableLanguage,
  );
  // Per-language edits for this question, seeded from the persisted draft.
  const [drafts, setDrafts] = useState<Partial<Record<ExecutableLanguage, string>>>({});
  const [runResult, setRunResult] = useState<SubmissionResult | null>(null);
  const [verdict, setVerdict] = useState<Submission | null>(null);

  const code = drafts[language] ?? getDraft(questionId, language) ?? getStarterCode(language);

  const setCode = (value: string) => {
    setDrafts((current) => ({ ...current, [language]: value }));
    setDraft(questionId, language, value);
  };

  const runMutation = useMutation({
    mutationFn: () => contestsApi.runCodingQuestion(contestId, { questionId, code, language }, pathname),
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
      const receipt = await contestsApi.submitCodingQuestion(contestId, { questionId, code, language }, pathname);
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
      return `${runResult.status === "ACCEPTED" ? "Ran Successfully" : toStatusLabel(runResult.status)} · Runtime ${runResult.runtimeMs} ms · Memory ${Math.max(runResult.memoryKb / 1024, 0).toFixed(1)} MB`;
    }
    if (submitMutation.isPending) {
      return "Judging against all test cases…";
    }
    if (verdict) {
      return `${toStatusLabel(verdict.status)} · ${verdict.passedCount}/${verdict.totalCount} test cases passed`;
    }
    return "Run against sample cases, or Submit to judge against all test cases.";
  }, [runResult, submitMutation.isPending, verdict]);

  const output = runResult ?? verdict;

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full min-w-0 overflow-hidden">
      <ResizablePanel defaultSize={40} minSize={28} className="h-full">
        <div className="relative h-full w-full">
          <div className="absolute inset-0 overflow-y-auto p-6">
            <Card className="p-6 shadow-card">
              <h1 className="font-display text-2xl font-bold">{question.title}</h1>
              <pre className="mt-4 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                {question.problemStatement}
              </pre>

              <section className="mt-6 space-y-5 text-sm leading-relaxed">
                <div>
                  <h3 className="mb-1 font-display text-base font-semibold">Constraints</h3>
                  <pre className="whitespace-pre-wrap break-words text-muted-foreground">{question.constraints}</pre>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="mb-1 font-display text-base font-semibold">Input Format</h3>
                    <pre className="whitespace-pre-wrap break-words text-muted-foreground">{question.inputFormat}</pre>
                  </div>
                  <div>
                    <h3 className="mb-1 font-display text-base font-semibold">Output Format</h3>
                    <pre className="whitespace-pre-wrap break-words text-muted-foreground">{question.outputFormat}</pre>
                  </div>
                </div>
                <div>
                  <h3 className="mb-1 font-display text-base font-semibold">Sample Test Cases</h3>
                  <div className="space-y-2">
                    {question.sampleTestCases.map((testCase, index) => (
                      <div key={`${question.id}-${index}`} className="rounded border border-border p-3">
                        <div className="mb-1 text-xs font-semibold">Case {index + 1}</div>
                        <div className="text-xs">
                          <div className="font-semibold text-accent">Input</div>
                          <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono-code text-foreground">
                            {testCase.input}
                          </pre>
                        </div>
                        <div className="mt-2 text-xs">
                          <div className="font-semibold text-accent">Expected Output</div>
                          <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono-code text-foreground">
                            {testCase.output}
                          </pre>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </Card>
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle className="bg-border" />

      <ResizablePanel defaultSize={60} minSize={30} className="flex h-full flex-col overflow-hidden">
        <div className="flex h-full min-h-0 flex-col gap-3 p-3">
          <Card className="overflow-hidden shadow-card">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <ThemedSelect
                  value={language}
                  onValueChange={(value) => setLanguage(value as ExecutableLanguage)}
                  disabled={!attemptIsActive}
                  triggerClassName="h-9 w-auto min-w-[130px] text-sm"
                  options={EXECUTABLE_LANGUAGES.map((supportedLanguage) => ({
                    value: supportedLanguage,
                    label: toLanguageLabel(supportedLanguage),
                  }))}
                />
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
                  } catch (error) {
                    toast.error((error as Error).message || "Format failed");
                  }
                }}
              >
                Format
              </Button>
            </div>

            <Editor
              height="480px"
              language={getMonacoLanguage(language)}
              theme="vs-dark"
              value={code}
              onMount={(editor, monaco) => {
                editorRef.current = editor;
                configureCodeEditor(monaco);
                editorLockRef.current?.();
                editorLockRef.current = attemptIsActive
                  ? lockDownContestEditor(editor, monaco, () =>
                      toast.info("Copy, cut and paste are disabled during the contest."),
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
                contextmenu: false,
                readOnly: !attemptIsActive,
              }}
            />
          </Card>

          <Card className="p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">{statusLine}</div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => runMutation.mutate()}
                  disabled={!attemptIsActive || busy}
                >
                  <Play className="mr-2 h-4 w-4" /> {runMutation.isPending ? "Running..." : "Run"}
                </Button>
                <Button
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                  onClick={() => submitMutation.mutate()}
                  disabled={!attemptIsActive || busy}
                >
                  <Send className="mr-2 h-4 w-4" /> {submitMutation.isPending ? "Submitting..." : "Submit"}
                </Button>
              </div>
            </div>

            {output && (output.stdout || output.stderr) && (
              <div className="mt-4 rounded border border-border bg-secondary p-3 font-mono-code text-xs">
                {output.stdout && <pre className="whitespace-pre-wrap">{output.stdout}</pre>}
                {output.stderr && <pre className="whitespace-pre-wrap text-destructive">{output.stderr}</pre>}
              </div>
            )}
          </Card>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
