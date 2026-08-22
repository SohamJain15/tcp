import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { labApi } from "@/api/services";
import type { ExecutableLanguage } from "@/api/types";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ContestCodingBody } from "@/components/ContestCodingBody";
import { SqlWorkspace } from "@/components/SqlWorkspace";

export default function LabDetail() {
  const { id = "" } = useParams();
  const pathname = `/student/labs/${id}`;
  const queryClient = useQueryClient();
  const [openExperiment, setOpenExperiment] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["student-lab", id],
    queryFn: () => labApi.getMine(id, pathname),
    enabled: Boolean(id),
  });

  const lab = query.data?.lab;
  const progressById = new Map((lab?.progress ?? []).map((entry) => [entry.experimentId, entry]));

  if (query.isLoading || !lab) {
    return (
      <AppLayout>
        <div className="container py-8 text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container space-y-6 px-3 py-5 sm:px-6 sm:py-8">
        <div>
          <Link to="/student/labs" className="text-sm text-muted-foreground hover:underline">
            ← All labs
          </Link>
          <p className="mt-2 text-sm font-semibold uppercase tracking-widest text-accent">{lab.subject}</p>
          <h1 className="mt-1 font-display text-3xl font-bold">{lab.title}</h1>
          {lab.description && <p className="mt-2 text-muted-foreground">{lab.description}</p>}
        </div>

        <div className="space-y-3">
          {lab.experiments.map((experiment) => {
            const progress = progressById.get(experiment.id);
            const open = openExperiment === experiment.id;
            return (
              <Card key={experiment.id} className="profile-card overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 p-5 text-left"
                  onClick={() => setOpenExperiment(open ? null : experiment.id)}
                >
                  <div>
                    <p className="text-sm font-semibold">
                      Experiment {experiment.number}. {experiment.title}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{experiment.aim}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {progress?.passed && <Badge className="rounded-none bg-emerald-600">Solved</Badge>}
                    <span className="whitespace-nowrap text-xs text-muted-foreground">{experiment.points} marks</span>
                  </div>
                </button>

                {open && (
                  <div className="border-t border-border p-5">
                    {experiment.kind === "sql" ? (
                      <SqlWorkspace
                        labId={lab.id}
                        experimentId={experiment.id}
                        schemaSql={experiment.schemaSql}
                        pathname={pathname}
                        onSolved={() => queryClient.invalidateQueries({ queryKey: ["student-lab", id] })}
                      />
                    ) : (
                      <div className="border border-border lg:h-[70vh]">
                        <ContestCodingBody
                          key={experiment.id}
                          contestId={lab.id}
                          questionId={experiment.id}
                          pathname={pathname}
                          attemptIsActive
                          onAfterSubmit={() => queryClient.invalidateQueries({ queryKey: ["student-lab", id] })}
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
                              labApi.runCoding(lab.id, { experimentId: input.questionId, code: input.code, language: input.language }, pathname),
                            submit: (input) =>
                              labApi.submitCoding(lab.id, { experimentId: input.questionId, code: input.code, language: input.language }, pathname),
                            saveDraft: (input) =>
                              labApi.saveCodingDraft(lab.id, { experimentId: input.questionId, code: input.code, language: input.language }, pathname),
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
