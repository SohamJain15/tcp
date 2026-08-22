import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { labApi, labSessionApi } from "@/api/services";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PATHNAME = "/faculty/labs";

export default function FacultyLabs() {
  const labsQuery = useQuery({ queryKey: ["faculty-labs"], queryFn: () => labApi.list(PATHNAME) });
  const sessionsQuery = useQuery({ queryKey: ["faculty-lab-sessions"], queryFn: () => labSessionApi.list(PATHNAME) });

  const labs = labsQuery.data?.items ?? [];
  const sessions = sessionsQuery.data?.items ?? [];

  return (
    <AppLayout>
      <div className="container space-y-6 px-3 py-5 sm:px-6 sm:py-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">Labs</p>
          <h1 className="mt-1 font-display text-3xl font-bold md:text-4xl">Manage Labs</h1>
          <p className="mt-1 text-muted-foreground">
            Regular labs are self-paced practice; tests are scheduled, proctored, auto-graded sittings built from a lab.
          </p>
        </div>

        <Tabs defaultValue="regular">
          <TabsList className="rounded-none">
            <TabsTrigger value="regular" className="rounded-none">Regular</TabsTrigger>
            <TabsTrigger value="test" className="rounded-none">Test</TabsTrigger>
          </TabsList>

          <TabsContent value="regular" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Button asChild size="sm">
                <Link to="/faculty/labs/create">New lab</Link>
              </Button>
            </div>
            {labsQuery.isLoading ? (
              <Card className="p-6 text-center text-muted-foreground">Loading…</Card>
            ) : labs.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">You haven't created any labs yet.</Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {labs.map((lab) => (
                  <Card key={lab.id} className="profile-card space-y-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-accent">{lab.subject}</p>
                        <h2 className="mt-1 font-display text-xl font-bold">{lab.title}</h2>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge className="rounded-none">{lab.kind}</Badge>
                        <Badge variant="outline" className="rounded-none">{lab.lifecycleState}</Badge>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {lab.experiments.length} experiment{lab.experiments.length === 1 ? "" : "s"}
                    </div>
                    <Button asChild size="sm" variant="outline" className="w-fit">
                      <Link to={`/faculty/labs/${lab.id}/edit`}>Edit</Link>
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="test" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Button asChild size="sm">
                <Link to="/faculty/lab-sessions/create">Schedule session</Link>
              </Button>
            </div>
            {sessionsQuery.isLoading ? (
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
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
