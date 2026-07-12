import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Clock, History, Radio, Users } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { contestsApi } from "@/api/services";
import type { ContestListItem } from "@/api/types";

function getContestCta(status: "Live" | "Upcoming" | "Past", hasAttempted: boolean): string {
  if (status === "Live") {
    return "Enter Contest";
  }
  if (status === "Upcoming") {
    return "View Contest";
  }
  return hasAttempted ? "View Report & Practice" : "Practice Contest";
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

function ContestCard({ contest }: { contest: ContestListItem }) {
  return (
    <Card className="card-interactive flex h-full flex-col border border-border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 font-semibold leading-snug">{contest.title}</h3>
        <Badge className={contest.type === "Rated" ? "bg-blue-600 text-white hover:bg-blue-600" : ""}>
          {contest.type}
        </Badge>
      </div>
      <div className="mt-2">
        <Badge variant="outline">{getAttemptStatusLabel(contest.attemptStatus)}</Badge>
      </div>

      <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          {new Date(contest.startAt).toLocaleString()}
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          {contest.durationMinutes} mins
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 shrink-0" />
          {contest.participantsCount} participants
        </div>
      </div>

      <div className="mt-auto pt-4">
        <Button asChild size="sm" className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
          <Link to={`/student/contests/${contest.id}`}>
            {getContestCta(contest.studentListStatus, contest.hasAttempted)}
          </Link>
        </Button>
      </div>
    </Card>
  );
}

function ContestSection({
  title,
  icon: Icon,
  accentClass,
  contests,
  emptyMessage,
  alwaysVisible = false,
}: {
  title: string;
  icon: typeof Radio;
  accentClass: string;
  contests: ContestListItem[];
  emptyMessage: string;
  alwaysVisible?: boolean;
}) {
  if (contests.length === 0 && !alwaysVisible) {
    return null;
  }

  return (
    <section className="border border-border bg-card/50">
      <div className="sticky top-16 z-10 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", accentClass)} />
          <h2 className="font-display text-sm font-bold uppercase tracking-widest">{title}</h2>
          <span className="text-xs text-muted-foreground">({contests.length})</span>
        </div>
      </div>
      <div className="p-4">
        {contests.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {contests.map((contest) => (
              <ContestCard key={contest.id} contest={contest} />
            ))}
          </div>
        )}
      </div>
    </section>
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
      <div className="container space-y-6 py-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Contests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compete, climb the leaderboard, and sharpen your competitive coding skills.
          </p>
        </div>

        {isLoading && <Card className="p-6 text-center text-muted-foreground">Loading contests...</Card>}
        {isError && (
          <Card className="p-6 text-center text-destructive">
            {(error as Error)?.message || "Failed to load contests"}
          </Card>
        )}

        {!isLoading && !isError && (
          <div className="space-y-6">
            <ContestSection
              title="Live Contests"
              icon={Radio}
              accentClass="text-success"
              contests={liveContests}
              emptyMessage="No live contests right now."
              alwaysVisible
            />
            <ContestSection
              title="Upcoming Contests"
              icon={CalendarClock}
              accentClass="text-accent"
              contests={upcomingContests}
              emptyMessage="No upcoming contests scheduled."
              alwaysVisible
            />
            <ContestSection
              title="Past Contests"
              icon={History}
              accentClass="text-muted-foreground"
              contests={pastContests}
              emptyMessage="No past contests."
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
