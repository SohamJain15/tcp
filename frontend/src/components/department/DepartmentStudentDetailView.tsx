import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowLeft, Flame, Target, Timer, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import type { DepartmentStudentDetailEnvelope } from "@/api/types";
import {
  CategoryBarChart,
  ChartCard,
  DIFFICULTY_COLORS,
  DonutChart,
  SERIES_COLORS,
  type DonutDatum,
} from "@/components/charts";
import { SubmissionActivityHeatmap } from "@/components/SubmissionActivityHeatmap";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/datetime";

const LANGUAGE_COLORS = [
  SERIES_COLORS.primary,
  SERIES_COLORS.accent,
  SERIES_COLORS.success,
  SERIES_COLORS.warning,
  SERIES_COLORS.muted,
];

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Target;
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

interface DepartmentStudentDetailViewProps {
  query: UseQueryResult<DepartmentStudentDetailEnvelope>;
  backPath: string;
  backLabel: string;
}

/**
 * One student's aggregate record, shared by the HOD and admin views.
 *
 * Built on the department student-detail endpoint, which returns aggregates only. Deliberately NOT
 * built on `/faculty/students/:email` — that page renders a "View Code" dialog over the student's
 * submission history, and neither of these surfaces should reach submitted source.
 */
export function DepartmentStudentDetailView({
  query,
  backPath,
  backLabel,
}: DepartmentStudentDetailViewProps) {
  const detail = query.data?.student;

  const difficultyData = useMemo(
    () =>
      (detail?.difficultyBreakdown ?? []).map((entry) => ({
        difficulty: entry.difficulty,
        solvedCount: entry.solvedCount,
      })),
    [detail?.difficultyBreakdown],
  );

  const languageData = useMemo<DonutDatum[]>(
    () =>
      (detail?.languageBreakdown ?? []).map((entry, index) => ({
        name: entry.language,
        value: entry.submissionCount,
        color: LANGUAGE_COLORS[index % LANGUAGE_COLORS.length],
      })),
    [detail?.languageBreakdown],
  );

  return (
    <div className="container space-y-6 py-8">
      <Link
        to={backPath}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </Link>

      {query.isLoading && <div className="text-sm text-muted-foreground">Loading student...</div>}

      {query.isError && (
        <div className="text-sm text-destructive">
          {(query.error as Error)?.message ?? "Failed to load this student"}
        </div>
      )}

      {detail && (
        <>
          <div>
            <h1 className="font-display text-2xl font-bold">{detail.student.name ?? detail.student.email}</h1>
            <p className="text-sm text-muted-foreground">
              {detail.student.uid ?? detail.student.email}
              {detail.student.year ? ` · Year ${detail.student.year}` : ""}
              {detail.student.semester ? ` · Semester ${detail.student.semester}` : ""}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              icon={Target}
              label="Problems solved"
              value={String(detail.student.problemsSolved)}
              hint={`${detail.student.acceptedSubmissionCount} of ${detail.student.submissionCount} accepted`}
            />
            <StatTile
              icon={TrendingUp}
              label="Accuracy"
              value={`${detail.student.accuracy}%`}
              hint={`Rating ${detail.student.rating}`}
            />
            <StatTile
              icon={Flame}
              label="Current streak"
              value={`${detail.activity.currentStreakDays} days`}
              hint={`Longest ${detail.activity.longestStreakDays} days`}
            />
            <StatTile
              icon={Timer}
              label="Active days"
              value={String(detail.activity.activeDays)}
              hint={`Consistency ${detail.activity.consistencyScore}%`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Solved by difficulty" subtitle="Within the selected window">
              <CategoryBarChart
                data={difficultyData}
                categoryKey="difficulty"
                bars={[{ dataKey: "solvedCount", name: "Solved" }]}
                colorByCategory={DIFFICULTY_COLORS}
                emptyMessage="No solved problems in this window."
              />
            </ChartCard>
            <ChartCard title="Submissions by language">
              <DonutChart data={languageData} centerLabel="Submissions" emptyMessage="No submissions yet." />
            </ChartCard>
          </div>

          <Card className="border border-border bg-background p-5 shadow-none">
            <h2 className="mb-4 font-display text-xl font-semibold">Submission activity</h2>
            <SubmissionActivityHeatmap activity={detail.submissionHeatmap} />
          </Card>

          <Card className="border border-border bg-background p-5 shadow-none">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-semibold">Contest participation</h2>
              <Badge variant="outline">{detail.contests.length}</Badge>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contest</TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Solved</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                    <TableHead className="text-right">Violations</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.contests.map((contest) => (
                    <TableRow key={contest.contestId}>
                      <TableCell className="font-medium">{contest.title}</TableCell>
                      <TableCell className="text-sm">
                        {contest.registeredAt ? formatDateTime(contest.registeredAt) : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{contest.attemptStatus.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono-code">{contest.score ?? "-"}</TableCell>
                      <TableCell className="text-right font-mono-code">{contest.solvedCount ?? "-"}</TableCell>
                      <TableCell className="text-right font-mono-code">
                        {contest.timeTakenMs !== null ? `${Math.ceil(contest.timeTakenMs / 60000)}m` : "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono-code">{contest.violationCount ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                  {detail.contests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        This student has not registered for any contest.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
