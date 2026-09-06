import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";

import { labApi } from "@/api/services";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LabJoinGate } from "@/components/LabJoinGate";

/**
 * The experiment list for one lab.
 *
 * Just a list: each experiment opens its own full-screen workspace at
 * `/student/labs/:id/experiments/:expId`. Previously every experiment expanded inline, which put a
 * scrolling editor inside a scrolling page and let a student drift from one experiment into the
 * next without ever leaving the same screen.
 */
export default function LabDetail() {
  const { id = "" } = useParams();
  const pathname = `/student/labs/${id}`;

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

        {/* A live lab session is running and this student has not been admitted: the backend has
            already redacted the experiments, so all there is to show is the way in. */}
        {lab.attendance && lab.attendance.status !== "ADMITTED" ? (
          <LabJoinGate labId={id} attendance={lab.attendance} labTitle={lab.title} />
        ) : (
        <div className="space-y-3">
          {lab.experiments.map((experiment) => {
            const progress = progressById.get(experiment.id);
            return (
              <Card key={experiment.id} className="profile-card overflow-hidden">
                <Link
                  to={`/student/labs/${id}/experiments/${experiment.id}`}
                  className="flex w-full items-start justify-between gap-3 p-5 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      Experiment {experiment.number}. {experiment.title}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{experiment.aim}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className="rounded-none uppercase">
                      {experiment.kind === "sql" ? "SQL" : "Code"}
                    </Badge>
                    {progress?.passed && <Badge className="rounded-none bg-emerald-600">Solved</Badge>}
                    <span className="whitespace-nowrap text-xs text-muted-foreground">{experiment.points} marks</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              </Card>
            );
          })}
        </div>
        )}
      </div>
    </AppLayout>
  );
}
