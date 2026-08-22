import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { labSessionApi } from "@/api/services";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const PATHNAME = "/student/lab-sessions";

export default function StudentLabSessions() {
  const query = useQuery({
    queryKey: ["student-lab-sessions"],
    queryFn: () => labSessionApi.listMine(PATHNAME),
    refetchInterval: 30000,
  });
  const sessions = query.data?.items ?? [];

  return (
    <AppLayout>
      <div className="container space-y-6 px-3 py-5 sm:px-6 sm:py-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">Lab Sessions</p>
          <h1 className="mt-1 font-display text-3xl font-bold md:text-4xl">Your lab sessions</h1>
          <p className="mt-1 text-muted-foreground">Scheduled, timed lab assessments assigned to you.</p>
        </div>

        {query.isLoading ? (
          <Card className="p-6 text-center text-muted-foreground">Loading…</Card>
        ) : sessions.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">No lab sessions assigned to you right now.</Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sessions.map((session) => {
              const finished = session.attemptStatus === "SUBMITTED" || session.attemptStatus === "AUTO_SUBMITTED";
              return (
                <Card key={session.id} className="profile-card space-y-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-accent">{session.subject}</p>
                      <h2 className="mt-1 font-display text-xl font-bold">{session.title}</h2>
                    </div>
                    <Badge className="rounded-none">{session.computedStatus}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(session.startAt).toLocaleString()} · {session.durationMinutes} min ·{" "}
                    {session.experimentCount} experiment{session.experimentCount === 1 ? "" : "s"} · {session.totalPoints} marks
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {session.computedStatus === "Live" && !finished && (
                      <Button asChild size="sm">
                        <Link to={`/student/lab-sessions/${session.id}`}>
                          {session.attemptStatus === "ACTIVE" ? "Resume" : "Start"}
                        </Link>
                      </Button>
                    )}
                    {finished && <Badge variant="outline" className="rounded-none">Submitted</Badge>}
                    {session.resultsPublished && (
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/student/lab-sessions/${session.id}`}>View result</Link>
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
