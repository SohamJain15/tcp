import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { labSessionApi } from "@/api/services";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const PATHNAME = "/faculty/lab-sessions";

export default function FacultyLabSessions() {
  const query = useQuery({ queryKey: ["faculty-lab-sessions"], queryFn: () => labSessionApi.list(PATHNAME) });
  const sessions = query.data?.items ?? [];

  return (
    <AppLayout>
      <div className="container space-y-6 px-3 py-5 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-accent">Lab Sessions</p>
            <h1 className="mt-1 font-display text-3xl font-bold md:text-4xl">Scheduled sessions</h1>
            <p className="mt-1 text-muted-foreground">Assign a lab as a timed, proctored, auto-graded assessment.</p>
          </div>
          <Button asChild>
            <Link to="/faculty/lab-sessions/create">Schedule session</Link>
          </Button>
        </div>

        {query.isLoading ? (
          <Card className="p-6 text-center text-muted-foreground">Loading…</Card>
        ) : sessions.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">No sessions scheduled yet.</Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sessions.map((session) => (
              <Card key={session.id} className="profile-card space-y-2 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-accent">{session.subject}</p>
                    <h2 className="mt-1 font-display text-xl font-bold">{session.title}</h2>
                  </div>
                  <Badge className="rounded-none">{session.kind}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {new Date(session.startAt).toLocaleString()} · {session.durationMinutes} min ·{" "}
                  {session.experiments.length} experiment{session.experiments.length === 1 ? "" : "s"} ·{" "}
                  {session.assignedStudents.length} assigned
                </p>
                <Button asChild size="sm" variant="outline" className="w-fit">
                  <Link to={`/faculty/lab-sessions/${session.id}`}>View attempts</Link>
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
