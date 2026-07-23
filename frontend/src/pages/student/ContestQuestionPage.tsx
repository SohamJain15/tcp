import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import type * as MonacoEditor from "monaco-editor";
import { ListChecks, Play, Send } from "lucide-react";
import { toast } from "sonner";

import { contestsApi } from "@/api/services";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ContestLockOverlay } from "@/components/ContestLockOverlay";
import { ContestObjectiveQuestion } from "@/components/ContestObjectiveQuestion";
import { ContestQuestionNav } from "@/components/ContestQuestionNav";
import { ContestScreenGuard } from "@/components/ContestScreenGuard";
import { ContestSubmitDialog } from "@/components/ContestSubmitDialog";
import { ContestTimer } from "@/components/ContestTimer";
import { ContestWatermark } from "@/components/ContestWatermark";
import { ThemedSelect } from "@/components/ThemedSelect";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useVisitedQuestions } from "@/hooks/useVisitedQuestions";
import {
  configureCodeEditor,
  formatCodeInEditor,
  getMonacoLanguage,
  lockDownContestEditor,
} from "@/lib/code-editor";
import { EXECUTABLE_LANGUAGES, toLanguageLabel, toStatusLabel } from "@/api/mappers";
import type { ContestAttempt, ContestCodingSubmissionReceipt, ExecutableLanguage, SubmissionResult } from "@/api/types";
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

export default function ContestQuestionPage() {
  const { id = "", questionId = "" } = useParams();
  const pathname = `/student/contests/${id}/questions/${questionId}`;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const editorRef = useRef<MonacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const editorLockRef = useRef<(() => void) | null>(null);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [navSheetOpen, setNavSheetOpen] = useState(false);
  const { visitedIds, markVisited } = useVisitedQuestions(id);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["contest-question-detail", id, questionId],
    queryFn: () => contestsApi.getQuestionDetail(id, questionId, pathname),
    enabled: Boolean(id && questionId),
  });

  // The full question list powers the left rail. Shares the cache key the contest page already
  // populates, so this is usually served without an extra request.
  const contestDetailQuery = useQuery({
    queryKey: ["contest-detail", id],
    queryFn: () => contestsApi.getStudentDetail(id, pathname),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (questionId) {
      markVisited(questionId);
    }
  }, [markVisited, questionId]);

  useEffect(() => () => editorLockRef.current?.(), []);

  const payload = data;
  const attempt = payload?.attempt ?? null;
  const question = payload?.question;
  const contest = payload?.contest;
  const attemptIsActive = attempt?.status === "ACTIVE";
  const practiceMode = contest?.computedStatus === "Ended";
  const interactiveMode = attemptIsActive || practiceMode;
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

  // Stable identity: the proctoring hook keys its listener set on this callback, so a new
  // function every render would tear down and re-attach every listener.
  const updateAttemptInCache = useCallback(
    (nextAttempt: ContestAttempt) => {
      queryClient.setQueryData(["contest-question-detail", id, questionId], (current: typeof data) =>
        current ? { ...current, attempt: nextAttempt } : current,
      );
      queryClient.setQueryData(["contest-detail", id], (current: { contest: { attempt: ContestAttempt | null } } | undefined) =>
        current ? { contest: { ...current.contest, attempt: nextAttempt } } : current,
      );
    },
    [id, questionId, queryClient],
  );

  const { isLocked, isObscured, violationCount, requestFullscreen } = useContestProctoring({
    contestId: id,
    pathname,
    attempt,
    maxViolations: contest?.maxViolations,
    onAttemptUpdate: updateAttemptInCache,
  });

  const submitAttemptMutation = useMutation({
    mutationFn: () => contestsApi.submitAttempt(id, pathname),
    onSuccess: async (response) => {
      updateAttemptInCache(response.attempt);
      setSubmitDialogOpen(false);
      if (document.fullscreenElement && document.exitFullscreen) {
        try {
          await document.exitFullscreen();
        } catch {
          // Continue even if the browser refuses to leave fullscreen.
        }
      }
      toast.success("Test submitted successfully");
      navigate(`/student/contests/${id}`);
    },
    onError: (mutationError) => {
      toast.error((mutationError as Error)?.message || "Failed to submit the test");
    },
  });

  // A violation-triggered auto-submit can land while the student is mid-question; send them to the
  // contest page so they are not left staring at an editor that no longer accepts input.
  const attemptStatus = attempt?.status;
  useEffect(() => {
    if (attemptStatus === "AUTO_SUBMITTED" || attemptStatus === "DISQUALIFIED") {
      navigate(`/student/contests/${id}`);
    }
  }, [attemptStatus, id, navigate]);

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
      if (response.practiceMode) {
        setRunResult({
          problemId: questionId,
          language,
          status: response.status,
          runtimeMs: response.runtimeMs ?? 0,
          memoryKb: response.memoryKb ?? 0,
          passedCount: response.passedCount ?? 0,
          totalCount: response.totalCount ?? 0,
          executionProvider: "judge0",
          stdout: response.stdout,
          stderr: response.stderr,
        });
        toast.success("Code ran against all contest test cases.");
        return;
      }

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
      <div className="flex min-h-screen flex-col bg-background">
        <div className="container py-8 text-muted-foreground">Loading workspace...</div>
      </div>
    );
  }

  if (isError || !payload || !contest || !question) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <div className="container py-8 text-destructive">{(error as Error)?.message || "Failed to load question"}</div>
      </div>
    );
  }

  // Focus loss blanks the page before anything else, so an off-browser capture gets nothing.
  if (isObscured) {
    return <ContestScreenGuard />;
  }

  if (isLocked) {
    return <ContestLockOverlay onReturnToFullscreen={requestFullscreen} violationCount={violationCount} />;
  }

  const isCoding = question.type === "Coding";
  const attemptIsFinalised = Boolean(attempt && attempt.status !== "ACTIVE" && !practiceMode);
  const activeResult = runResult;
  const currentQuestionState = attempt?.questionStates.find((state) => state.questionId === questionId) ?? null;
  const finalSubmissionUsed = Boolean(currentQuestionState?.hasFinalCodingSubmission) && !practiceMode;
  const allQuestions = contestDetailQuery.data?.contest.questions ?? [];
  const showQuestionNav = attemptIsActive && allQuestions.length > 0;
  const watermarkPrimary = attempt?.userUid ?? attempt?.userEmail ?? "";

  const questionNav = (
    <ContestQuestionNav
      contestId={id}
      questions={allQuestions}
      attempt={attempt}
      visitedIds={visitedIds}
      activeQuestionId={questionId}
      maxViolations={contest.maxViolations}
      onSelectQuestion={(nextQuestion) => {
        markVisited(nextQuestion.id);
        setNavSheetOpen(false);
      }}
      onSubmitTest={() => setSubmitDialogOpen(true)}
      onTimeUp={() => submitAttemptMutation.mutate()}
      isSubmitting={submitAttemptMutation.isPending}
    />
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {attemptIsActive && watermarkPrimary && (
        <ContestWatermark primary={watermarkPrimary} secondary={attempt?.userEmail ?? undefined} />
      )}

      <header className="shrink-0 border-b border-border bg-card">
        <div className="flex h-12 items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2">
            {showQuestionNav && (
              <Sheet open={navSheetOpen} onOpenChange={setNavSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="lg:hidden">
                    <ListChecks className="mr-1.5 h-4 w-4" /> Questions
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
                  {questionNav}
                </SheetContent>
              </Sheet>
            )}
            <span className="truncate font-display text-sm font-bold">{contest.title}</span>
            <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
              Q{question.questionNumber}
            </Badge>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {question.type === "Coding" && (
              <span className="hidden text-xs text-muted-foreground md:inline">
                Time {question.timeLimitSeconds}s {"\u2022"} Mem {question.memoryLimitMb} MB
              </span>
            )}
            {!practiceMode && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Violations: {attempt?.violationCount ?? 0}/{contest.maxViolations}
              </span>
            )}
            {attemptIsActive && <ContestTimer deadline={attempt?.deadlineAt} className="py-1" />}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {showQuestionNav && <div className="hidden w-64 shrink-0 lg:block">{questionNav}</div>}

        <main className="min-w-0 flex-1 overflow-hidden">
          {question.type !== "Coding" ? (
            <ContestObjectiveQuestion
              contestId={id}
              pathname={pathname}
              question={question}
              attempt={attempt}
              attemptIsActive={attemptIsActive}
              onAttemptUpdate={updateAttemptInCache}
            />
          ) : (
            <ResizablePanelGroup direction="horizontal" className="h-full min-w-0 overflow-hidden">
          <ResizablePanel defaultSize={40} minSize={28} className="h-full">
            <div className="relative h-full w-full">
              <div className="absolute inset-0 overflow-y-auto p-6">
                <Card className="p-6 shadow-card">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Q{question.questionNumber}</Badge>
                <Badge variant="outline">{contest.computedStatus}</Badge>
                <Badge variant="outline">{question.points} pts</Badge>
                <Badge className="bg-red-100 text-red-800">{question.difficulty}</Badge>
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
                  <Card className="border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200 shadow-none">
                    You have not started this contest yet.{" "}
                    <Link to={`/student/contests/${id}`} className="font-semibold underline">
                      Go to the contest page
                    </Link>{" "}
                    to register and start your attempt.
                  </Card>
                )}

                {practiceMode && (
                  <Card className="border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100 shadow-none">
                    Practice mode — run your code against all test cases. Submissions and scoring are disabled.
                  </Card>
                )}

                {attemptIsFinalised && (
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
              <Card className="overflow-hidden shadow-card">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <ThemedSelect
                      value={language}
                      onValueChange={(value) => setLanguage(value as ExecutableLanguage)}
                      disabled={!interactiveMode}
                      triggerClassName="h-9 w-auto min-w-[130px] text-sm"
                      options={availableLanguages.map((supportedLanguage) => ({
                        value: supportedLanguage,
                        label: toLanguageLabel(supportedLanguage),
                      }))}
                    />
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
                    // Monaco routes Ctrl+C/V/X through its own command layer, so the document-level
                    // clipboard block does not reach it — lock the instance down directly.
                    editorLockRef.current?.();
                    editorLockRef.current = attemptIsActive
                      ? lockDownContestEditor(editor, monaco, () =>
                          toast.info("Copy, cut and paste are disabled during the contest."),
                        )
                      : null;
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
                        {submissionReceipt.practiceMode
                          ? ` \u2022 All test cases: ${submissionReceipt.passedCount ?? 0}/${submissionReceipt.totalCount ?? 0} passed.`
                          : " \u2022 Final code submitted. Hidden testcases are being checked in the background."}
                      </>
                    ) : (
                      practiceMode
                        ? "Practice mode: run against sample cases or all contest test cases. Submissions are disabled."
                        : "Run code to see sample testcase results."
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => runMutation.mutate()} disabled={!interactiveMode || runMutation.isPending || submitMutation.isPending}>
                      <Play className="mr-2 h-4 w-4" /> {runMutation.isPending ? "Running..." : practiceMode ? "Run Samples" : "Run"}
                    </Button>
                    {practiceMode ? (
                      <Button
                        className="bg-accent text-accent-foreground hover:bg-accent/90"
                        onClick={() => submitMutation.mutate()}
                        disabled={runMutation.isPending || submitMutation.isPending}
                      >
                        <Play className="mr-2 h-4 w-4" /> {submitMutation.isPending ? "Running..." : "Run All Tests"}
                      </Button>
                    ) : (
                      <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => submitMutation.mutate()} disabled={!interactiveMode || finalSubmissionUsed || submitMutation.isPending}>
                        <Send className="mr-2 h-4 w-4" /> {submitMutation.isPending ? "Submitting..." : "Submit"}
                      </Button>
                    )}
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
          )}
        </main>
      </div>

      <ContestSubmitDialog
        open={submitDialogOpen}
        onOpenChange={setSubmitDialogOpen}
        questions={allQuestions}
        attempt={attempt}
        visitedIds={visitedIds}
        onConfirm={() => submitAttemptMutation.mutate()}
        isSubmitting={submitAttemptMutation.isPending}
      />
    </div>
  );
}
