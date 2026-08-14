import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { classTestApi } from "@/api/services";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const PATHNAME = "/student/class-tests";

export default function StudentClassTests() {
  const query = useQuery({
    queryKey: ["assigned-class-tests"],
    queryFn: () => classTestApi.listAssigned(PATHNAME),
    // A test can go live while the page is open — the Start button must appear on its own.
    refetchInterval: 30000,
  });

  const tests = query.data?.items ?? [];

  return (
    <AppLayout>
      <div className="container space-y-6 px-3 py-5 sm:px-6 sm:py-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">Class Test</p>
          <h1 className="mt-1 font-display text-3xl font-bold md:text-4xl">Your Class Tests</h1>
          <p className="mt-1 text-muted-foreground">
            Only tests your faculty has assigned to you appear here.
          </p>
        </div>

        {query.isLoading ? (
          <Card className="p-6 text-center text-muted-foreground">Loading…</Card>
        ) : tests.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            No class tests assigned to you right now.
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {tests.map((test) => {
              const finished = test.attemptStatus === "SUBMITTED" || test.attemptStatus === "AUTO_SUBMITTED";
              return (
                <Card key={test.id} className="profile-card space-y-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                        {test.subject}
                      </p>
                      <h2 className="mt-1 font-display text-xl font-bold">{test.title}</h2>
                    </div>
                    <Badge className="rounded-none">{test.computedStatus}</Badge>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    {new Date(test.startAt).toLocaleString()} · {test.durationMinutes} min ·{" "}
                    {test.questionCount} question{test.questionCount === 1 ? "" : "s"} · {test.totalPoints} marks
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {test.computedStatus === "Live" && !finished && (
                      <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
                        <Link to={`/student/class-tests/${test.id}`}>
                          {test.attemptStatus === "ACTIVE" ? "Resume test" : "Start test"}
                        </Link>
                      </Button>
                    )}
                    {test.computedStatus === "Scheduled" && (
                      <Button disabled variant="outline">
                        Opens {new Date(test.startAt).toLocaleTimeString()}
                      </Button>
                    )}
                    {finished && !test.resultsPublished && (
                      <span className="text-sm text-muted-foreground">
                        Submitted — results awaited
                      </span>
                    )}
                    {test.resultsPublished && (
                      <Button asChild variant="outline">
                        <Link to={`/student/class-tests/${test.id}`}>View result</Link>
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
