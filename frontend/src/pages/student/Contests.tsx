import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { contestsApi } from "@/api/services";
import type { ContestListItem } from "@/api/types";

function getContestCta(status: "Live" | "Upcoming" | "Past", hasAttempted: boolean): string {
  if (status === "Live") {
    return "Enter Contest";
  }
  if (status === "Upcoming") {
    return "View Contest";
  }
  return hasAttempted ? "View Report" : "Review";
}

function getAttemptStatusLabel(status: ContestListItem["attemptStatus"]): string {
  switch (status) {
    case "ACTIVE":
      return "In Progress";
    case "SUBMITTED":
      return "Submitted";
    case "AUTO_SUBMITTED":
      return "Auto Submitted";
    case "DISQUALIFIED":
      return "Disqualified";
    default:
      return "Not Attempted";
  }
}

function renderContestCards(
  contests: Awaited<ReturnType<typeof contestsApi.list>>["items"],
  pathname: string,
) {
  if (contests.length === 0) {
    return (
      <Card className="border border-border bg-background p-5 text-sm text-muted-foreground">
        No contests in this section.
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {contests.map((contest) => (
        <Card key={contest.id} className="border border-border bg-background p-5 transition-all duration-200 hover:shadow-md">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold">{contest.title}</h3>
                <Badge className={contest.type === "Rated" ? "bg-blue-600 text-white hover:bg-blue-600" : ""}>
                  {contest.type}
                </Badge>
                <Badge variant="outline">{contest.studentListStatus}</Badge>
                <Badge variant="outline">{getAttemptStatusLabel(contest.attemptStatus)}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Time: {new Date(contest.startAt).toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground">
                Duration: {contest.durationMinutes} mins • Participants: {contest.participantsCount}
              </p>
            </div>

            <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to={`/student/contests/${contest.id}`}>{getContestCta(contest.studentListStatus, contest.hasAttempted)}</Link>
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function Contests() {
  const pathname = "/student/contests";
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["student-contests"],
    queryFn: () => contestsApi.list({ pageSize: 100 }, pathname),
  });

  const contests = data?.items ?? [];
  const liveContests = contests.filter((contest) => contest.studentListStatus === "Live");
  const upcomingContests = contests.filter((contest) => contest.studentListStatus === "Upcoming");
  const pastContests = contests.filter((contest) => contest.studentListStatus === "Past");

  return (
    <AppLayout>
      <div className="container mx-auto space-y-6 p-6 md:p-8">
          <div>
            <h1 className="font-display text-3xl font-bold">Contests</h1>
            <p className="mt-1 text-sm text-muted-foreground">Official T&P Assessments and Practice Rounds.</p>
          </div>

          {isLoading && <Card className="p-6 text-center text-muted-foreground">Loading contests...</Card>}
          {isError && (
            <Card className="p-6 text-center text-destructive">
              {(error as Error)?.message || "Failed to load contests"}
            </Card>
          )}

          {!isLoading && !isError && (
            <Tabs defaultValue="live" className="space-y-4">
              <TabsList>
                <TabsTrigger value="live">Live</TabsTrigger>
                <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                <TabsTrigger value="past">Past</TabsTrigger>
              </TabsList>

              <TabsContent value="live">{renderContestCards(liveContests, pathname)}</TabsContent>
              <TabsContent value="upcoming">{renderContestCards(upcomingContests, pathname)}</TabsContent>
              <TabsContent value="past">{renderContestCards(pastContests, pathname)}</TabsContent>
            </Tabs>
          )}
      </div>
    </AppLayout>
  );
}
