import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { toast } from "sonner";

import { contestsApi } from "@/api/services";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContestCodingBody } from "@/components/ContestCodingBody";
import { ContestLockOverlay } from "@/components/ContestLockOverlay";
import { ContestObjectiveQuestion } from "@/components/ContestObjectiveQuestion";
import { ContestQuestionNav } from "@/components/ContestQuestionNav";
import { ContestScreenGuard } from "@/components/ContestScreenGuard";
import { ContestSubmitDialog } from "@/components/ContestSubmitDialog";
import { ContestTimer } from "@/components/ContestTimer";
import { ContestWatermark } from "@/components/ContestWatermark";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useContestCodeDrafts } from "@/hooks/useContestCodeDrafts";
import { useVisitedQuestions } from "@/hooks/useVisitedQuestions";
import type { ContestAttempt, ExecutableLanguage } from "@/api/types";
import { useContestProctoring } from "./useContestProctoring";

/**
 * One question of a live contest attempt. Coding and objective questions share this shell but each
 * renders keyed by questionId, so navigating gives every question its own isolated body — its own
 * editor/verdict for coding, its own saved selection for objective. This page is only for an ACTIVE
 * attempt; anything else redirects to the contest page (pre-flight / pending / published report).
 */
export default function ContestQuestionPage() {
  const { id = "", questionId = "" } = useParams();
  const pathname = `/student/contests/${id}/questions/${questionId}`;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [navSheetOpen, setNavSheetOpen] = useState(false);
  const { visitedIds, markVisited } = useVisitedQuestions(id);
  const { getDraft, getLanguage } = useContestCodeDrafts(id);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["contest-question-detail", id, questionId],
    queryFn: () => contestsApi.getQuestionDetail(id, questionId, pathname),
    enabled: Boolean(id && questionId),
    retry: false,
  });

  // The full question list powers the left rail; shares the contest-detail cache key.
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

  const attempt = data?.attempt ?? null;
  const question = data?.question;
  const contest = data?.contest;
  const attemptIsActive = attempt?.status === "ACTIVE";

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
    mutationFn: async () => {
      // Flush the question on screen before finalising — its auto-save is debounced, so the last
      // second of typing may not have reached the server yet. Other questions were already flushed
      // when the student navigated away from them.
      const draftLanguage = getLanguage(questionId);
      const draftCode = draftLanguage ? getDraft(questionId, draftLanguage) : null;
      if (draftCode) {
        try {
          await contestsApi.saveCodingDraft(id, { questionId, code: draftCode, language: draftLanguage as ExecutableLanguage }, pathname);
        } catch {
          // Best-effort: a failed flush must never block submitting the test.
        }
      }

      return contestsApi.submitAttempt(id, pathname);
    },
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

  // A violation-triggered auto-submit can land mid-question — leave for the contest page.
  const attemptStatus = attempt?.status;
  useEffect(() => {
    if (attemptStatus && attemptStatus !== "ACTIVE") {
      navigate(`/student/contests/${id}`);
    }
  }, [attemptStatus, id, navigate]);

  if (!id || !questionId) {
    return <Navigate to="/student/contests" replace />;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <div className="container py-8 text-muted-foreground">Loading question...</div>
      </div>
    );
  }

  // The question endpoint 409s once the contest is not live/active — send the student to the contest
  // page, which shows the correct state (pre-flight, results pending, or the published report).
  if (isError || !data || !contest || !question || !attemptIsActive || contest.computedStatus !== "Live") {
    return <Navigate to={`/student/contests/${id}`} replace />;
  }

  if (isObscured) {
    return <ContestScreenGuard />;
  }

  if (isLocked) {
    return <ContestLockOverlay onReturnToFullscreen={requestFullscreen} violationCount={violationCount} />;
  }

  const allQuestions = contestDetailQuery.data?.contest.questions ?? [];
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
      {watermarkPrimary && (
        <ContestWatermark primary={watermarkPrimary} secondary={attempt?.userEmail ?? undefined} />
      )}

      <header className="shrink-0 border-b border-border bg-card">
        <div className="flex h-12 items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2">
            {allQuestions.length > 0 && (
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
                Time {question.timeLimitSeconds}s {"•"} Mem {question.memoryLimitMb} MB
              </span>
            )}
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Violations: {attempt?.violationCount ?? 0}/{contest.maxViolations}
            </span>
            <ContestTimer deadline={attempt?.deadlineAt} className="py-1" />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {allQuestions.length > 0 && <div className="hidden w-64 shrink-0 lg:block">{questionNav}</div>}

        <main className="min-w-0 flex-1 overflow-hidden">
          {question.type === "Coding" ? (
            <ContestCodingBody
              key={questionId}
              contestId={id}
              questionId={questionId}
              pathname={pathname}
              question={question}
              attempt={attempt}
              attemptIsActive={attemptIsActive}
              onAfterSubmit={() => void refetch()}
            />
          ) : (
            <ContestObjectiveQuestion
              key={questionId}
              contestId={id}
              pathname={pathname}
              question={question}
              attempt={attempt}
              attemptIsActive={attemptIsActive}
              onAttemptUpdate={updateAttemptInCache}
            />
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
