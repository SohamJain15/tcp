import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, FileText, Lock, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { contestsApi } from "@/api/services";
import type { ContestReport } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime } from "@/lib/datetime";
import { downloadJson } from "@/lib/download";
import { openContestReportPrintView } from "@/lib/contest-report-pdf";
import { ContestReportExportDialog } from "./ContestReportExportDialog";
import { ContestReportMetrics } from "./ContestReportMetrics";

interface ContestReportSectionProps {
  contestId: string;
  pathname: string;
  resultsPublished: boolean;
  onViewSubmission: (attemptId: string) => void;
}

function NarrativeCard({ title, body }: { title: string; body: string | string[] }) {
  return (
    <Card className="border border-border bg-background p-5 shadow-none">
      <h3 className="mb-3 font-display text-lg font-semibold">{title}</h3>
      {Array.isArray(body) ? (
        <ul className="space-y-2">
          {body.map((entry, index) => (
            <li key={index} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
              <span>{entry}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      )}
    </Card>
  );
}

export function ContestReportSection({
  contestId,
  pathname,
  resultsPublished,
  onViewSubmission,
}: ContestReportSectionProps) {
  const queryClient = useQueryClient();
  const [reportTab, setReportTab] = useState("narrative");
  const [exportOpen, setExportOpen] = useState(false);

  const reportQuery = useQuery({
    queryKey: ["faculty-contest-report", contestId],
    queryFn: () => contestsApi.getReport(contestId, pathname),
    enabled: Boolean(contestId) && resultsPublished,
    // Generation runs in the background on the server, so poll while it is in flight.
    refetchInterval: (query) =>
      query.state.data?.report?.status === "GENERATING" ? 3000 : false,
  });

  const generateMutation = useMutation({
    mutationFn: (force: boolean) => contestsApi.generateReport(contestId, { force }, pathname),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["faculty-contest-report", contestId] });
    },
    onError: (error) => {
      toast.error((error as Error)?.message || "Failed to start report generation");
    },
  });

  if (!resultsPublished) {
    return (
      <Card className="border border-border bg-background p-8 text-center shadow-none">
        <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
        <h3 className="mt-3 font-display text-lg font-semibold">Report locked</h3>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          Attempts are only graded when you publish results, so scores, solve rates and rankings do not exist
          yet. Publish the results to generate a report.
        </p>
      </Card>
    );
  }

  if (reportQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (reportQuery.isError) {
    return (
      <Card className="border border-border bg-background p-5 text-sm text-destructive shadow-none">
        {(reportQuery.error as Error)?.message || "Failed to load the contest report."}
      </Card>
    );
  }

  const envelope = reportQuery.data;
  const report: ContestReport | null = envelope?.report ?? null;
  const aiRuntime = envelope?.aiRuntime;
  const isGenerating = report?.status === "GENERATING" || generateMutation.isPending;

  if (!report || report.status === "FAILED") {
    return (
      <div className="space-y-4">
        <Card className="border border-border bg-background p-8 text-center shadow-none">
          <Sparkles className="mx-auto h-8 w-8 text-accent" />
          <h3 className="mt-3 font-display text-lg font-semibold">
            {report?.status === "FAILED" ? "Report generation failed" : "No report generated yet"}
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            {report?.status === "FAILED"
              ? report.failureReason
              : "Generate a report to see contest analytics with a written summary. All figures are computed from your contest data; the local model only puts them into words."}
          </p>

          {aiRuntime ? (
            <p className="mx-auto mt-3 max-w-xl text-xs text-muted-foreground">
              {aiRuntime.available
                ? `Local model ready: ${aiRuntime.model}`
                : `${aiRuntime.reason ?? "Local model unavailable."} The report will still be generated using built-in summaries.`}
            </p>
          ) : null}

          <Button
            className="mt-5 bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => generateMutation.mutate(true)}
            disabled={isGenerating}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {isGenerating
              ? "Generating..."
              : aiRuntime?.available
                ? "Generate AI Report"
                : "Generate Report (offline mode)"}
          </Button>
        </Card>

        {/* A failed run still keeps whatever metrics were computed, so they stay visible. */}
        {report?.status === "FAILED" && report.metrics ? (
          <ContestReportMetrics metrics={report.metrics} onViewSubmission={onViewSubmission} />
        ) : null}
      </div>
    );
  }

  if (report.status === "GENERATING") {
    return (
      <Card className="border border-border bg-background p-10 text-center shadow-none">
        <RefreshCw className="mx-auto h-8 w-8 animate-spin text-accent" />
        <h3 className="mt-4 font-display text-lg font-semibold">Generating report…</h3>
      </Card>
    );
  }

  const narrative = report.narrative;
  const metrics = report.metrics;

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-3 border border-border bg-background p-4 shadow-none">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={report.source === "AI" ? "default" : "outline"}>
            {report.source === "AI" ? `Written by ${report.modelId}` : "Generated summary"}
          </Badge>
          {report.generatedAt ? (
            <span className="text-xs text-muted-foreground">Generated {formatDateTime(report.generatedAt)}</span>
          ) : null}
          {report.warnings.length > 0 ? (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <AlertTriangle className="h-3 w-3" />
              {report.warnings.length} note{report.warnings.length === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {metrics ? (
            <Button
              size="sm"
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={() => setExportOpen(true)}
            >
              <FileText className="mr-2 h-4 w-4" /> Download PDF
            </Button>
          ) : null}
          {metrics ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                downloadJson(`contest-${contestId}-metrics.json`, metrics);
                toast.success("Metrics downloaded");
              }}
            >
              <Download className="mr-2 h-4 w-4" /> Export metrics
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateMutation.mutate(true)}
            disabled={generateMutation.isPending}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {generateMutation.isPending ? "Starting..." : "Regenerate"}
          </Button>
        </div>
      </Card>

      {metrics ? (
        <ContestReportExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          hasNarrative={Boolean(narrative)}
          onExport={async ({ subtitle, sections }) => {
            const result = await openContestReportPrintView({ report, metrics, subtitle, sections });
            if (result === "popup-blocked") {
              toast.error("Allow pop-ups for this site to open the print view.");
            } else if (result === "failed") {
              toast.error("The report could not be prepared. Try regenerating it, then export again.");
            }
          }}
        />
      ) : null}

      {report.warnings.length > 0 ? (
        <Card className="border border-border bg-background p-4 shadow-none">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="space-y-1 text-xs text-muted-foreground">
              {report.warnings.map((warning, index) => (
                <p key={index}>{warning}</p>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      <Tabs value={reportTab} onValueChange={setReportTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="narrative">Report</TabsTrigger>
          <TabsTrigger value="metrics">Raw Metrics</TabsTrigger>
        </TabsList>

        <TabsContent value="narrative" className="mt-5 space-y-4">
          {narrative ? (
            <>
              <NarrativeCard title="Executive summary" body={narrative.executiveSummary} />
              <NarrativeCard title="Contest insights" body={narrative.contestInsights} />
              <NarrativeCard title="Efficiency observations" body={narrative.efficiencyObservations} />
              <NarrativeCard
                title="Student performance"
                body={narrative.studentPerformanceObservations}
              />
              <NarrativeCard title="Recommendations" body={narrative.facultyRecommendations} />
            </>
          ) : (
            <Card className="border border-border bg-background p-5 text-sm text-muted-foreground shadow-none">
              No narrative was produced for this report.
            </Card>
          )}
        </TabsContent>

        <TabsContent value="metrics" className="mt-5">
          {metrics ? (
            <ContestReportMetrics metrics={metrics} onViewSubmission={onViewSubmission} />
          ) : (
            <Card className="border border-border bg-background p-5 text-sm text-muted-foreground shadow-none">
              No metrics are available for this report.
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
