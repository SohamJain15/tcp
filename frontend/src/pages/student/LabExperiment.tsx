import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { labApi } from "@/api/services";
import type { ExecutableLanguage } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContestCodingBody } from "@/components/ContestCodingBody";
import { SqlExperimentBody } from "@/components/workspace/SqlExperimentBody";

/**
 * One lab experiment, full screen.
 *
 * Each experiment gets its own route and its own workspace. The lab page used to stack every
 * experiment into one continuous accordion, which meant an inner scrolling editor inside an outer
 * scrolling page and no way to link a student to the experiment they are stuck on.
 *
 * There is deliberately no `AppLayout` here: a nav bar costs the height the editor needs, and the
 * back link is right there in the header.
 *
 * This is a *self-paced* lab, so the clipboard stays open — copy/paste is blocked only in
 * proctored lab sessions, class tests and contests.
 */
export default function LabExperiment() {
  const { id = "", expId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = `/student/labs/${id}`;

  const query = useQuery({
    // Same key the lab page uses, so arriving from the list is instant and prev/next needs no fetch.
    queryKey: ["student-lab", id],
    queryFn: () => labApi.getMine(id, pathname),
    enabled: Boolean(id),
  });

  const lab = query.data?.lab;
  const experiments = lab?.experiments ?? [];
  const index = experiments.findIndex((experiment) => experiment.id === expId);
  const experiment = index >= 0 ? experiments[index] : null;
  const previous = index > 0 ? experiments[index - 1] : null;
  const next = index >= 0 && index < experiments.length - 1 ? experiments[index + 1] : null;
  const progress = lab?.progress.find((entry) => entry.experimentId === expId);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["student-lab", id] });

  // "[" and "]" move between experiments, the way a paginated reader does. Ignored while typing so
  // a bracket in the editor never navigates away.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, .monaco-editor, [contenteditable='true']")) {
        return;
      }
      if (event.key === "[" && previous) {
        navigate(`/student/labs/${id}/experiments/${previous.id}`);
      } else if (event.key === "]" && next) {
        navigate(`/student/labs/${id}/experiments/${next.id}`);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [id, navigate, next, previous]);

  if (query.isLoading || !lab) {
    return <div className="p-8 text-muted-foreground">Loading…</div>;
  }

  // A stale link, or an experiment redacted because the student has not been admitted yet.
  if (!experiment) {
    return <Navigate to={`/student/labs/${id}`} replace />;
  }

  return (
    // 100dvh, not 100vh: under a mobile browser's URL bar the latter overflows and pushes the
    // Run/Submit row off-screen.
    <div className="flex h-[100dvh] flex-col bg-background">
      <header className="flex h-12 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link to={`/student/labs/${id}`} className="shrink-0 text-sm text-muted-foreground hover:underline">
            ← {lab.title}
          </Link>
          <span className="hidden truncate text-sm text-muted-foreground sm:inline">
            Experiment {experiment.number} of {experiments.length}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {progress?.passed && <Badge className="rounded-none bg-emerald-600">Solved</Badge>}
          <span className="whitespace-nowrap text-xs text-muted-foreground">{experiment.points} marks</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!previous}
            onClick={() => previous && navigate(`/student/labs/${id}/experiments/${previous.id}`)}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Previous experiment</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!next}
            onClick={() => next && navigate(`/student/labs/${id}/experiments/${next.id}`)}
          >
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Next experiment</span>
          </Button>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        {experiment.kind === "sql" ? (
          <SqlExperimentBody
            key={experiment.id}
            labId={lab.id}
            experimentId={experiment.id}
            title={experiment.title}
            aim={experiment.aim}
            points={experiment.points}
            schemaSql={experiment.schemaSql}
            pathname={pathname}
            onSolved={invalidate}
            autoSaveId="lab-experiment-sql"
            stackedWorkHeight="100%"
          />
        ) : (
          <ContestCodingBody
            key={experiment.id}
            contestId={lab.id}
            questionId={experiment.id}
            pathname={pathname}
            attemptIsActive
            // A practice lab is not an exam: students may paste in their own work.
            lockClipboard={false}
            onAfterSubmit={invalidate}
            autoSaveId="lab-experiment-coding"
            stackedWorkHeight="100%"
            question={{
              id: experiment.id,
              title: experiment.title,
              problemStatement: experiment.aim,
              constraints: experiment.constraints,
              inputFormat: experiment.inputFormat,
              outputFormat: experiment.outputFormat,
              sampleTestCases: experiment.sampleTestCases ?? [],
              supportedLanguages: experiment.supportedLanguages as ExecutableLanguage[] | undefined,
            }}
            codingApi={{
              run: (input) =>
                labApi.runCoding(
                  lab.id,
                  { experimentId: input.questionId, code: input.code, language: input.language },
                  pathname,
                ),
              submit: (input) =>
                labApi.submitCoding(
                  lab.id,
                  { experimentId: input.questionId, code: input.code, language: input.language },
                  pathname,
                ),
              saveDraft: (input) =>
                labApi.saveCodingDraft(
                  lab.id,
                  { experimentId: input.questionId, code: input.code, language: input.language },
                  pathname,
                ),
            }}
          />
        )}
      </main>
    </div>
  );
}
