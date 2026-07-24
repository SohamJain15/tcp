import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ListChecks,
  Maximize,
  Timer,
  Trophy,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { AppLayout } from "@/components/AppLayout";
import { contestsApi, submissionsApi } from "@/api/services";
import { toLanguageLabel } from "@/api/mappers";
import type { CodingContestQuestionReportItem, ContestAttempt, ContestQuestionReportItem } from "@/api/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ContestTimer } from "@/components/ContestTimer";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";

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

function formatTimeTaken(timeTakenMs: number | null): string {
  if (timeTakenMs === null) {
    return "-";
  }

  const totalSeconds = Math.ceil(timeTakenMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatAnswer(answer: string | string[] | null | undefined): string {
  if (answer == null || answer.length === 0) {
    return "-";
  }

  return Array.isArray(answer) ? answer.join(", ") : answer;
}

function getReportResult(item: ContestQuestionReportItem): { label: string; correct: boolean | null } {
  if (item.type !== "Coding") {
    if (item.submittedAnswer == null || item.submittedAnswer.length === 0) {
      return { label: "Not Answered", correct: null };
    }
    return item.isCorrect ? { label: "Correct", correct: true } : { label: "Incorrect", correct: false };
  }

  if (!item.finalSubmissionStatus) {
    return { label: "Not Attempted", correct: null };
  }

  return item.finalSubmissionStatus === "ACCEPTED"
    ? { label: "Correct", correct: true }
    : { label: "Incorrect", correct: false };
}

function PreflightStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Timer;
  label: string;
  value: string;
}) {
  return (
    <div className="border border-border bg-secondary/30 p-3">
      <Icon className="mx-auto h-4 w-4 text-muted-foreground" />
      <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-bold leading-tight">{value}</div>
    </div>
  );
}

function ReportStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-border bg-secondary/30 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-xl font-bold leading-none">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function SubmittedCode({ item, pathname }: { item: CodingContestQuestionReportItem; pathname: string }) {
  const [open, setOpen] = useState(false);
  const submissionId = item.finalSubmissionId;

  const { data, isLoading } = useQuery({
    queryKey: ["contest-report-code", submissionId],
    queryFn: () => submissionsApi.getById(submissionId ?? "", pathname),
    enabled: open && Boolean(submissionId),
  });

  if (!submissionId) {
    return null;
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-accent hover:underline"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} />
        {open ? "Hide Submitted Code" : "View Submitted Code"}
        {item.finalSubmissionLanguage && (
          <span className="font-normal normal-case text-muted-foreground">
            ({toLanguageLabel(item.finalSubmissionLanguage)})
          </span>
        )}
      </button>
      {open && (
        <div className="mt-2">
          {isLoading && <div className="text-xs text-muted-foreground">Loading code…</div>}
          {!isLoading && (
            <pre className="max-h-80 overflow-auto border border-border bg-[hsl(220_50%_8%)] p-3 font-mono-code text-xs leading-relaxed text-[hsl(42_40%_92%)]">
              {data?.submission.code || "// No code payload returned"}
            </pre>
          )}
        </div>
      )}
    </div>
  );
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
  const navigate = useNavigate();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["contest-detail", id],
    queryFn: () => contestsApi.getStudentDetail(id, pathname),
    enabled: Boolean(id),
  });

  const contest = data?.contest;
  const attempt = contest?.attempt ?? null;
  const report = contest?.report ?? null;
  const firstQuestionId = contest?.questions[0]?.id ?? "";

  const updateAttemptInCache = useCallback(
    (nextAttempt: ContestAttempt) => {
      queryClient.setQueryData(["contest-detail", id], (current: typeof data) =>
        current ? { contest: { ...current.contest, attempt: nextAttempt } } : current,
      );
    },
    [id, queryClient],
  );

  const standingsEnabled = Boolean(contest?.resultsPublished);

  const { data: standingsData } = useQuery({
    queryKey: ["contest-standings", id],
    queryFn: () => contestsApi.getStandings(id, pathname),
    enabled: Boolean(id) && standingsEnabled,
  });

  const registerMutation = useMutation({
    mutationFn: () => contestsApi.register(id, pathname),
    onSuccess: async () => {
      toast.success("You are registered for this contest");
      await refetch();
    },
    onError: (mutationError) => {
      toast.error((mutationError as Error)?.message || "Failed to register for this contest");
    },
  });

  const unregisterMutation = useMutation({
    mutationFn: () => contestsApi.unregister(id, pathname),
    onSuccess: async () => {
      toast.success("Registration withdrawn");
      await refetch();
    },
    onError: (mutationError) => {
      toast.error((mutationError as Error)?.message || "Failed to withdraw registration");
    },
  });

  const startAttemptMutation = useMutation({
    mutationFn: () => contestsApi.startAttempt(id, pathname),
    onSuccess: async (response) => {
      toast.success("Contest attempt started");
      updateAttemptInCache(response.attempt);
      // Enter fullscreen from within the click chain; the question page re-asserts it and shows the
      // click-to-restore overlay if the browser refuses here.
      if (document.documentElement.requestFullscreen) {
        try {
          await document.documentElement.requestFullscreen();
        } catch {
          // The per-question page will prompt to return to fullscreen.
        }
      }
      // The pre-flight payload carries no questions — the API only sends them once an attempt is
      // ACTIVE — so `firstQuestionId` is still empty here. Refetch first, otherwise we would
      // navigate to `/questions/` (no id), which matches no route and renders the 404 page.
      const refreshed = await refetch();
      const nextQuestionId = refreshed.data?.contest.questions[0]?.id ?? "";
      if (!nextQuestionId) {
        toast.error("Contest started, but its questions could not be loaded. Please refresh.");
        return;
      }

      // The attempt is taken one question per page from here on.
      navigate(`/student/contests/${id}/questions/${nextQuestionId}`);
    },
    onError: (mutationError) => {
      toast.error((mutationError as Error)?.message || "Failed to start contest");
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
  const contestEnded = contest.computedStatus === "Ended";
  const attemptIsActive = attempt?.status === "ACTIVE";
  const attemptIsLocked = Boolean(attempt && attempt.status !== "ACTIVE");
  // The report — scores, correct answers, rank — appears only once faculty publishes results.
  const showReport = Boolean(report) && contest.resultsPublished;
  // Ended but not yet published: a strict blackout, no questions or answers shown.
  const resultsPending = contestEnded && !contest.resultsPublished;
  // The pre-flight screen: contest is live, the student has not started, and there is nothing
  // to report yet. This replaces the old scattered cards with one focused call to action.
  const showPreflight = canAttempt && !attempt && !showReport;
  const submittedWhileLive = canAttempt && attemptIsLocked;

  // An active attempt is taken one question per page — this page only handles pre-flight, the
  // registration/upcoming states, and the post-contest report.
  if (attemptIsActive && firstQuestionId) {
    return <Navigate to={`/student/contests/${id}/questions/${firstQuestionId}`} replace />;
  }

  if (showPreflight) {
    const totalPoints = contest.questions.reduce((total, question) => total + question.points, 0);

    return (
      <AppLayout>
        <div className="container flex min-h-[calc(100vh-9rem)] max-w-3xl flex-col justify-center py-8">
          <Link
            to="/student/contests"
            className="mb-6 inline-flex items-center gap-1 self-start text-sm text-muted-foreground transition-colors hover:text-accent"
          >
            <ChevronLeft className="h-4 w-4" /> Back to contests
          </Link>

          <Card className="border border-border bg-background p-8 text-center shadow-card">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Badge className={contest.type === "Rated" ? "bg-blue-600 text-white hover:bg-blue-600" : ""}>
                {contest.type}
              </Badge>
              <Badge className="bg-success text-success-foreground hover:bg-success">Live</Badge>
            </div>

            <h1 className="mt-4 font-display text-3xl font-bold">{contest.title}</h1>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <PreflightStat icon={Timer} label="Duration" value={`${contest.durationMinutes} min`} />
              <PreflightStat icon={ListChecks} label="Questions" value={String(contest.questions.length || "—")} />
              <PreflightStat icon={Trophy} label="Total Points" value={String(totalPoints || "—")} />
              <PreflightStat icon={CalendarClock} label="Closes" value={formatDateTime(contest.endAt)} />
            </div>

            <div className="mt-6 flex justify-center">
              <ContestTimer deadline={contest.endAt} label="Contest closes in" />
            </div>

            <ul className="mx-auto mt-6 max-w-md space-y-2 text-left text-sm text-muted-foreground">
              <li className="flex gap-2">
                <Maximize className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                The contest opens in fullscreen and stays there until you submit.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                Copy, paste and right-click are disabled. Leaving fullscreen, switching tabs and
                screenshots are recorded, cost 5 points each, and auto-submit the test at{" "}
                {contest.maxViolations} violations.
              </li>
              <li className="flex gap-2">
                <Timer className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                Your {contest.durationMinutes}-minute timer starts the moment you begin and never runs
                past the contest close time.
              </li>
            </ul>

            {contest.isRegistered ? (
              <Button
                size="lg"
                className="mt-8 h-12 w-full max-w-xs bg-accent px-10 text-base font-semibold text-accent-foreground hover:bg-accent/90"
                onClick={() => startAttemptMutation.mutate()}
                disabled={startAttemptMutation.isPending}
              >
                {startAttemptMutation.isPending ? "Starting..." : "Start Test"}
              </Button>
            ) : contest.registrationStatus === "OPEN" ? (
              <div className="mt-8 space-y-3">
                <Button
                  size="lg"
                  className="h-12 w-full max-w-xs bg-accent px-10 text-base font-semibold text-accent-foreground hover:bg-accent/90"
                  onClick={() => registerMutation.mutate()}
                  disabled={registerMutation.isPending}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  {registerMutation.isPending ? "Registering..." : "Register to Attempt"}
                </Button>
                <p className="text-sm text-muted-foreground">
                  Registration closes {formatDateTime(contest.registrationCloseAt)}.
                </p>
              </div>
            ) : (
              <Card className="mx-auto mt-8 max-w-md border border-destructive/40 bg-destructive/10 p-4 text-sm shadow-none">
                {contest.registrationStatus === "NOT_OPEN"
                  ? `Registration opens ${formatDateTime(contest.registrationOpenAt)}.`
                  : "Registration for this contest is closed, so you cannot attempt it."}
              </Card>
            )}
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className={cn("container py-6", showReport ? "space-y-4" : "space-y-6")}>
        {showReport ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/student/contests"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-accent"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </Link>
            <h1 className="min-w-0 truncate font-display text-xl font-bold">{contest.title}</h1>
            <Badge className={contest.type === "Rated" ? "bg-blue-600 text-white hover:bg-blue-600" : ""}>{contest.type}</Badge>
          </div>
        ) : (
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <Link
                to="/student/contests"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-accent"
              >
                <ChevronLeft className="h-4 w-4" /> Back to contests
              </Link>
              <h1 className="font-display text-3xl font-bold">{contest.title}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={contest.type === "Rated" ? "bg-blue-600 text-white hover:bg-blue-600" : ""}>{contest.type}</Badge>
                <Badge variant="outline">{contest.studentListStatus}</Badge>
                <Badge variant="outline">{attemptStatusLabel(contest.attemptStatus)}</Badge>
                <Badge variant="outline">{contest.durationMinutes} mins</Badge>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!attempt && canAttempt && contest.isRegistered && (
                <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => startAttemptMutation.mutate()} disabled={startAttemptMutation.isPending}>
                  {startAttemptMutation.isPending ? "Starting..." : "Start Test"}
                </Button>
              )}
            </div>
          </div>
        )}

        {!showReport && submittedWhileLive && !contestEnded && (
          <Card className="border border-success/40 bg-success/10 p-5 text-center shadow-none">
            <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
            <h2 className="mt-3 font-display text-xl font-bold">Test Submitted</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Your answers are locked in. Results are released after faculty publishes them.
            </p>
            <div className="mt-4 flex justify-center">
              <ContestTimer deadline={contest.endAt} label="Contest closes in" />
            </div>
          </Card>
        )}

        {!showReport && resultsPending && (
          <Card className="border border-border bg-background p-8 text-center shadow-none">
            <CalendarClock className="mx-auto h-9 w-9 text-muted-foreground" />
            <h2 className="mt-4 font-display text-xl font-bold">Contest Ended</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Results are pending faculty review. Your scores, correct answers and rank will appear
              here once faculty publishes the results.
            </p>
          </Card>
        )}

        {showReport && report && (
          <Card className="border border-border bg-background p-4 shadow-none sm:p-5">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-semibold">
                {contest.resultsPublished ? "Published Report Card" : "Report Card"}
              </h2>
              <Badge variant="outline">{attemptStatusLabel(report.status)}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              <ReportStat label="Rank" value={report.rank ? `#${report.rank}` : "-"} />
              <ReportStat label="Score" value={String(report.score)} sub={`${report.solvedCount} solved`} />
              <ReportStat label="Time Taken" value={formatTimeTaken(report.timeTakenMs)} />
              <ReportStat label="Violation Penalty" value={`${report.violationPenaltyPoints} pts`} />
            </div>

            <div className="mt-5 space-y-3">
              {report.questionReports.length === 0 && (
                <div className="text-sm text-muted-foreground">You did not attempt this contest.</div>
              )}
              {report.questionReports.map((item) => {
                const result = getReportResult(item);
                return (
                  <div key={item.questionId} className="border border-border p-3.5 sm:p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Q{item.questionNumber}</Badge>
                      <Badge variant="outline">{item.type}</Badge>
                      <Badge variant="outline">{item.awardedPoints}/{item.points} pts</Badge>
                      <Badge className={statusBadgeClass(item.status)}>{questionStatusLabel(item.status)}</Badge>
                      <Badge
                        className={cn(
                          "ml-auto",
                          result.correct === true && "bg-green-600 text-white hover:bg-green-600",
                          result.correct === false && "bg-destructive text-destructive-foreground hover:bg-destructive",
                          result.correct === null && "bg-secondary text-secondary-foreground hover:bg-secondary",
                        )}
                      >
                        {result.label}
                      </Badge>
                    </div>

                    <h3 className="mt-2.5 text-base font-semibold leading-snug">{item.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.type !== "Coding" ? item.statement : item.problemStatement}
                    </p>

                    {item.type !== "Coding" ? (
                      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                        <div className="border border-border bg-secondary/30 p-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Your Answer
                          </div>
                          <div className="mt-1 text-sm font-medium">{formatAnswer(item.submittedAnswer)}</div>
                        </div>
                        <div className="border border-border bg-secondary/30 p-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Correct Answer
                          </div>
                          <div className="mt-1 text-sm font-medium">{formatAnswer(item.correctAnswer)}</div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                          <div className="border border-border bg-secondary/30 p-2.5">
                            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                              Test Cases
                            </div>
                            <div className="mt-1 font-mono-code text-sm font-medium">
                              {item.passedCount}/{item.totalCount} passed
                            </div>
                          </div>
                          <div className="border border-border bg-secondary/30 p-2.5">
                            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                              Verdict
                            </div>
                            <div className="mt-1 text-sm font-medium">{item.finalSubmissionStatus ?? "-"}</div>
                          </div>
                          <div className="border border-border bg-secondary/30 p-2.5">
                            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                              Runtime
                            </div>
                            <div className="mt-1 font-mono-code text-sm font-medium">{item.finalRuntimeMs} ms</div>
                          </div>
                          <div className="border border-border bg-secondary/30 p-2.5">
                            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                              Memory
                            </div>
                            <div className="mt-1 font-mono-code text-sm font-medium">
                              {(item.finalMemoryKb / 1024).toFixed(1)} MB
                            </div>
                          </div>
                        </div>
                        <SubmittedCode item={item} pathname={pathname} />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {contest.computedStatus === "Upcoming" && (
          <Card className="border border-border bg-background p-5 shadow-none">
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CalendarClock className="h-7 w-7 text-accent" />
              <div>
                <h2 className="font-display text-lg font-bold">Starts {formatDateTime(contest.startAt)}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Questions unlock when the contest begins.
                </p>
              </div>
              <ContestTimer deadline={contest.startAt} label="Starts in" />
              {contest.isRegistered ? (
                <Badge className="bg-success text-success-foreground hover:bg-success">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> You are registered
                </Badge>
              ) : contest.registrationStatus === "OPEN" ? (
                <Button
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                  onClick={() => registerMutation.mutate()}
                  disabled={registerMutation.isPending}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  {registerMutation.isPending ? "Registering..." : "Register for Contest"}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {contest.registrationStatus === "NOT_OPEN"
                    ? `Registration opens ${formatDateTime(contest.registrationOpenAt)}.`
                    : "Registration is closed for this contest."}
                </p>
              )}
              {contest.isRegistered && contest.registrationStatus === "OPEN" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => unregisterMutation.mutate()}
                  disabled={unregisterMutation.isPending}
                >
                  {unregisterMutation.isPending ? "Withdrawing..." : "Withdraw registration"}
                </Button>
              )}
            </div>
          </Card>
        )}

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
