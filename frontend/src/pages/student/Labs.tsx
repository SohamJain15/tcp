import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { labApi, labSessionApi } from "@/api/services";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PATHNAME = "/student/labs";

export default function StudentLabs() {
  const labsQuery = useQuery({ queryKey: ["student-labs"], queryFn: () => labApi.listMine(PATHNAME) });
  const sessionsQuery = useQuery({
    queryKey: ["student-lab-sessions"],
    queryFn: () => labSessionApi.listMine(PATHNAME),
    refetchInterval: 30000,
  });

  const labs = labsQuery.data?.items ?? [];
  // Only sessions the student can act on right now: a live window to sit, or a finished one whose
  // results are published to review. Scheduled-but-not-started and closed-unpublished stay hidden.
  const sessions = (sessionsQuery.data?.items ?? []).filter(
    (session) => session.computedStatus === "Live" || session.resultsPublished,
  );

  return (
    <AppLayout>
      <div className="container space-y-6 px-3 py-5 sm:px-6 sm:py-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">Labs</p>
          <h1 className="mt-1 font-display text-3xl font-bold md:text-4xl">Your Labs</h1>
          <p className="mt-1 text-muted-foreground">
            Regular labs are open practice; tests are scheduled, timed sittings assigned to you.
          </p>
        </div>

        <Tabs defaultValue="regular">
          <TabsList className="rounded-none">
            <TabsTrigger value="regular" className="rounded-none">Unproctored</TabsTrigger>
            <TabsTrigger value="test" className="rounded-none">Proctored</TabsTrigger>
          </TabsList>

          <TabsContent value="regular" className="mt-4">
            {labsQuery.isLoading ? (
              <Card className="p-6 text-center text-muted-foreground">Loading…</Card>
            ) : labs.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">No labs are available for you right now.</Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {labs.map((lab) => (
                  <Card key={lab.id} className="profile-card space-y-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-accent">{lab.subject}</p>
                        <h2 className="mt-1 font-display text-xl font-bold">{lab.title}</h2>
                      </div>
                      <Badge className="rounded-none">{lab.kind}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {lab.experimentCount} experiment{lab.experimentCount === 1 ? "" : "s"} · {lab.totalPoints} marks
                    </div>
                    <Button asChild size="sm" className="w-fit">
                      <Link to={`/student/labs/${lab.id}`}>Open lab</Link>
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="test" className="mt-4">
            {sessionsQuery.isLoading ? (
              <Card className="p-6 text-center text-muted-foreground">Loading…</Card>
            ) : sessions.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">No active lab tests right now.</Card>
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
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
