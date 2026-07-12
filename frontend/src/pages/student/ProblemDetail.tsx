import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import type * as MonacoEditor from "monaco-editor";
import {
  Play,
  Send,
  ChevronLeft,
  FileCode2,
  RotateCcw,
  CheckCircle2,
  LoaderCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { DifficultyBadge, StatusBadge } from "@/components/Badges";
import { cn } from "@/lib/utils";
import { submissionsApi, problemsApi, userApi } from "@/api/services";
import { configureCodeEditor, formatCodeInEditor, getMonacoLanguage } from "@/lib/code-editor";
import {
  EXECUTABLE_LANGUAGES,
  toLanguageLabel,
  toStatusLabel,
} from "@/api/mappers";
import type {
  ExecutableLanguage,
  Submission,
  SubmissionResult,
  SubmissionStatus,
} from "@/api/types";
import { isSubmissionPending, pollSubmissionUntilComplete } from "./submissionPolling";

const STARTER_TEMPLATES: Partial<Record<ExecutableLanguage, string>> = {
  cpp: `// Solution.cpp
#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    // Read from cin if needed. The platform injects main() for Solution classes.
    vector<int> solve() {
        return {};
    }
};
`,
  java: `// Solution.java
import java.util.*;

class Solution {
    // Read from System.in if needed. The platform injects Main for Solution classes.
    public List<Integer> solve() {
        return new ArrayList<>();
    }
}
`,
  python: `# Solution.py
class Solution:
    # Read from stdin if needed. The platform injects the execution entrypoint.
    def solve(self):
        return []
`,
  javascript: `// Solution.js
class Solution {
  // Read from stdin if needed. The platform injects the execution entrypoint.
  solve() {
    return [];
  }
}
`,
};

const FILE_EXTENSIONS: Partial<Record<ExecutableLanguage, string>> = {
  cpp: "cpp",
  java: "java",
  python: "py",
  javascript: "js",
};

const CODE_DRAFT_SAVE_DELAY_MS = 500;

function getStarterCode(language: ExecutableLanguage): string {
  return (
    STARTER_TEMPLATES[language] ??
    `// Solution.${FILE_EXTENSIONS[language] ?? language}
// Start coding here.
`
  );
}

function getSolutionFilename(language: ExecutableLanguage): string {
  return `Solution.${FILE_EXTENSIONS[language] ?? language}`;
}

function getCodeDraftStorageKey(problemId: string, language: ExecutableLanguage): string {
  return `code_draft_${problemId}_${language}`;
}

function loadStoredDraft(problemId: string, language: ExecutableLanguage): string | null {
  if (typeof window === "undefined" || !problemId) {
    return null;
  }

  try {
    return window.localStorage.getItem(getCodeDraftStorageKey(problemId, language));
  } catch {
    return null;
  }
}

function saveStoredDraft(problemId: string, language: ExecutableLanguage, code: string): void {
  if (typeof window === "undefined" || !problemId) {
    return;
  }

  try {
    window.localStorage.setItem(getCodeDraftStorageKey(problemId, language), code);
  } catch {
    // Ignore storage failures so the editor remains usable in restricted browsers.
  }
}

function formatStatus(status: SubmissionStatus): string {
  return toStatusLabel(status);
}

function formatExecutionStatus(status: SubmissionStatus, isRunAction: boolean): string {
  if (isRunAction && status === "ACCEPTED") {
    return "Ran Successfully";
  }

  return formatStatus(status);
}

function formatRelativeTime(isoDate: string): string {
  const created = new Date(isoDate).getTime();
  const diffMs = Date.now() - created;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) {
    return "just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} d ago`;
}

export default function ProblemDetail() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();

  const [language, setLanguage] = useState<ExecutableLanguage>("cpp");
  const [draftsByLanguage, setDraftsByLanguage] = useState<Partial<Record<ExecutableLanguage, string>>>({
    cpp: getStarterCode("cpp"),
  });
  const [tab, setTab] = useState<"console" | "subs">("console");
  const [runResult, setRunResult] = useState<SubmissionResult | null>(null);
  const [submitResult, setSubmitResult] = useState<Submission | null>(null);
  const [pendingSubmissionId, setPendingSubmissionId] = useState<string | null>(null);
  const [pendingSubmissionStatus, setPendingSubmissionStatus] = useState<SubmissionStatus | null>(null);
  const [cursorPosition, setCursorPosition] = useState({ lineNumber: 1, column: 1 });
  const pollingAbortRef = useRef<AbortController | null>(null);
  const editorRef = useRef<MonacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const draftSaveTimeoutRef = useRef<number | null>(null);
  const languageRef = useRef<ExecutableLanguage>("cpp");
  const code = draftsByLanguage[language] ?? getStarterCode(language);

  languageRef.current = language;

  useEffect(() => {
    return () => {
      pollingAbortRef.current?.abort();
      pollingAbortRef.current = null;
      if (draftSaveTimeoutRef.current !== null) {
        window.clearTimeout(draftSaveTimeoutRef.current);
        draftSaveTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    pollingAbortRef.current?.abort();
    pollingAbortRef.current = null;
    if (draftSaveTimeoutRef.current !== null) {
      window.clearTimeout(draftSaveTimeoutRef.current);
      draftSaveTimeoutRef.current = null;
    }
    setLanguage("cpp");
    setDraftsByLanguage({
      cpp: getStarterCode("cpp"),
    });
    setTab("console");
    setRunResult(null);
    setSubmitResult(null);
    setPendingSubmissionId(null);
    setPendingSubmissionStatus(null);
    setCursorPosition({ lineNumber: 1, column: 1 });
  }, [id]);

  useEffect(() => {
    if (!id) {
      return;
    }

    const storedDraft = loadStoredDraft(id, language);
    if (storedDraft === null) {
      return;
    }

    setDraftsByLanguage((currentDrafts) => {
      if (currentDrafts[language] === storedDraft) {
        return currentDrafts;
      }

      return {
        ...currentDrafts,
        [language]: storedDraft,
      };
    });
  }, [id, language]);

  useEffect(() => {
    if (!id) {
      return;
    }

    if (draftSaveTimeoutRef.current !== null) {
      window.clearTimeout(draftSaveTimeoutRef.current);
    }

    draftSaveTimeoutRef.current = window.setTimeout(() => {
      saveStoredDraft(id, language, code);
      draftSaveTimeoutRef.current = null;
    }, CODE_DRAFT_SAVE_DELAY_MS);

    return () => {
      if (draftSaveTimeoutRef.current !== null) {
        window.clearTimeout(draftSaveTimeoutRef.current);
        draftSaveTimeoutRef.current = null;
      }
    };
  }, [id, language, code]);

  const handleFormatCode = async () => {
    if (!editorRef.current) {
      return;
    }

    try {
      await formatCodeInEditor(editorRef.current, language);
    } catch (error) {
      toast.error((error as Error).message || "Format failed");
    }
  };

  const { data: problemEnvelope, isLoading: problemLoading, isError: problemError, error: problemErrorObj } = useQuery({
    queryKey: ["student-problem-detail", id],
    queryFn: () => problemsApi.getStudentDetail(id),
    enabled: Boolean(id),
  });

  const { data: submissionsData } = useQuery({
    queryKey: ["student-problem-submissions", id],
    queryFn: () => submissionsApi.list({ problemId: id, pageSize: 25 }),
    enabled: Boolean(id),
  });

  const { data: currentUserData } = useQuery({
    queryKey: ["student-problem-current-user"],
    queryFn: () => userApi.me(`/student/problems/${id}`, { suppressAuthRedirect: true }),
    retry: false,
  });

  const submissions = useMemo(
    () => [...(submissionsData?.items ?? [])].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [submissionsData?.items],
  );

  const invalidateSubmissionViews = () => {
    queryClient.invalidateQueries({ queryKey: ["student-problem-submissions", id] });
    queryClient.invalidateQueries({ queryKey: ["student-profile"] });
    queryClient.invalidateQueries({ queryKey: ["student-dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["student-leaderboard"] });
    queryClient.invalidateQueries({ queryKey: ["student-problems"] });
  };

  const beginSubmissionPolling = async (submissionId: string) => {
    pollingAbortRef.current?.abort();
    const controller = new AbortController();
    pollingAbortRef.current = controller;
    setPendingSubmissionId(submissionId);
    setPendingSubmissionStatus("QUEUED");

    try {
      const finalSubmission = await pollSubmissionUntilComplete(
        submissionId,
        async (currentSubmissionId) => {
          const response = await submissionsApi.getById(currentSubmissionId);
          return response.submission;
        },
        {
          intervalMs: 1_500,
          timeoutMs: 120_000,
          signal: controller.signal,
          onUpdate: (submission) => {
            setPendingSubmissionStatus(submission.status);
            setSubmitResult(submission);
          },
        },
      );

      setSubmitResult(finalSubmission);
      setRunResult(null);
      setTab("subs");
      invalidateSubmissionViews();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      toast.error((error as Error).message || "Polling failed");
    } finally {
      if (pollingAbortRef.current === controller) {
        pollingAbortRef.current = null;
        setPendingSubmissionId(null);
        setPendingSubmissionStatus(null);
      }
    }
  };

  const runMutation = useMutation({
    mutationFn: () => submissionsApi.run({ problemId: id, code, language }),
    onMutate: () => {
      setTab("console");
    },
    onSuccess: (data) => {
      setRunResult(data.result);
      setSubmitResult(null);
      setTab("console");
    },
    onError: (error) => {
      toast.error((error as Error).message || "Run failed");
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => submissionsApi.create({ problemId: id, code, language }),
    onSuccess: (data) => {
      setSubmitResult(null);
      setRunResult(null);
      setTab("subs");
      void beginSubmissionPolling(data.submission_id);
    },
    onError: (error) => {
      const message = (error as Error).message || "Submit failed";
      if (message.toLowerCase().includes("not allowed")) {
        toast.error("Submission is allowed only for STUDENT role. Please sign in as a student.");
        return;
      }

      toast.error(message);
    },
  });

  if (currentUserData?.user.role === "FACULTY") {
    return <Navigate to="/faculty/dashboard" replace />;
  }

  if (problemLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading problem...
      </div>
    );
  }

  if (problemError || !problemEnvelope) {
    return (
      <div className="flex min-h-screen items-center justify-center text-destructive">
        {(problemErrorObj as Error)?.message || "Failed to load problem"}
      </div>
    );
  }

  const problem = problemEnvelope.problem;
  const testCases = problem.sampleTestCases;
  const currentStarterCode = getStarterCode(language);
  const activeResult = submitResult
    ? {
        status: submitResult.status,
        runtimeMs: submitResult.runtimeMs,
        memoryKb: submitResult.memoryKb,
        passedCount: submitResult.passedCount,
        totalCount: submitResult.totalCount,
      }
    : runResult;
  const isSubmissionProcessing = pendingSubmissionStatus ? isSubmissionPending(pendingSubmissionStatus) : false;
  const showingRunResult = Boolean(runResult) && !submitResult;
  const activeConsoleOutput = runResult
    ? `${runResult.stdout || ""}${runResult.stderr ? `\n${runResult.stderr}` : ""}`.trim()
    : submitResult
      ? `${submitResult.stdout || ""}${submitResult.stderr ? `\n${submitResult.stderr}` : ""}`.trim()
      : "";
  const lineCount = code.split("\n").length;
  const activeResultStatusLabel = activeResult
    ? formatExecutionStatus(activeResult.status, showingRunResult)
    : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Navbar />
      <div className="border-b border-border bg-card">
        <div className="container flex h-12 items-center justify-between">
          <Link to="/student/problems" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-accent">
            <ChevronLeft className="h-4 w-4" /> Back to problems
          </Link>
          <div className="hidden text-xs text-muted-foreground md:block">
            Time limit: {problem.timeLimitSeconds}s {"\u2022"} Memory: {problem.memoryLimitMb} MB
          </div>
        </div>
      </div>

      <div className="h-[calc(100vh-4.5rem)] w-full overflow-hidden flex flex-col">
        <ResizablePanelGroup direction="horizontal" className="flex-1 overflow-hidden">
          <ResizablePanel defaultSize={40} minSize={25} className="h-full">
            <div className="relative h-full w-full">
              <div className="absolute inset-0 overflow-y-auto p-6">
                <Card className="p-6 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <h1 className="font-display text-2xl font-bold">{problem.title}</h1>
                <DifficultyBadge d={problem.difficulty} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {problem.tags.map((tag) => (
                  <span key={tag} className="rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                    {tag}
                  </span>
                ))}
              </div>

              <section className="mt-6 space-y-5 text-sm leading-relaxed">
                <div>
                  <h3 className="mb-1 font-display text-base font-semibold">Description</h3>
                  <p className="text-muted-foreground">{problem.statement}</p>
                </div>
                <div>
                  <h3 className="mb-1 font-display text-base font-semibold">Input Format</h3>
                  <p className="text-muted-foreground">{problem.inputFormat}</p>
                </div>
                <div>
                  <h3 className="mb-1 font-display text-base font-semibold">Output Format</h3>
                  <p className="text-muted-foreground">{problem.outputFormat}</p>
                </div>
                <div>
                  <h3 className="mb-1 font-display text-base font-semibold">Examples</h3>
                  <div className="space-y-2">
                    {problem.examples.map((example, index) => (
                      <div key={`${example.input}-${index}`} className="rounded-md bg-secondary p-3 font-mono-code text-xs">
                        <div>
                          <span className="text-accent">Input:</span> {example.input}
                        </div>
                        <div>
                          <span className="text-accent">Output:</span> {example.output}
                        </div>
                        {example.explanation && <div className="mt-2 text-muted-foreground">{example.explanation}</div>}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="mb-1 font-display text-base font-semibold">Constraints</h3>
                  <ul className="list-disc space-y-1 pl-5 font-mono-code text-xs text-muted-foreground">
                    {problem.constraints.map((constraint) => (
                      <li key={constraint}>{constraint}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-1 font-display text-base font-semibold">Sample Test Cases</h3>
                  <div className="space-y-2">
                    {testCases.map((testCase, index) => (
                      <div key={`${testCase.input}-${index}`} className="rounded-md border border-border p-3">
                        <div className="mb-2 text-xs font-semibold">Case {index + 1}</div>
                        <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Input</label>
                        <div className="mt-1 rounded border border-border bg-secondary px-2 py-1.5 font-mono-code text-xs">
                          {testCase.input}
                        </div>
                        <label className="mt-2 block text-[11px] uppercase tracking-wider text-muted-foreground">Expected</label>
                        <div className="mt-1 rounded bg-secondary px-2 py-1.5 font-mono-code text-xs">{testCase.output}</div>
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

          <ResizablePanel defaultSize={60} minSize={30} className="h-full flex flex-col overflow-hidden">
            <div className="h-full min-h-0 pl-2">
              <ResizablePanelGroup direction="vertical" className="gap-2">
                <ResizablePanel defaultSize={68} minSize={35}>
                  <div className="flex h-full min-h-0 flex-col gap-2">
                    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-card">
                      <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <select
                            value={language}
                            onChange={(event) => {
                              const nextLanguage = event.target.value as ExecutableLanguage;
                              setDraftsByLanguage((currentDrafts) =>
                                currentDrafts[nextLanguage]
                                  ? currentDrafts
                                  : {
                                      ...currentDrafts,
                                      [nextLanguage]: getStarterCode(nextLanguage),
                                    },
                              );
                              setLanguage(nextLanguage);
                            }}
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium"
                          >
                            {EXECUTABLE_LANGUAGES.map((lang) => (
                              <option key={lang} value={lang}>
                                {toLanguageLabel(lang)}
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center gap-1.5 rounded border border-border bg-background px-2 py-1 text-xs">
                            <FileCode2 className="h-3 w-3 text-accent" />
                            <span className="font-mono-code">{getSolutionFilename(language)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => void handleFormatCode()}
                          >
                            Format
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() =>
                              setDraftsByLanguage((currentDrafts) => ({
                                ...currentDrafts,
                                [language]: currentStarterCode,
                              }))
                            }
                            aria-label="Reset"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="min-h-[320px] flex-1 bg-[hsl(220_50%_8%)]">
                        <Editor
                          beforeMount={(monaco) => {
                            configureCodeEditor(monaco);
                          }}
                          onMount={(editor, monaco) => {
                            editorRef.current = editor;
                            setCursorPosition(editor.getPosition() ?? { lineNumber: 1, column: 1 });

                            editor.onDidChangeCursorPosition((event) => {
                              setCursorPosition(event.position);
                            });

                            editor.addAction({
                              id: "tcet.format-code",
                              label: "Format Code",
                              keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
                              run: async () => {
                                await formatCodeInEditor(editor, languageRef.current);
                              },
                            });
                          }}
                          path={`${id}/${language}/${getSolutionFilename(language)}`}
                          height="100%"
                          language={getMonacoLanguage(language)}
                          theme="vs-dark"
                          value={code}
                          onChange={(nextValue) =>
                            setDraftsByLanguage((currentDrafts) => ({
                              ...currentDrafts,
                              [language]: nextValue ?? "",
                            }))
                          }
                          options={{
                            automaticLayout: true,
                            autoIndent: "full",
                            bracketPairColorization: { enabled: true },
                            cursorBlinking: "smooth",
                            fontFamily: "var(--font-mono, 'Fira Code', monospace)",
                            fontLigatures: true,
                            fontSize: 14,
                            formatOnPaste: true,
                            formatOnType: true,
                            glyphMargin: false,
                            lineHeight: 24,
                            minimap: { enabled: false },
                            padding: { top: 12, bottom: 12 },
                            renderLineHighlight: "all",
                            roundedSelection: true,
                            scrollBeyondLastLine: false,
                            smoothScrolling: true,
                            tabSize: 4,
                            wordWrap: "off",
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between border-t border-border bg-secondary/50 px-3 py-1.5 font-mono-code text-[11px] text-muted-foreground">
                        <span>Ln {cursorPosition.lineNumber}/{lineCount}, Col {cursorPosition.column}</span>
                        <span>UTF-8 {"\u2022"} LF {"\u2022"} {toLanguageLabel(language)}</span>
                      </div>
                    </Card>

                    <Card className="flex items-center justify-between gap-2 p-3 shadow-card">
                      <div className="text-xs text-muted-foreground">
                        {isSubmissionProcessing ? (
                          <span className="flex items-center gap-1.5">
                            <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
                            Processing submission {pendingSubmissionStatus ? `(${formatStatus(pendingSubmissionStatus)})` : "..."}
                          </span>
                        ) : activeResult ? (
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4 text-success" /> Last result: {activeResultStatusLabel}
                          </span>
                        ) : (
                          "Run code to see results"
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => runMutation.mutate()} disabled={runMutation.isPending || submitMutation.isPending || isSubmissionProcessing}>
                          <Play className="mr-1 h-4 w-4" /> {runMutation.isPending ? "Running..." : "Run"}
                        </Button>
                        <Button
                          onClick={() => submitMutation.mutate()}
                          disabled={runMutation.isPending || submitMutation.isPending || isSubmissionProcessing}
                          className="bg-accent text-accent-foreground hover:bg-accent/90"
                        >
                          {isSubmissionProcessing ? <LoaderCircle className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                          {submitMutation.isPending || isSubmissionProcessing ? "Processing..." : "Submit"}
                        </Button>
                      </div>
                    </Card>
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle className="bg-border" />

                <ResizablePanel defaultSize={32} minSize={20}>
                  <Card className="flex h-full min-h-[220px] flex-col overflow-hidden shadow-card">
                    <div className="flex border-b border-border bg-secondary/50">
                      {(["console", "subs"] as const).map((section) => (
                        <button
                          key={section}
                          onClick={() => setTab(section)}
                          className={cn(
                            "flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors",
                            tab === section ? "border-b-2 border-accent bg-background text-accent" : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {section === "console" ? "Console" : "Submissions"}
                        </button>
                      ))}
                    </div>
                    <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
                      {activeResult && (
                        <div
                          className={cn(
                            "rounded-md border p-3",
                            activeResult.status === "ACCEPTED"
                              ? "border-success/30 bg-success/10 text-success"
                              : "border-destructive/30 bg-destructive/10 text-destructive",
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <StatusBadge status={activeResultStatusLabel ?? formatStatus(activeResult.status)} />
                            <span className="font-mono-code text-xs">
                              {activeResult.passedCount}/{activeResult.totalCount} passed
                            </span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 font-mono-code text-xs text-foreground">
                            <div className="rounded bg-background p-2">
                              <div className="text-muted-foreground">Runtime</div>
                              {activeResult.runtimeMs} ms
                            </div>
                            <div className="rounded bg-background p-2">
                              <div className="text-muted-foreground">Memory</div>
                              {(activeResult.memoryKb / 1024).toFixed(1)} MB
                            </div>
                          </div>
                        </div>
                      )}
                      {tab === "console" && (
                        <pre className="whitespace-pre-wrap font-mono-code text-xs text-muted-foreground">
                          {runMutation.isPending
                            ? "$ Running solution against test cases..."
                            : isSubmissionProcessing
                              ? `$ Submission ${pendingSubmissionId ?? ""} is ${pendingSubmissionStatus ? formatStatus(pendingSubmissionStatus) : "Processing"}...`
                              : activeConsoleOutput || (activeResult ? `Status: ${activeResultStatusLabel}` : "// stdout/stderr will appear here")}
                        </pre>
                      )}
                      {tab === "subs" && (
                        <div className="space-y-2">
                          {isSubmissionProcessing && (
                            <div className="flex items-center justify-between rounded-md border border-accent/30 bg-accent/10 p-2 text-xs">
                              <StatusBadge status={formatStatus(pendingSubmissionStatus ?? "QUEUED")} />
                              <span className="font-mono-code text-muted-foreground">processing</span>
                              <span className="flex items-center gap-1 text-accent">
                                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                live
                              </span>
                            </div>
                          )}
                          {submissions.length === 0 && !isSubmissionProcessing && <div className="text-xs text-muted-foreground">No submissions yet.</div>}
                          {submissions.map((submission) => (
                            <div key={submission.id} className="flex items-center justify-between rounded-md border border-border p-2 text-xs">
                              <StatusBadge status={formatStatus(submission.status)} />
                              <span className="font-mono-code text-muted-foreground">{submission.runtimeMs} ms</span>
                              <span className="text-muted-foreground">{formatRelativeTime(submission.createdAt)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
