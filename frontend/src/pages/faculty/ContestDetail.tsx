import { ArrowLeft, Download } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";

import { AppLayout } from "@/components/AppLayout";
import { contestsApi } from "@/api/services";
import { formatDateTime } from "@/lib/datetime";
import { downloadCsv } from "@/lib/download";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContestAttemptReviewDialog } from "@/components/faculty/contest/ContestAttemptReviewDialog";
import { ContestAttemptsSection } from "@/components/faculty/contest/ContestAttemptsSection";
import { ContestQuestionsSection } from "@/components/faculty/contest/ContestQuestionsSection";
import { ContestRegistrationsSection } from "@/components/faculty/contest/ContestRegistrationsSection";
import { ContestReportSection } from "@/components/faculty/contest/ContestReportSection";
import { ContestStandingsSection } from "@/components/faculty/contest/ContestStandingsSection";

const TABS = ["overview", "registrations", "attempts", "standings", "report"] as const;
type ContestTab = (typeof TABS)[number];

function isContestTab(value: string | null): value is ContestTab {
  return TABS.includes((value ?? "") as ContestTab);
}

export default function FacultyContestDetail() {
  const { id = "" } = useParams();
  const pathname = `/faculty/contests/${id}`;
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);

  // Kept in the URL so a report can be linked to directly, and so a page refresh stays put.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: ContestTab = isContestTab(searchParams.get("tab")) ? (searchParams.get("tab") as ContestTab) : "overview";

  const contestQuery = useQuery({
    queryKey: ["faculty-contest-detail", id],
    queryFn: () => contestsApi.getFacultyDetail(id, pathname),
    enabled: Boolean(id),
  });

  // Grading happens at publish, so standings simply do not exist before then — asking for
  // them would 409. Fetch only once results are published.
  const resultsPublished = contestQuery.data?.contest.resultsPublished ?? false;

  const standingsQuery = useQuery({
    queryKey: ["faculty-contest-standings", id],
    queryFn: () => contestsApi.getStandings(id, pathname),
    enabled: Boolean(id) && resultsPublished,
  });

  const attemptsQuery = useQuery({
    queryKey: ["faculty-contest-attempts", id],
    queryFn: () => contestsApi.listAttempts(id, pathname),
    enabled: Boolean(id),
  });

  const registrationsQuery = useQuery({
    queryKey: ["faculty-contest-registrations", id],
    queryFn: () => contestsApi.listRegistrations(id, pathname),
    enabled: Boolean(id),
  });

  const reviewQuery = useQuery({
    queryKey: ["faculty-contest-attempt-review", id, selectedAttemptId],
    queryFn: () => contestsApi.getAttemptReview(id, selectedAttemptId!, pathname),
    enabled: Boolean(id && selectedAttemptId),
  });

  const publishMutation = useMutation({
    mutationFn: () => contestsApi.updateResultsVisibility(id, { resultsPublished: true }, pathname),
    onSuccess: async () => {
      toast.success("Contest results published");
      await Promise.all([contestQuery.refetch(), standingsQuery.refetch(), attemptsQuery.refetch()]);
    },
    onError: (mutationError) => {
      toast.error((mutationError as Error)?.message || "Failed to publish results");
    },
  });

  const exportMutation = useMutation({
    mutationFn: () => contestsApi.exportStandingsCsv(id, pathname),
    onSuccess: (csv) => {
      downloadCsv(`contest-${id}-standings.csv`, csv);
      toast.success("Leaderboard CSV downloaded");
    },
    onError: (mutationError) => {
      toast.error((mutationError as Error)?.message || "Failed to export CSV");
    },
  });

  const exportRegistrationsMutation = useMutation({
    mutationFn: () => contestsApi.exportRegistrationsCsv(id, pathname),
    onSuccess: (csv) => {
      downloadCsv(`contest-${id}-registrations.csv`, csv);
      toast.success("Registrations CSV downloaded");
    },
    onError: (mutationError) => {
      toast.error((mutationError as Error)?.message || "Failed to export registrations");
    },
  });

  if (!id) {
    return <Navigate to="/faculty/contests" replace />;
  }

  if (contestQuery.isLoading) {
    return (
      <AppLayout>
        <div className="container py-8 text-muted-foreground">Loading contest...</div>
      </AppLayout>
    );
  }

  if (contestQuery.isError || !contestQuery.data?.contest) {
    return (
      <AppLayout>
        <div className="container py-8 text-destructive">
          {(contestQuery.error as Error)?.message || "Failed to load contest"}
        </div>
      </AppLayout>
    );
  }

  const contest = contestQuery.data.contest;
  const standings = standingsQuery.data?.items ?? [];
  const attempts = attemptsQuery.data?.items ?? [];
  const registrations = registrationsQuery.data?.items ?? [];
  const review = reviewQuery.data?.review ?? null;
  const contestDeadline = new Date(contest.endAt);
  const contestEnded = Date.now() >= contestDeadline.getTime();

  const handleTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "overview") {
      next.delete("tab");
    } else {
      next.set("tab", value);
    }
    setSearchParams(next, { replace: true });
  };

  // The report links back into the per-attempt review, so opening it must also leave the report tab
  // visible behind the dialog.
  const handleViewSubmission = (attemptId: string) => setSelectedAttemptId(attemptId);

  return (
    <AppLayout>
      <div className="container space-y-6 py-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <Link
              to="/faculty/contests"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-accent"
            >
              <ArrowLeft className="h-4 w-4" /> Back to contests
            </Link>
            <h1 className="font-display text-3xl font-bold">{contest.title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{contest.type}</Badge>
              <Badge variant={contest.resultsPublished ? "default" : "outline"}>
                {contest.resultsPublished ? "Results Published" : "Results Hidden"}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending || !resultsPublished}
              title={resultsPublished ? undefined : "Publish results to export the leaderboard"}
            >
              <Download className="mr-2 h-4 w-4" /> {exportMutation.isPending ? "Exporting..." : "Download CSV"}
            </Button>
            <Button asChild variant="outline">
              <Link to={`/faculty/contests/${id}/edit`}>Edit Contest</Link>
            </Button>
            {!contest.resultsPublished && (
              <Button
                className="bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={() => publishMutation.mutate()}
                disabled={publishMutation.isPending || !contestEnded}
              >
                {publishMutation.isPending ? "Publishing..." : "Publish Results"}
              </Button>
            )}
          </div>
        </div>

        {!contest.resultsPublished && !contestEnded && (
          <Card className="border border-border bg-background p-4 text-sm text-muted-foreground shadow-none">
            Results can be published only after the contest deadline. Students can review the contest after it
            ends, but standings stay hidden until you publish them.
          </Card>
        )}

        <Card className="grid gap-4 border border-border bg-background p-5 shadow-none md:grid-cols-3 lg:grid-cols-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Window Opens</div>
            <div className="mt-1 text-sm">{formatDateTime(contest.startAt)}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Window Closes</div>
            <div className="mt-1 text-sm">{formatDateTime(contestDeadline)}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Attempt Duration
            </div>
            <div className="mt-1 text-sm">{contest.durationMinutes} mins</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Registration</div>
            <div className="mt-1 text-sm">
              {formatDateTime(contest.registrationOpenAt)} — {formatDateTime(contest.registrationCloseAt)}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Department</div>
            <div className="mt-1 text-sm">{contest.targetDepartment ?? "All Departments"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Warning Threshold
            </div>
            <div className="mt-1 text-sm">{contest.maxViolations} screenshots</div>
          </div>
        </Card>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          {/* Five tabs never fit a 3-column grid below lg — labels like "Registrations" clip.
              A horizontally scrollable strip keeps every tab full-width and legible on a phone. */}
          <TabsList className="flex w-full justify-start overflow-x-auto lg:grid lg:max-w-3xl lg:grid-cols-5">
            <TabsTrigger value="overview" className="shrink-0">Overview</TabsTrigger>
            <TabsTrigger value="registrations" className="shrink-0">Registrations</TabsTrigger>
            <TabsTrigger value="attempts" className="shrink-0">Attempts</TabsTrigger>
            <TabsTrigger value="standings" className="shrink-0">Standings</TabsTrigger>
            <TabsTrigger value="report" className="shrink-0">AI Report</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-5">
            <ContestQuestionsSection questions={contest.questions} />
          </TabsContent>

          <TabsContent value="registrations" className="mt-5">
            <ContestRegistrationsSection
              registrations={registrations}
              registrationStatus={contest.registrationStatus}
              onExport={() => exportRegistrationsMutation.mutate()}
              isExporting={exportRegistrationsMutation.isPending}
            />
          </TabsContent>

          <TabsContent value="attempts" className="mt-5">
            <ContestAttemptsSection
              attempts={attempts}
              resultsPublished={resultsPublished}
              onViewSolutions={setSelectedAttemptId}
            />
          </TabsContent>

          <TabsContent value="standings" className="mt-5">
            <ContestStandingsSection standings={standings} resultsPublished={resultsPublished} />
          </TabsContent>

          <TabsContent value="report" className="mt-5">
            <ContestReportSection
              contestId={id}
              pathname={pathname}
              resultsPublished={resultsPublished}
              onViewSubmission={handleViewSubmission}
            />
          </TabsContent>
        </Tabs>
      </div>

      <ContestAttemptReviewDialog
        open={Boolean(selectedAttemptId)}
        onOpenChange={(open) => !open && setSelectedAttemptId(null)}
        review={review}
        isLoading={reviewQuery.isLoading}
        resultsPublished={resultsPublished}
      />
    </AppLayout>
  );
}
