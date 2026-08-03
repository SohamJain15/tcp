import { formatDuration } from "@/lib/duration";
import { AlertTriangle, Clock, ShieldAlert, Target, Users } from "lucide-react";
import { useMemo, useState } from "react";

import type { ContestAnalytics, OptimalSubmission } from "@/api/types";
import { CategoryBarChart, ChartCard, DonutChart, SERIES_COLORS, type DonutDatum } from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Deterministic palette for language slices, so a language keeps its colour across renders. */
const LANGUAGE_COLORS = [
  SERIES_COLORS.primary,
  SERIES_COLORS.accent,
  SERIES_COLORS.success,
  SERIES_COLORS.warning,
  SERIES_COLORS.muted,
];

/**
 * The `Measured` column carries a different quantity per row, so a bare number was ambiguous —
 * "Solve speed" in particular rendered raw milliseconds (e.g. `1234567`) with no unit at all.
 * Component names come from `report.model.ts`.
 */
function formatMeasured(component: string, rawValue: number): string {
  switch (component) {
    case "Runtime efficiency":
      return `${rawValue} ms`;
    case "Memory efficiency":
      return `${(rawValue / 1024).toFixed(1)} MB`;
    case "Solve speed":
      return formatDuration(rawValue);
    case "Attempt efficiency":
      return `${rawValue} attempt${rawValue === 1 ? "" : "s"}`;
    default:
      return String(rawValue);
  }
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function formatMemory(kb: number): string {
  return `${(kb / 1024).toFixed(1)} MB`;
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="border-l-4 border-l-accent p-5 shadow-card">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-4 w-4 text-accent" />
        {label}
      </div>
      <div className="mt-2 font-display text-2xl font-bold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </Card>
  );
}

function OptimalSubmissionCard({
  submission,
  onViewSubmission,
  isOverall,
  label,
}: {
  submission: OptimalSubmission;
  onViewSubmission: (attemptId: string) => void;
  isOverall?: boolean;
  /** Says which ranking this card won, since the same submission can top more than one group. */
  label?: string;
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  return (
    <Card className="border border-border bg-background p-5 shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {isOverall ? <Badge className="bg-accent text-accent-foreground">Most optimal overall</Badge> : null}
            {!isOverall && label ? <Badge variant="secondary">{label}</Badge> : null}
            <Badge variant="outline">Q{submission.questionNumber}</Badge>
            <Badge variant="outline">{submission.language}</Badge>
            {submission.violationCount > 0 ? (
              <Badge variant="outline" className="text-muted-foreground">
                {submission.violationCount} violation{submission.violationCount === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>
          <h3 className="mt-2 font-display text-base font-semibold">{submission.questionTitle}</h3>
          <p className="text-sm text-muted-foreground">{submission.studentName ?? submission.studentEmail}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => onViewSubmission(submission.attemptId)}>
          View full submission
        </Button>
      </div>

      {/* Raw measurements first: percentiles are the ranking, but the actual numbers are the evidence. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Runtime</div>
          <div className="mt-1 font-mono-code text-sm">{submission.runtimeMs} ms</div>
          <div className="text-xs text-muted-foreground">
            {formatPercent(submission.runtimePercentile)} percentile
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Memory</div>
          <div className="mt-1 font-mono-code text-sm">{formatMemory(submission.memoryKb)}</div>
          <div className="text-xs text-muted-foreground">
            {formatPercent(submission.memoryPercentile)} percentile
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attempts</div>
          <div className="mt-1 font-mono-code text-sm">{submission.attemptsCount}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Solve time</div>
          <div className="mt-1 font-mono-code text-sm">{formatDuration(submission.timeToSolveMs)}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">
          Ranked against {submission.percentileBasis} ({submission.percentileSampleSize} submission
          {submission.percentileSampleSize === 1 ? "" : "s"}).
        </p>
        <Button size="sm" variant="ghost" onClick={() => setShowBreakdown((value) => !value)}>
          {showBreakdown ? "Hide" : "Why this submission?"}
        </Button>
      </div>

      {showBreakdown ? (
        <div className="mt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead className="text-right">Measured</TableHead>
                <TableHead className="text-right">Normalized</TableHead>
                <TableHead className="text-right">Contribution</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submission.breakdown.map((component) => (
                <TableRow key={component.component}>
                  <TableCell>{component.component}</TableCell>
                  <TableCell className="text-right font-mono-code">{formatPercent(component.weight)}</TableCell>
                  <TableCell className="text-right font-mono-code">
                    {formatMeasured(component.component, component.rawValue)}
                  </TableCell>
                  <TableCell className="text-right font-mono-code">{component.normalized.toFixed(3)}</TableCell>
                  <TableCell className="text-right font-mono-code">{component.contribution.toFixed(3)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell />
                <TableCell />
                <TableCell />
                <TableCell className="text-right font-mono-code font-semibold">
                  {submission.totalScore.toFixed(3)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">
            This ranking measures efficiency only. The contest grade is calculated separately from test cases
            passed minus the violation penalty, so violations do not affect this score.
          </p>
        </div>
      ) : null}
    </Card>
  );
}

interface ContestReportMetricsProps {
  metrics: ContestAnalytics;
  onViewSubmission: (attemptId: string) => void;
}

export function ContestReportMetrics({ metrics, onViewSubmission }: ContestReportMetricsProps) {
  // Reports are persisted, so a stored blob can predate any field added since — `perLanguage` was
  // not in the first release. Without this the whole tab throws on a report generated last week.
  const optimalCode = {
    overall: metrics.optimalCode?.overall ?? null,
    perLanguage: metrics.optimalCode?.perLanguage ?? [],
    perQuestion: metrics.optimalCode?.perQuestion ?? [],
    overallSelectionNote: metrics.optimalCode?.overallSelectionNote ?? "",
  };

  const solveRateData = useMemo(
    () =>
      metrics.questions.map((question) => ({
        question: `Q${question.questionNumber}`,
        solveRate: Math.round(question.solveRate * 100),
      })),
    [metrics.questions],
  );

  const scoreDistributionData = useMemo(
    () => metrics.scores.scoreDistribution.map((entry) => ({ bucket: entry.bucket, count: entry.count })),
    [metrics.scores.scoreDistribution],
  );

  const languageDonutData = useMemo<DonutDatum[]>(
    () =>
      metrics.languages.map((entry, index) => ({
        name: entry.language,
        value: entry.submissionCount,
        color: LANGUAGE_COLORS[index % LANGUAGE_COLORS.length],
      })),
    [metrics.languages],
  );

  const violationBandData = useMemo(
    () =>
      metrics.violations.scoreByViolationBand.map((entry) => ({
        band: `${entry.band} (${entry.attemptCount})`,
        averageScore: entry.averageScore,
      })),
    [metrics.violations.scoreByViolationBand],
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Users}
          label="Participants"
          value={String(metrics.participation.attemptedCount)}
          hint={`${metrics.participation.registeredCount} registered · ${formatPercent(
            metrics.participation.completionRate,
          )} completed`}
        />
        <StatTile
          icon={Target}
          label="Average score"
          value={`${metrics.scores.averageScore} / ${metrics.scores.totalPoints}`}
          hint={`Median ${metrics.scores.medianScore} · ${metrics.scores.averageScorePercent}% of available`}
        />
        <StatTile
          icon={Clock}
          label="Average time"
          value={formatDuration(metrics.scores.averageTimeTakenMs)}
          hint={`Contest window ${metrics.contest.durationMinutes} min`}
        />
        <StatTile
          icon={ShieldAlert}
          label="Avg violations"
          value={String(metrics.violations.averagePerAttempt)}
          hint={`${metrics.violations.attemptsWithViolations} attempt(s) flagged`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Solve rate by question"
          subtitle="Share of participants who fully solved each question"
          className="lg:col-span-2"
        >
          <CategoryBarChart
            data={solveRateData}
            categoryKey="question"
            bars={[{ dataKey: "solveRate", name: "Solve rate %", color: SERIES_COLORS.accent }]}
            emptyMessage="No question data yet."
          />
        </ChartCard>
        <ChartCard title="Submissions by language" subtitle="All contest coding submissions">
          <DonutChart data={languageDonutData} centerLabel="Submissions" emptyMessage="No coding submissions." />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Score distribution" subtitle="Participants per score band">
          <CategoryBarChart
            data={scoreDistributionData}
            categoryKey="bucket"
            bars={[{ dataKey: "count", name: "Students", color: SERIES_COLORS.primary }]}
            emptyMessage="No scored attempts yet."
          />
        </ChartCard>
        <ChartCard
          title="Average score by violation count"
          subtitle="An observed association, not evidence of cause"
        >
          <CategoryBarChart
            data={violationBandData}
            categoryKey="band"
            bars={[{ dataKey: "averageScore", name: "Average score", color: SERIES_COLORS.warning }]}
            emptyMessage="No attempts recorded."
          />
        </ChartCard>
      </div>

      <Card className="border border-border bg-background p-5 shadow-none">
        <h3 className="mb-1 font-display text-lg font-semibold">Language efficiency</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Raw measurements shown for transparency. Each language is compared only against its own baseline —
          runtime is never compared across languages.
        </p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Language</TableHead>
                <TableHead className="text-right">Submissions</TableHead>
                <TableHead className="text-right">Accepted</TableHead>
                <TableHead className="text-right">Median runtime</TableHead>
                <TableHead className="text-right">Median memory</TableHead>
                <TableHead className="text-right">Sample</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.languages.map((entry) => (
                <TableRow key={entry.language}>
                  <TableCell className="font-medium">{entry.language}</TableCell>
                  <TableCell className="text-right font-mono-code">{entry.submissionCount}</TableCell>
                  <TableCell className="text-right font-mono-code">
                    {entry.acceptedCount} ({formatPercent(entry.acceptanceRate)})
                  </TableCell>
                  <TableCell className="text-right font-mono-code">
                    {entry.confidence === "high" ? `${entry.runtimeMs.median} ms` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono-code">
                    {entry.confidence === "high" ? formatMemory(entry.memoryKb.median) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {entry.confidence === "high" ? (
                      <span className="font-mono-code text-muted-foreground">{entry.sampleSize}</span>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Too few ({entry.sampleSize})
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {metrics.languages.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No coding submissions were recorded.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {metrics.dataQuality.lowSampleLanguages.length > 0 ? (
          <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <span>
              {metrics.dataQuality.lowSampleLanguages.join(", ")} had too few accepted submissions to form a
              reliable baseline. Their runtime and memory figures are hidden and they are excluded from the
              &ldquo;most optimal overall&rdquo; pick.
            </span>
          </p>
        ) : null}
      </Card>

      <div className="space-y-6">
        <div>
          <h3 className="font-display text-lg font-semibold">Most optimal code</h3>
          <p className="text-sm text-muted-foreground">{optimalCode.overallSelectionNote}</p>
        </div>

        {optimalCode.overall ? (
          <OptimalSubmissionCard
            submission={optimalCode.overall}
            onViewSubmission={onViewSubmission}
            isOverall
          />
        ) : null}

        {optimalCode.perLanguage.length > 0 ? (
          <div className="space-y-4">
            <div>
              <h4 className="font-display text-base font-semibold">Best per language</h4>
              <p className="text-sm text-muted-foreground">
                Each winner is ranked only against other submissions in the same language, so a Python
                solution competes with Python rather than with C++.
              </p>
            </div>
            {optimalCode.perLanguage.map((entry) => (
              <OptimalSubmissionCard
                key={`lang-${entry.submissionId}`}
                submission={entry}
                onViewSubmission={onViewSubmission}
                label={`Best in ${entry.language}`}
              />
            ))}
          </div>
        ) : null}

        {optimalCode.perQuestion.length > 0 ? (
          <div className="space-y-4">
            <h4 className="font-display text-base font-semibold">Best per question</h4>
            {/* Every question keeps an entry even when its winner also took the overall spot — a gap
                in the sequence would read as "nobody solved that question". */}
            {optimalCode.perQuestion.map((entry) => (
              <OptimalSubmissionCard
                key={`q-${entry.submissionId}`}
                submission={entry}
                onViewSubmission={onViewSubmission}
                label={
                  entry.submissionId === optimalCode.overall?.submissionId
                    ? `Best for Q${entry.questionNumber} · also best overall`
                    : `Best for Q${entry.questionNumber}`
                }
              />
            ))}
          </div>
        ) : (
          <Card className="border border-border bg-background p-5 text-sm text-muted-foreground shadow-none">
            No fully-correct coding submission was recorded, so no optimal submission could be selected.
          </Card>
        )}
      </div>

      <Card className="border border-border bg-background p-5 shadow-none">
        <h3 className="mb-4 font-display text-lg font-semibold">Question breakdown</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Question</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead className="text-right">Attempted</TableHead>
                <TableHead className="text-right">Solved</TableHead>
                <TableHead className="text-right">Solve rate</TableHead>
                <TableHead className="text-right">Avg attempts</TableHead>
                <TableHead className="text-right">Avg solve time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.questions.map((question) => (
                <TableRow key={question.questionId}>
                  <TableCell>
                    <div className="font-medium">Q{question.questionNumber}</div>
                    <div className="text-xs text-muted-foreground">{question.title}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{question.type}</Badge>
                    {question.difficulty ? (
                      <Badge variant="outline" className="ml-1">
                        {question.difficulty}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right font-mono-code">{question.points}</TableCell>
                  <TableCell className="text-right font-mono-code">{question.attemptedCount}</TableCell>
                  <TableCell className="text-right font-mono-code">{question.solvedCount}</TableCell>
                  <TableCell className="text-right font-mono-code">{formatPercent(question.solveRate)}</TableCell>
                  <TableCell className="text-right font-mono-code">{question.averageAttempts}</TableCell>
                  <TableCell className="text-right font-mono-code">
                    {formatDuration(question.averageTimeToSolveMs)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
