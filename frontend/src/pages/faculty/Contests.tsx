import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { AppLayout } from "@/components/AppLayout";
import { contestsApi } from "@/api/services";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function FacultyContests() {
  const pathname = "/faculty/contests";
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["faculty-contests"],
    queryFn: () => contestsApi.list({ pageSize: 100 }, pathname),
  });

  const contests = data?.items ?? [];

  return (
    <AppLayout>
      <div className="container space-y-6 py-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">My Contests</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage contests, monitor attempts, and publish results.</p>
          </div>
          <Link to="/faculty/create-contest">
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90">Create Contest</Button>
          </Link>
        </div>

        {isLoading && <Card className="p-6 text-center text-muted-foreground">Loading contests...</Card>}
        {isError && <Card className="p-6 text-center text-destructive">{(error as Error)?.message || "Failed to load contests"}</Card>}

        {!isLoading && !isError && (
          <div className="grid gap-4">
            {contests.length === 0 && (
              <Card className="border border-border bg-background p-5 text-sm text-muted-foreground shadow-none">
                No contests created yet.
              </Card>
            )}

            {contests.map((contest) => (
              <Card key={contest.id} className="border border-border bg-background p-5 shadow-none">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold">{contest.title}</h3>
                      <Badge>{contest.type}</Badge>
                      <Badge variant="outline">{contest.computedStatus}</Badge>
                      <Badge variant={contest.resultsPublished ? "default" : "outline"}>
                        {contest.resultsPublished ? "Results Published" : "Results Hidden"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Start: {new Date(contest.startAt).toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Duration: {contest.durationMinutes} mins • Participants: {contest.participantsCount}
                    </p>
                  </div>

                  <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
                    <Link to={`/faculty/contests/${contest.id}`}>Manage Contest</Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
