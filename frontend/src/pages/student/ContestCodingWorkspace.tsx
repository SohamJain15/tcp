import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import type * as MonacoEditor from "monaco-editor";
import { ChevronLeft, Play, Send } from "lucide-react";
import { toast } from "sonner";

import { AppLayout } from "@/components/AppLayout";
import { contestsApi } from "@/api/services";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { configureCodeEditor, formatCodeInEditor, getMonacoLanguage } from "@/lib/code-editor";
import { EXECUTABLE_LANGUAGES, toLanguageLabel, toStatusLabel } from "@/api/mappers";
import type { ContestCodingSubmissionReceipt, ExecutableLanguage, SubmissionResult } from "@/api/types";
import { useContestProctoring } from "./useContestProctoring";

const STARTER_TEMPLATES: Partial<Record<ExecutableLanguage, string>> = {
  c: `// main.c
#include <stdio.h>

int main(void) {
    return 0;
}
`,
  cpp: `// Solution.cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    return 0;
}
`,
  csharp: `// Program.cs
using System;

public class Program {
    public static void Main(string[] args) {
    }
}
`,
  dart: `// main.dart
void main() {
}
`,
  elixir: `# main.exs
defmodule Main do
  def main do
  end
end

Main.main()
`,
  erlang: `% main.erl
-module(main).
-export([main/0]).

main() ->
    ok.
`,
  go: `// main.go
package main

import "fmt"

func main() {
    _ = fmt.Sprintf("")
}
`,
  java: `// Main.java
import java.util.*;

public class Main {
    public static void main(String[] args) {
    }
}
`,
  python: `# solution.py
def solve():
    pass

if __name__ == "__main__":
    solve()
`,
  javascript: `// solution.js
function solve() {
}

solve();
`,
  kotlin: `// Main.kt
fun main() {
}
`,
  php: `<?php

function solve(): void
{
}

solve();
`,
  racket: `#lang racket

(define (main)
  (void))

(main)
`,
  ruby: `# main.rb
def solve
end

solve
`,
  rust: `// main.rs
fn main() {
}
`,
  scala: `// Main.scala
object Main {
  def main(args: Array[String]): Unit = {
  }
}
`,
  swift: `// main.swift
func solve() {
}

solve()
`,
  typescript: `// solution.ts
function solve(): void {
}

solve();
`,
};

function getStarterCode(language: ExecutableLanguage): string {
  return STARTER_TEMPLATES[language] ?? `// Start coding in ${language}\n`;
}

function getFileExtension(language: ExecutableLanguage): string {
  const map: Partial<Record<ExecutableLanguage, string>> = {
    c: "c",
    cpp: "cpp",
    csharp: "cs",
    dart: "dart",
    elixir: "exs",
    erlang: "erl",
    php: "php",
    java: "java",
    python: "py",
    javascript: "js",
    racket: "rkt",
    ruby: "rb",
    scala: "scala",
    swift: "swift",
    typescript: "ts",
    go: "go",
    kotlin: "kt",
    rust: "rs",
  };

  return map[language] ?? language;
}

function formatRunStatus(status: SubmissionResult["status"]): string {
  if (status === "ACCEPTED") {
    return "Ran Successfully";
  }

  return toStatusLabel(status);
}

export default function ContestCodingWorkspace() {
  const { id = "", questionId = "" } = useParams();
  const pathname = `/student/contests/${id}/questions/${questionId}`;
  const queryClient = useQueryClient();
  const editorRef = useRef<MonacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const blockedClipboardToastRef = useRef(0);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["contest-question-detail", id, questionId],
    queryFn: () => contestsApi.getQuestionDetail(id, questionId, pathname),
    enabled: Boolean(id && questionId),
  });

  const payload = data;
  const attempt = payload?.attempt ?? null;
  const question = payload?.question;
  const contest = payload?.contest;
  const attemptIsActive = attempt?.status === "ACTIVE";
  const availableLanguages: ExecutableLanguage[] =
    question && question.type === "Coding" ? EXECUTABLE_LANGUAGES : ["cpp"];
  const defaultLanguage = (availableLanguages[0] ?? "cpp") as ExecutableLanguage;
  const [language, setLanguage] = useState<ExecutableLanguage>(defaultLanguage);
  const [drafts, setDrafts] = useState<Partial<Record<ExecutableLanguage, string>>>({});
  const [runResult, setRunResult] = useState<SubmissionResult | null>(null);
  const [submissionReceipt, setSubmissionReceipt] = useState<ContestCodingSubmissionReceipt | null>(null);

  useEffect(() => {
    if (question?.type === "Coding") {
      const initialLanguage = (EXECUTABLE_LANGUAGES[0] ?? "cpp") as ExecutableLanguage;
      setLanguage(initialLanguage);
      setDrafts((current) =>
        Object.keys(current).length > 0 ? current : { [initialLanguage]: getStarterCode(initialLanguage) },
      );
    }
  }, [question?.type]);

  const code = drafts[language] ?? getStarterCode(language);

  const updateAttemptInCache = (nextAttempt: NonNullable<typeof attempt>) => {
    queryClient.setQueryData(["contest-question-detail", id, questionId], (current: typeof data) =>
      current ? { ...current, attempt: nextAttempt } : current,
    );
    queryClient.setQueryData(["contest-detail", id], (current: { contest: { attempt: typeof attempt } } | undefined) =>
      current ? { contest: { ...current.contest, attempt: nextAttempt } } : current,
    );
  };

  useContestProctoring({
    contestId: id,
    pathname,
    attempt,
    maxViolations: contest?.maxViolations,
    onAttemptUpdate: updateAttemptInCache,
  });

  useEffect(() => {
    if (!attemptIsActive) {
      return;
    }

    const container = editorContainerRef.current;
    if (!container) {
      return;
    }

    const blockClipboardAction = (event: ClipboardEvent | MouseEvent) => {
      event.preventDefault();
      const now = Date.now();
      if (now - blockedClipboardToastRef.current > 2000) {
        blockedClipboardToastRef.current = now;
        toast.info("Copy, cut, paste, and right-click are disabled in the contest workspace.");
      }
    };

    container.addEventListener("copy", blockClipboardAction);
    container.addEventListener("cut", blockClipboardAction);
    container.addEventListener("paste", blockClipboardAction);
    container.addEventListener("contextmenu", blockClipboardAction);

    return () => {
      container.removeEventListener("copy", blockClipboardAction);
      container.removeEventListener("cut", blockClipboardAction);
      container.removeEventListener("paste", blockClipboardAction);
      container.removeEventListener("contextmenu", blockClipboardAction);
    };
  }, [attemptIsActive]);

  const startAttemptMutation = useMutation({
    mutationFn: () => contestsApi.startAttempt(id, pathname),
    onSuccess: async (response) => {
      updateAttemptInCache(response.attempt);
      toast.success("Contest attempt started");
      if (document.documentElement.requestFullscreen) {
        try {
          await document.documentElement.requestFullscreen();
        } catch {
          toast.info("Enter fullscreen to avoid violations.");
        }
      }
      await refetch();
    },
    onError: (mutationError) => {
      toast.error((mutationError as Error)?.message || "Failed to start contest");
    },
  });

  const runMutation = useMutation({
    mutationFn: () => contestsApi.runCodingQuestion(id, { questionId, code, language }, pathname),
    onSuccess: (response) => {
      setRunResult(response.result);
      setSubmissionReceipt(null);
      toast.success("Sample run completed");
    },
    onError: (mutationError) => {
      toast.error((mutationError as Error)?.message || "Run failed");
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => contestsApi.submitCodingQuestion(id, { questionId, code, language }, pathname),
    onSuccess: async (response) => {
      setSubmissionReceipt(response);
      setRunResult(null);
      await refetch();
      toast.success("Final code submitted. Judging is in progress.");
    },
    onError: (mutationError) => {
      toast.error((mutationError as Error)?.message || "Submission failed");
    },
  });

  if (!id || !questionId) {
    return <Navigate to="/student/contests" replace />;
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container py-8 text-muted-foreground">Loading workspace...</div>
      </AppLayout>
    );
  }

  if (isError || !payload || !contest || !question) {
    return (
      <AppLayout>
        <div className="container py-8 text-destructive">{(error as Error)?.message || "Failed to load question"}</div>
      </AppLayout>
    );
  }

  if (question.type !== "Coding") {
    return <Navigate to={`/student/contests/${id}`} replace />;
  }

  const isLocked = Boolean(attempt && attempt.status !== "ACTIVE");
  const activeResult = runResult;
  const currentQuestionState = attempt?.questionStates.find((state) => state.questionId === questionId) ?? null;
  const finalSubmissionUsed = Boolean(currentQuestionState?.hasFinalCodingSubmission);

  return (
    <AppLayout hideNavbar={attemptIsActive} hideFooter={attemptIsActive}>
      <div className="border-b border-border bg-card">
        <div className="container flex h-12 items-center justify-between">
          <Link
            to={`/student/contests/${id}`}
            className="inline-flex items-center gap-1 rounded-none bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600"
          >
            <ChevronLeft className="h-4 w-4" /> Back to contest
          </Link>
          <div className="text-xs text-muted-foreground">
            Time limit: {question.timeLimitSeconds}s {"\u2022"} Memory: {question.memoryLimitMb} MB {"\u2022"} Violations:{" "}
            {attempt?.violationCount ?? 0}/{contest.maxViolations}
          </div>
        </div>
      </div>

      <div className="h-[calc(100vh-4.5rem)] w-full overflow-hidden flex flex-col">
        <ResizablePanelGroup direction="horizontal" className="flex-1 overflow-hidden">
          <ResizablePanel defaultSize={40} minSize={28} className="h-full">
            <div className="relative h-full w-full">
              <div className="absolute inset-0 overflow-y-auto p-6">
                <Card className="p-6 shadow-card">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Q{question.questionNumber}</Badge>
                <Badge variant="outline">{contest.computedStatus}</Badge>
                <Badge variant="outline">{question.points} pts</Badge>
                <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">{question.difficulty}</Badge>
              </div>

              <h1 className="mt-4 font-display text-2xl font-bold">{question.title}</h1>
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

                {!attempt && contest.computedStatus === "Live" && (
                  <Button
                    className="bg-accent text-accent-foreground hover:bg-accent/90"
                    onClick={() => startAttemptMutation.mutate()}
                    disabled={startAttemptMutation.isPending}
                  >
                    {startAttemptMutation.isPending ? "Starting..." : "Start Contest"}
                  </Button>
                )}

                {isLocked && (
                  <Card className="border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200 shadow-none">
                    This attempt is {attempt?.status.toLowerCase().replace(/_/g, " ")}. Code execution and submission are now locked.
                  </Card>
                )}

                {attemptIsActive && finalSubmissionUsed && (
                  <Card className="border border-blue-500/40 bg-blue-500/10 p-4 text-sm text-blue-200 shadow-none">
                    Final code submitted. Judging is in progress. You cannot submit again for this coding question.
                  </Card>
                )}
              </section>
                </Card>
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="bg-border" />

          <ResizablePanel defaultSize={60} minSize={30} className="h-full flex flex-col overflow-hidden">
            <div className="flex h-full min-h-0 flex-col gap-3">
              <Card ref={editorContainerRef} className="overflow-hidden shadow-card">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={language}
                      onChange={(event) => setLanguage(event.target.value as ExecutableLanguage)}
                      className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                      disabled={!attemptIsActive}
                    >
                      {availableLanguages.map((supportedLanguage) => (
                        <option key={supportedLanguage} value={supportedLanguage}>
                          {toLanguageLabel(supportedLanguage)}
                        </option>
                      ))}
                    </select>
                    <div className="rounded-md bg-secondary px-3 py-1.5 text-sm text-secondary-foreground">
                      Main.{getFileExtension(language)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        if (!editorRef.current) return;
                        try {
                          await formatCodeInEditor(editorRef.current, language);
                        } catch (mutationError) {
                          toast.error((mutationError as Error).message || "Format failed");
                        }
                      }}
                    >
                      Format
                    </Button>
                  </div>
                </div>

                <Editor
                  height="520px"
                  language={getMonacoLanguage(language)}
                  theme="vs-dark"
                  value={code}
                  onMount={(editor, monaco) => {
                    editorRef.current = editor;
                    configureCodeEditor(monaco);
                    editor.focus();
                  }}
                  onChange={(value) =>
                    setDrafts((current) => ({
                      ...current,
                      [language]: value ?? "",
                    }))
                  }
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
                  }}
                />
              </Card>

              <Card className="p-4 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-muted-foreground">
                    {activeResult ? (
                      <>
                        <span className="font-semibold text-foreground">{formatRunStatus(activeResult.status)}</span>
                        {" \u2022 "}Runtime {activeResult.runtimeMs} ms{" \u2022 "}Memory {Math.max(activeResult.memoryKb / 1024, 0).toFixed(1)} MB
                      </>
                    ) : submissionReceipt ? (
                      <>
                        <span className="font-semibold text-foreground">{toStatusLabel(submissionReceipt.status)}</span>
                        {" \u2022 "}Final code submitted. Hidden testcases are being checked in the background.
                      </>
                    ) : (
                      "Run code to see sample testcase results."
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => runMutation.mutate()} disabled={!attemptIsActive || runMutation.isPending}>
                      <Play className="mr-2 h-4 w-4" /> {runMutation.isPending ? "Running..." : "Run"}
                    </Button>
                    <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => submitMutation.mutate()} disabled={!attemptIsActive || finalSubmissionUsed || submitMutation.isPending}>
                      <Send className="mr-2 h-4 w-4" /> {submitMutation.isPending ? "Submitting..." : "Submit"}
                    </Button>
                  </div>
                </div>

                {activeResult && (activeResult.stdout || activeResult.stderr) && (
                  <div className="mt-4 rounded border border-border bg-secondary p-3 font-mono-code text-xs">
                    {activeResult.stdout && <pre className="whitespace-pre-wrap">{activeResult.stdout}</pre>}
                    {activeResult.stderr && <pre className="whitespace-pre-wrap text-destructive">{activeResult.stderr}</pre>}
                  </div>
                )}
              </Card>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </AppLayout>
  );
}
