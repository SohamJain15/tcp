import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Clock, History, Radio, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ContestTimer } from "@/components/ContestTimer";
import { cn } from "@/lib/utils";
import { contestsApi } from "@/api/services";
import { formatDateTime } from "@/lib/datetime";
import type { ContestListItem } from "@/api/types";

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

function attemptStatusBadgeClass(status: ContestListItem["attemptStatus"]): string {
  if (status === "SUBMITTED" || status === "AUTO_SUBMITTED") {
    return "bg-success text-success-foreground hover:bg-success";
  }
  if (status === "ACTIVE") {
    return "bg-warning text-warning-foreground hover:bg-warning";
  }
  return "";
}

function ContestCard({
  contest,
  onRegister,
  isRegistering,
}: {
  contest: ContestListItem;
  onRegister: (contestId: string) => void;
  isRegistering: boolean;
}) {
  const isLive = contest.studentListStatus === "Live";
  const isUpcoming = contest.studentListStatus === "Upcoming";
  const hasSubmitted = contest.attemptStatus === "SUBMITTED" || contest.attemptStatus === "AUTO_SUBMITTED";
  const canRegister = !contest.isRegistered && contest.registrationStatus === "OPEN";
  const registrationShut = !contest.isRegistered && contest.registrationStatus !== "OPEN";

  return (
    <Card
      className={cn(
        "card-interactive flex h-full flex-col border border-border bg-background p-4",
        isLive && !hasSubmitted && "border-success/50",
        hasSubmitted && isLive && "border-success/30 bg-success/5",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 font-semibold leading-snug">{contest.title}</h3>
        <Badge className={contest.type === "Rated" ? "bg-blue-600 text-white hover:bg-blue-600" : ""}>
          {contest.type}
        </Badge>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {hasSubmitted && isLive ? (
          <Badge className="bg-success text-success-foreground hover:bg-success">
            <CheckCircle2 className="mr-1 h-3 w-3" /> Attempted
          </Badge>
        ) : (
          <Badge variant="outline" className={attemptStatusBadgeClass(contest.attemptStatus)}>
            {getAttemptStatusLabel(contest.attemptStatus)}
          </Badge>
        )}
        {contest.isRegistered && !hasSubmitted && (
          <Badge variant="outline" className="border-accent/50 text-accent">
            Registered
          </Badge>
        )}
      </div>

      <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          {formatDateTime(contest.startAt)}
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          {contest.durationMinutes} mins
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 shrink-0" />
          {contest.registeredCount} registered · {contest.participantsCount} attempted
        </div>
      </div>

      {isLive && (
        <div className="mt-3">
          <ContestTimer deadline={contest.endAt} label="Closes in" className="w-full justify-center py-1" />
        </div>
      )}

      <div className="mt-auto space-y-2 pt-4">
        {hasSubmitted && isLive ? (
          <>
            <Button size="sm" variant="outline" className="w-full" disabled>
              Attempted
            </Button>
            <p className="text-center text-[11px] leading-4 text-muted-foreground">
              Your report unlocks when the contest closes.
            </p>
          </>
        ) : canRegister ? (
          <Button
            size="sm"
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => onRegister(contest.id)}
            disabled={isRegistering}
          >
            <UserPlus className="mr-2 h-3.5 w-3.5" />
            {isRegistering ? "Registering..." : "Register"}
          </Button>
        ) : registrationShut && (isLive || isUpcoming) ? (
          <>
            <Button size="sm" variant="outline" className="w-full" disabled>
              Registration Closed
            </Button>
            <p className="text-center text-[11px] leading-4 text-muted-foreground">
              {contest.registrationStatus === "NOT_OPEN"
                ? `Opens ${formatDateTime(contest.registrationOpenAt)}`
                : "You did not register for this contest."}
            </p>
          </>
        ) : (
          <Button asChild size="sm" className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to={`/student/contests/${contest.id}`}>
              {isLive ? "Enter Contest" : isUpcoming ? "View Contest" : contest.hasAttempted ? "View Report & Practice" : "Practice Contest"}
            </Link>
          </Button>
        )}

        {(canRegister || (contest.isRegistered && isUpcoming)) && (
          <Button asChild size="sm" variant="outline" className="w-full">
            <Link to={`/student/contests/${contest.id}`}>View Details</Link>
          </Button>
        )}
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
  onRegister,
  registeringContestId,
}: {
  title: string;
  icon: typeof Radio;
  accentClass: string;
  contests: ContestListItem[];
  emptyMessage: string;
  alwaysVisible?: boolean;
  onRegister: (contestId: string) => void;
  registeringContestId: string | null;
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
              <ContestCard
                key={contest.id}
                contest={contest}
                onRegister={onRegister}
                isRegistering={registeringContestId === contest.id}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function Contests() {
  const pathname = "/student/contests";
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["student-contests"],
    queryFn: () => contestsApi.list({ pageSize: 100 }, pathname),
  });

  const registerMutation = useMutation({
    mutationFn: (contestId: string) => contestsApi.register(contestId, pathname),
    onSuccess: async () => {
      toast.success("You are registered for this contest");
      await queryClient.invalidateQueries({ queryKey: ["student-contests"] });
    },
    onError: (mutationError) => {
      toast.error((mutationError as Error)?.message || "Failed to register for this contest");
    },
  });

  const registeringContestId = registerMutation.isPending ? registerMutation.variables ?? null : null;
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
              onRegister={registerMutation.mutate}
              registeringContestId={registeringContestId}
            />
            <ContestSection
              title="Upcoming Contests"
              icon={CalendarClock}
              accentClass="text-accent"
              contests={upcomingContests}
              emptyMessage="No upcoming contests scheduled."
              alwaysVisible
              onRegister={registerMutation.mutate}
              registeringContestId={registeringContestId}
            />
            <ContestSection
              title="Past Contests"
              icon={History}
              accentClass="text-muted-foreground"
              contests={pastContests}
              emptyMessage="No past contests."
              onRegister={registerMutation.mutate}
              registeringContestId={registeringContestId}
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
