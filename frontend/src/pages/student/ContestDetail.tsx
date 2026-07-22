import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Eye,
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
import { Checkbox } from "@/components/ui/checkbox";
import { ContestLockOverlay } from "@/components/ContestLockOverlay";
import { ContestQuestionNav } from "@/components/ContestQuestionNav";
import { ContestScreenGuard } from "@/components/ContestScreenGuard";
import { ContestSubmitDialog } from "@/components/ContestSubmitDialog";
import { ContestTimer } from "@/components/ContestTimer";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useVisitedQuestions } from "@/hooks/useVisitedQuestions";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { useContestProctoring } from "./useContestProctoring";

function difficultyBadgeClass(difficulty: "Easy" | "Medium" | "Hard"): string {
  if (difficulty === "Easy") return "bg-green-100 text-green-800";
  if (difficulty === "Medium") return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
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
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [revealedAnswers, setRevealedAnswers] = useState<Record<string, boolean>>({});
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [navSheetOpen, setNavSheetOpen] = useState(false);
  const { visitedIds, markVisited } = useVisitedQuestions(id);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["contest-detail", id],
    queryFn: () => contestsApi.getStudentDetail(id, pathname),
    enabled: Boolean(id),
  });

  const contest = data?.contest;
  const attempt = contest?.attempt ?? null;
  const report = contest?.report ?? null;

  // Stable identity: the proctoring hook keys its listener set on this callback, so a new
  // function every render would tear down and re-attach every listener.
  const updateAttemptInCache = useCallback(
    (nextAttempt: ContestAttempt) => {
      queryClient.setQueryData(["contest-detail", id], (current: typeof data) =>
        current ? { contest: { ...current.contest, attempt: nextAttempt } } : current,
      );
    },
    [id, queryClient],
  );

  const { isLocked, isObscured, violationCount, requestFullscreen } = useContestProctoring({
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
      setSubmitDialogOpen(false);
      if (document.fullscreenElement && document.exitFullscreen) {
        try {
          await document.exitFullscreen();
        } catch {
          // Let the page continue even if the browser refuses to exit fullscreen.
        }
      }
      toast.success("Test submitted successfully");
      await refetch();
    },
    onError: (mutationError) => {
      toast.error((mutationError as Error)?.message || "Failed to submit the test");
    },
  });

  const standings = useMemo(() => standingsData?.items ?? [], [standingsData?.items]);

  // When the clock runs out we finalise the attempt ourselves so the student lands on their
  // report rather than a dead page. The backend enforces the same deadline independently.
  const handleTimeUp = useCallback(() => {
    if (attempt?.status !== "ACTIVE" || submitAttemptMutation.isPending) {
      return;
    }

    toast.warning("Time is up. Submitting your contest.");
    submitAttemptMutation.mutate();
  }, [attempt?.status, submitAttemptMutation]);

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
  const showQuestions = contestEnded || attemptIsActive;
  const showReport = Boolean(report) && (contest.resultsPublished || contestEnded);
  // The pre-flight screen: contest is live, the student has not started, and there is nothing
  // to report yet. This replaces the old scattered cards with one focused call to action.
  const showPreflight = canAttempt && !attempt && !showReport;
  const submittedWhileLive = canAttempt && attemptIsLocked;

  // Focus loss blanks the page before anything else, so an off-browser capture gets nothing.
  if (isObscured) {
    return <ContestScreenGuard />;
  }

  if (isLocked) {
    return <ContestLockOverlay onReturnToFullscreen={requestFullscreen} violationCount={violationCount} />;
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

  const questionNav = (
    <ContestQuestionNav
      contestId={id}
      questions={contest.questions}
      attempt={attempt}
      visitedIds={visitedIds}
      maxViolations={contest.maxViolations}
      onSelectQuestion={(question) => {
        markVisited(question.id);
        setNavSheetOpen(false);
      }}
      onSubmitTest={() => setSubmitDialogOpen(true)}
      onTimeUp={handleTimeUp}
      isSubmitting={submitAttemptMutation.isPending}
    />
  );

  return (
    <AppLayout hideNavbar={attemptIsActive} hideFooter={attemptIsActive}>
      <div className={cn(attemptIsActive && contest.questions.length > 0 && "flex min-h-[calc(100vh-3rem)]")}>
        {attemptIsActive && contest.questions.length > 0 && (
          <div className="sticky top-0 hidden h-[calc(100vh-3rem)] w-64 shrink-0 lg:block">{questionNav}</div>
        )}

        <div className="min-w-0 flex-1">
          {attemptIsActive && contest.questions.length > 0 && (
            <div className="border-b border-border bg-card px-4 py-2 lg:hidden">
              <Sheet open={navSheetOpen} onOpenChange={setNavSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm">
                    <ListChecks className="mr-1.5 h-4 w-4" /> Questions
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
                  {questionNav}
                </SheetContent>
              </Sheet>
            </div>
          )}

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
              {attemptIsActive && (
                <ContestTimer deadline={attempt?.deadlineAt} onExpire={handleTimeUp} />
              )}
              {!attempt && canAttempt && contest.isRegistered && (
                <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => startAttemptMutation.mutate()} disabled={startAttemptMutation.isPending}>
                  {startAttemptMutation.isPending ? "Starting..." : "Start Test"}
                </Button>
              )}
              {/* Submittable at any point — the confirmation dialog surfaces what is unfinished. */}
              {attemptIsActive && (
                <Button
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                  onClick={() => setSubmitDialogOpen(true)}
                  disabled={submitAttemptMutation.isPending}
                >
                  {submitAttemptMutation.isPending ? "Submitting..." : "Submit Test"}
                </Button>
              )}
            </div>
          </div>
        )}

        {!showReport && (attemptIsActive ? (
          <Alert variant="destructive">
            <AlertTitle>Proctored Session</AlertTitle>
            <AlertDescription>
              Copy, paste and right-click are disabled. Leaving fullscreen, switching tabs and taking
              screenshots are recorded and cost 5 points each — the test is submitted automatically at{" "}
              {contest.maxViolations} violations. You are at {attempt?.violationCount ?? 0}.
            </AlertDescription>
          </Alert>
        ) : contestEnded ? (
          <Alert>
            <AlertTitle>Contest Review & Practice</AlertTitle>
            <AlertDescription>
              This contest has ended. Objective solutions are now visible, and coding questions can be explored in practice mode without affecting rankings or your scored attempt.
            </AlertDescription>
          </Alert>
        ) : null)}

        {!showReport && submittedWhileLive && (
          <Card className="border border-success/40 bg-success/10 p-5 text-center shadow-none">
            <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
            <h2 className="mt-3 font-display text-xl font-bold">Attempt Submitted</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Your answers are locked in. Questions and your report unlock when the contest closes.
            </p>
            <div className="mt-4 flex justify-center">
              <ContestTimer deadline={contest.endAt} label="Contest closes in" />
            </div>
          </Card>
        )}

        {!showReport && attemptIsLocked && contestEnded && (
          <Card className="border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200 shadow-none">
            This attempt is {attempt?.status.toLowerCase().replace(/_/g, " ")}. Scored contest actions are
            locked. You can still review the questions below and open coding questions in practice mode.
          </Card>
        )}

        {!showReport && contestEnded && !contest.resultsPublished && (
          <Card className="border border-border bg-background p-4 text-sm text-muted-foreground shadow-none">
            The contest is over, so questions and solutions are visible now. Leaderboard ranks stay hidden until faculty publishes results.
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

        {contest.computedStatus === "Upcoming" ? (
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
        ) : !showQuestions ? null : (
          contest.questions.map((question) => {
          const state = attempt?.questionStates.find((entry) => entry.questionId === question.id);
          const status = state?.status ?? "UNATTEMPTED";
          const answerValue = answers[question.id];

          return (
            <Card
              key={question.id}
              id={`question-${question.id}`}
              className="scroll-mt-6 border border-border bg-background p-5 shadow-none"
            >
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
                    <Link to={`/student/contests/${id}/questions/${question.id}`}>
                      {contestEnded ? "Open Practice Workspace" : "Open Workspace"}
                    </Link>
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
                  {attemptIsActive && (
                    <Button onClick={() => answerMutation.mutate({ questionId: question.id, answer: typeof answerValue === "string" ? answerValue : "" })} disabled={typeof answerValue !== "string" || answerValue.length === 0 || answerMutation.isPending}>
                      Submit Answer
                    </Button>
                  )}
                  {contestEnded && question.correctAnswer && (
                    revealedAnswers[question.id] ? (
                      <Card className="border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm shadow-none">
                        Correct answer: <span className="font-semibold text-foreground">{question.correctAnswer}</span>
                      </Card>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRevealedAnswers((current) => ({ ...current, [question.id]: true }))}
                      >
                        <Eye className="mr-2 h-4 w-4" /> View Answer
                      </Button>
                    )
                  )}
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
                  {attemptIsActive && (
                    <Button onClick={() => answerMutation.mutate({ questionId: question.id, answer: Array.isArray(answerValue) ? answerValue : [] })} disabled={!Array.isArray(answerValue) || answerValue.length === 0 || answerMutation.isPending}>
                      Submit Answer
                    </Button>
                  )}
                  {contestEnded && Array.isArray(question.correctAnswer) && (
                    revealedAnswers[question.id] ? (
                      <Card className="border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm shadow-none">
                        Correct answers: <span className="font-semibold text-foreground">{question.correctAnswer.join(", ")}</span>
                      </Card>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRevealedAnswers((current) => ({ ...current, [question.id]: true }))}
                      >
                        <Eye className="mr-2 h-4 w-4" /> View Answer
                      </Button>
                    )
                  )}
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
        </div>
      </div>

      <ContestSubmitDialog
        open={submitDialogOpen}
        onOpenChange={setSubmitDialogOpen}
        questions={contest.questions}
        attempt={attempt}
        visitedIds={visitedIds}
        onConfirm={() => submitAttemptMutation.mutate()}
        isSubmitting={submitAttemptMutation.isPending}
      />
    </AppLayout>
  );
}
