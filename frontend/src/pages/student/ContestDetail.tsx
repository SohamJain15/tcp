import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { AppLayout } from "@/components/AppLayout";
import { contestsApi } from "@/api/services";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useContestProctoring } from "./useContestProctoring";

function difficultyBadgeClass(difficulty: "Easy" | "Medium" | "Hard"): string {
  if (difficulty === "Easy") return "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300";
  if (difficulty === "Medium") return "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300";
  return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";
}

function questionStatusLabel(status: "UNATTEMPTED" | "ATTEMPTED" | "SOLVED"): string {
  if (status === "SOLVED") return "Solved";
  if (status === "ATTEMPTED") return "Attempted";
  return "Unattempted";
}

function statusBadgeClass(status: "UNATTEMPTED" | "ATTEMPTED" | "SOLVED"): string {
  if (status === "SOLVED") return "bg-green-600 text-white hover:bg-green-600";
  if (status === "ATTEMPTED") return "bg-amber-500 text-white hover:bg-amber-500";
  return "bg-secondary text-secondary-foreground";
}

function attemptStatusLabel(status: "NOT_ATTEMPTED" | "NOT_STARTED" | "ACTIVE" | "SUBMITTED" | "AUTO_SUBMITTED" | "DISQUALIFIED"): string {
  switch (status) {
    case "ACTIVE":
      return "In Progress";
    case "SUBMITTED":
      return "Submitted";
    case "AUTO_SUBMITTED":
      return "Auto Submitted";
    case "DISQUALIFIED":
      return "Disqualified";
    default:
      return "Not Attempted";
  }
}

export default function ContestDetail() {
  const { id = "" } = useParams();
  const pathname = `/student/contests/${id}`;
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["contest-detail", id],
    queryFn: () => contestsApi.getStudentDetail(id, pathname),
    enabled: Boolean(id),
  });

  const contest = data?.contest;
  const attempt = contest?.attempt ?? null;
  const report = contest?.report ?? null;

  const updateAttemptInCache = (nextAttempt: NonNullable<typeof attempt>) => {
    queryClient.setQueryData(["contest-detail", id], (current: typeof data) =>
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

  const standingsEnabled = Boolean(contest?.resultsPublished);

  const { data: standingsData } = useQuery({
    queryKey: ["contest-standings", id],
    queryFn: () => contestsApi.getStandings(id, pathname),
    enabled: Boolean(id) && standingsEnabled,
  });

  const startAttemptMutation = useMutation({
    mutationFn: () => contestsApi.startAttempt(id, pathname),
    onSuccess: async (response) => {
      toast.success("Contest attempt started");
      updateAttemptInCache(response.attempt);
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

  const answerMutation = useMutation({
    mutationFn: (payload: { questionId: string; answer: string | string[] }) =>
      contestsApi.answerQuestion(id, payload, pathname),
    onSuccess: async (response) => {
      updateAttemptInCache(response.attempt);
      toast.success("Answer submitted");
      await refetch();
    },
    onError: (mutationError) => {
      toast.error((mutationError as Error)?.message || "Failed to submit answer");
    },
  });

  const submitAttemptMutation = useMutation({
    mutationFn: () => contestsApi.submitAttempt(id, pathname),
    onSuccess: async (response) => {
      updateAttemptInCache(response.attempt);
      toast.success("Contest ended successfully");
      await refetch();
    },
    onError: (mutationError) => {
      toast.error((mutationError as Error)?.message || "Failed to end contest");
    },
  });

  const standings = useMemo(() => standingsData?.items ?? [], [standingsData?.items]);

  if (!id) {
    return <Navigate to="/student/contests" replace />;
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container py-8 text-muted-foreground">Loading contest...</div>
      </AppLayout>
    );
  }

  if (isError || !contest) {
    return (
      <AppLayout>
        <div className="container py-8 text-destructive">{(error as Error)?.message || "Failed to load contest"}</div>
      </AppLayout>
    );
  }

  const canAttempt = contest.computedStatus === "Live";
  const attemptIsActive = attempt?.status === "ACTIVE";
  const attemptIsLocked = Boolean(attempt && attempt.status !== "ACTIVE");
  const allQuestionsCompleted = Boolean(
    attempt &&
      contest.questions.length > 0 &&
      contest.questions.every((question) =>
        attempt.questionStates.some((state) => state.questionId === question.id && state.status !== "UNATTEMPTED"),
      ),
  );

  return (
    <AppLayout hideNavbar={attemptIsActive} hideFooter={attemptIsActive}>
      <div className="container space-y-6 py-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <Link to="/student/contests" className="text-sm text-muted-foreground hover:text-accent">
              Back to contests
            </Link>
            <h1 className="font-display text-3xl font-bold">{contest.title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={contest.type === "Rated" ? "bg-blue-600 text-white hover:bg-blue-600" : ""}>{contest.type}</Badge>
              <Badge variant="outline">{contest.studentListStatus}</Badge>
              <Badge variant="outline">{attemptStatusLabel(contest.attemptStatus)}</Badge>
              <Badge variant="outline">{contest.durationMinutes} mins</Badge>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {!attempt && canAttempt && (
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => startAttemptMutation.mutate()} disabled={startAttemptMutation.isPending}>
                {startAttemptMutation.isPending ? "Starting..." : "Start Contest"}
              </Button>
            )}
            {attemptIsActive && document.fullscreenElement == null && (
              <Button
                variant="outline"
                onClick={async () => {
                  if (document.documentElement.requestFullscreen) {
                    try {
                      await document.documentElement.requestFullscreen();
                    } catch {
                      toast.error("Unable to enter fullscreen");
                    }
                  }
                }}
              >
                Enter Fullscreen
              </Button>
            )}
            {attemptIsActive && allQuestionsCompleted && (
              <Button variant="destructive" onClick={() => submitAttemptMutation.mutate()} disabled={submitAttemptMutation.isPending}>
                {submitAttemptMutation.isPending ? "Ending..." : "End Test"}
              </Button>
            )}
          </div>
        </div>

        <Alert variant="destructive">
          <AlertTitle>Proctoring Alert</AlertTitle>
          <AlertDescription>
            Tab switching, fullscreen exit, and screenshot attempts are tracked. {contest.maxViolations} violations trigger auto-submit.
            {attempt ? ` Current violations: ${attempt.violationCount}/${contest.maxViolations}.` : ""}
          </AlertDescription>
        </Alert>

        {attemptIsLocked && (
          <Card className="border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200 shadow-none">
            This attempt is {attempt?.status.toLowerCase().replace(/_/g, " ")}. Answers and code submissions are now locked.
          </Card>
        )}

        {contest.resultsPublished && report && (
          <Card className="border border-border bg-background p-6 shadow-none">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-semibold">Published Report Card</h2>
              <Badge variant="outline">{attemptStatusLabel(report.status)}</Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
              <div className="rounded border border-border p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Rank</div>
                <div className="mt-2 text-lg font-semibold">{report.rank ? `#${report.rank}` : "-"}</div>
              </div>
              <div className="rounded border border-border p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Score</div>
                <div className="mt-2 text-lg font-semibold">{report.score}</div>
              </div>
              <div className="rounded border border-border p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Solved</div>
                <div className="mt-2 text-lg font-semibold">{report.solvedCount}</div>
              </div>
              <div className="rounded border border-border p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Time Taken</div>
                <div className="mt-2 text-lg font-semibold">{report.timeTakenMs !== null ? `${Math.ceil(report.timeTakenMs / 1000)} sec` : "-"}</div>
              </div>
              <div className="rounded border border-border p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Violation Penalty</div>
                <div className="mt-2 text-lg font-semibold">{report.violationPenaltyPoints} pts</div>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {report.questionReports.length === 0 && <div className="text-sm text-muted-foreground">You did not attempt this contest.</div>}
              {report.questionReports.map((item) => (
                <div key={item.questionId} className="rounded border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Q{item.questionNumber}</Badge>
                    <Badge className={statusBadgeClass(item.status)}>{questionStatusLabel(item.status)}</Badge>
                    <Badge variant="outline">{item.awardedPoints}/{item.points} pts</Badge>
                    <Badge variant="outline">{item.type}</Badge>
                  </div>
                  <h3 className="mt-3 text-base font-semibold">{item.title}</h3>
                  {item.type !== "Coding" ? (
                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                      <div>{item.statement}</div>
                      <div>Submitted: <span className="font-medium text-foreground">{Array.isArray(item.submittedAnswer) ? item.submittedAnswer.join(", ") : item.submittedAnswer ?? "-"}</span></div>
                      <div>Correct: <span className="font-medium text-foreground">{Array.isArray(item.correctAnswer) ? item.correctAnswer.join(", ") : item.correctAnswer}</span></div>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                      <div>{item.problemStatement}</div>
                      <div>Passed testcases: <span className="font-medium text-foreground">{item.passedCount}/{item.totalCount}</span></div>
                      <div>Final verdict: <span className="font-medium text-foreground">{item.finalSubmissionStatus ?? "-"}</span></div>
                      <div>Runtime / Memory: <span className="font-medium text-foreground">{item.finalRuntimeMs} ms / {(item.finalMemoryKb / 1024).toFixed(1)} MB</span></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {contest.computedStatus === "Upcoming" ? (
          <Card className="border border-border bg-background p-5 text-sm text-muted-foreground shadow-none">
            Questions will be revealed when the contest starts.
          </Card>
        ) : !attemptIsActive ? (
          <Card className="border border-border bg-background p-5 text-sm text-muted-foreground shadow-none">
            Questions will be revealed after you start the contest and enter the proctored mode.
          </Card>
        ) : (
          contest.questions.map((question) => {
          const state = attempt?.questionStates.find((entry) => entry.questionId === question.id);
          const status = state?.status ?? "UNATTEMPTED";
          const answerValue = answers[question.id];

          return (
            <Card key={question.id} className="border border-border bg-background p-5 shadow-none">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Q{question.questionNumber}</Badge>
                    <Badge className={statusBadgeClass(status)}>{questionStatusLabel(status)}</Badge>
                    <Badge variant="outline">{question.points} pts</Badge>
                    {"difficulty" in question && question.difficulty ? (
                      <Badge className={difficultyBadgeClass(question.difficulty)}>{question.difficulty}</Badge>
                    ) : (
                      <Badge variant="outline">Objective</Badge>
                    )}
                  </div>
                  <h2 className="font-display text-xl font-semibold">{question.title}</h2>
                  {"statement" in question && question.statement && <p className="text-sm text-muted-foreground">{question.statement}</p>}
                  {"problemStatement" in question && question.problemStatement && (
                    <div className="space-y-3 text-sm text-muted-foreground">
                      <p>{question.problemStatement}</p>
                      <div>
                        <div className="mb-1 font-medium text-foreground">Constraints</div>
                        <pre className="whitespace-pre-wrap break-words font-inherit text-muted-foreground">
                          {question.constraints}
                        </pre>
                      </div>
                      {question.inputFormat && question.outputFormat && (
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <div className="mb-1 font-medium text-foreground">Input Format</div>
                            <pre className="whitespace-pre-wrap break-words font-inherit text-muted-foreground">
                              {question.inputFormat}
                            </pre>
                          </div>
                          <div>
                            <div className="mb-1 font-medium text-foreground">Output Format</div>
                            <pre className="whitespace-pre-wrap break-words font-inherit text-muted-foreground">
                              {question.outputFormat}
                            </pre>
                          </div>
                        </div>
                      )}
                      {question.sampleTestCases && question.sampleTestCases.length > 0 && (
                        <div className="space-y-2">
                          <div className="font-medium text-foreground">Sample Test Cases</div>
                          {question.sampleTestCases.map((testCase, index) => (
                            <div key={`${question.id}-sample-${index}`} className="rounded border border-border p-3">
                              <div className="text-xs font-semibold">Case {index + 1}</div>
                              <div className="mt-2 text-xs">
                                <div className="font-semibold text-accent">Input</div>
                                <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono-code text-xs text-foreground">
                                  {testCase.input}
                                </pre>
                              </div>
                              <div className="mt-2 text-xs">
                                <div className="font-semibold text-accent">Expected Output</div>
                                <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono-code text-xs text-foreground">
                                  {testCase.output}
                                </pre>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {"type" in question && question.type === "Coding" ? (
                  <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
                    <Link to={`/student/contests/${id}/questions/${question.id}`}>Open Workspace</Link>
                  </Button>
                ) : null}
              </div>

              {question.type === "MCQ" && question.options && (
                <div className="mt-4 space-y-4">
                  <RadioGroup value={typeof answerValue === "string" ? answerValue : ""} onValueChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))} disabled={!attemptIsActive}>
                    {question.options.map((option, index) => {
                      const key = String.fromCharCode(65 + index);
                      return (
                        <label key={`${question.id}-${key}`} className="flex items-center gap-3 rounded border border-border p-3">
                          <RadioGroupItem value={key} id={`${question.id}-${key}`} />
                          <span className="text-sm">{key}. {option}</span>
                        </label>
                      );
                    })}
                  </RadioGroup>
                  <Button onClick={() => answerMutation.mutate({ questionId: question.id, answer: typeof answerValue === "string" ? answerValue : "" })} disabled={!attemptIsActive || typeof answerValue !== "string" || answerValue.length === 0 || answerMutation.isPending}>
                    Submit Answer
                  </Button>
                </div>
              )}

              {question.type === "MSQ" && question.options && (
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    {question.options.map((option, index) => {
                      const key = String.fromCharCode(65 + index);
                      const selected = Array.isArray(answerValue) ? answerValue.includes(key) : false;
                      return (
                        <label key={`${question.id}-${key}`} className="flex items-center gap-3 rounded border border-border p-3">
                          <Checkbox
                            checked={selected}
                            disabled={!attemptIsActive}
                            onCheckedChange={(checked) => {
                              setAnswers((current) => {
                                const existing = Array.isArray(current[question.id]) ? [...(current[question.id] as string[])] : [];
                                const next = checked ? [...existing, key] : existing.filter((value) => value !== key);
                                return { ...current, [question.id]: next };
                              });
                            }}
                          />
                          <span className="text-sm">{key}. {option}</span>
                        </label>
                      );
                    })}
                  </div>
                  <Button onClick={() => answerMutation.mutate({ questionId: question.id, answer: Array.isArray(answerValue) ? answerValue : [] })} disabled={!attemptIsActive || !Array.isArray(answerValue) || answerValue.length === 0 || answerMutation.isPending}>
                    Submit Answer
                  </Button>
                </div>
              )}
            </Card>
          );
        }))}

        {standingsEnabled && (
          <Card className="border border-border bg-background p-6 shadow-none">
            <h2 className="mb-4 font-display text-xl font-semibold">Published Standings</h2>
            <div className="space-y-3">
              {standings.length === 0 && <p className="text-sm text-muted-foreground">No standings available yet.</p>}
              {standings.map((entry) => (
                <div key={entry.attemptId} className="flex items-center justify-between rounded border border-border p-3">
                  <div>
                    <div className="font-medium">#{entry.rank} {entry.userName ?? entry.userEmail}</div>
                    <div className="text-xs text-muted-foreground">{entry.userUid ?? entry.userEmail}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div>{entry.solvedCount} solved</div>
                    <div className="text-muted-foreground">{entry.score} pts • {entry.timeTakenMs !== null ? `${Math.ceil(entry.timeTakenMs / 1000)} sec` : "-"}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
