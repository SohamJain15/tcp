import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { labApi } from "@/api/services";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <p>This is a coding experiment.</p>
                        <Button asChild size="sm" variant="outline">
                          <Link to="/student/problems">Open the coding workspace</Link>
                        </Button>
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
