import type { UseQueryResult } from "@tanstack/react-query";
import { Building2, CalendarCheck, Flame, Users } from "lucide-react";

import type { DepartmentOverviewEnvelope } from "@/api/types";
import {
  ACTIVITY_LEVEL_COLORS,
  CategoryBarChart,
  ChartCard,
  DIFFICULTY_COLORS,
  DonutChart,
  SERIES_COLORS,
  TrendAreaChart,
} from "@/components/charts";
import { SubmissionActivityHeatmap } from "@/components/SubmissionActivityHeatmap";
import { ThemedSelect } from "@/components/ThemedSelect";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DepartmentOverviewSectionProps {
  query: UseQueryResult<DepartmentOverviewEnvelope>;
  windowDays: number;
  onWindowDaysChange: (days: number) => void;
  year: string;
  onYearChange: (year: string) => void;
}

const WINDOW_OPTIONS = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 180 days" },
];

const YEAR_OPTIONS = [
  { value: "all", label: "All years" },
  { value: "1", label: "1st Year" },
  { value: "2", label: "2nd Year" },
  { value: "3", label: "3rd Year" },
  { value: "4", label: "4th Year" },
];

/**
 * Department-wide participation, shown only to a Head of Department.
 *
 * Everything here is aggregate: who took part, how consistently, and how contests were
 * attended. It never shows problem statements, contest questions or student code — the
 * backend does not return them on this route.
 */
export function DepartmentOverviewSection({
  query,
  windowDays,
  onWindowDaysChange,
  year,
  onYearChange,
}: DepartmentOverviewSectionProps) {
  const overview = query.data?.overview;

  const participationData = (overview?.participationByYear ?? []).map((entry) => ({
    name: entry.label,
    participating: entry.activeStudentCount,
    inactive: Math.max(entry.studentCount - entry.activeStudentCount, 0),
    rate: entry.participationRate,
  }));

  const activityLevelData = (overview?.activityLevelDistribution ?? []).map((entry) => ({
    name: entry.level,
    count: entry.studentCount,
  }));

  const consistencyData = (overview?.consistency.distribution ?? []).map((entry) => ({
    name: entry.band,
    count: entry.studentCount,
  }));

  const trendData = (overview?.activityTrend ?? []).map((entry) => ({
    date: entry.date.slice(5),
    submissions: entry.submissionCount,
    students: entry.activeStudentCount,
  }));

  const difficultyData = (overview?.difficultyBreakdown ?? []).map((entry) => ({
    name: entry.difficulty,
    value: entry.solvedCount,
    color: DIFFICULTY_COLORS[entry.difficulty] ?? SERIES_COLORS.primary,
  }));

  const stats = [
    { label: "Students", value: String(overview?.totals.studentCount ?? 0), icon: Users },
    {
      label: "Participating",
      value: `${overview?.totals.activeStudentCount ?? 0} (${overview?.totals.participationRate ?? 0}%)`,
      icon: CalendarCheck,
    },
    {
      label: "Avg. Consistency",
      value: `${overview?.consistency.averageConsistencyScore ?? 0}/100`,
      icon: Flame,
    },
    {
      label: "Contest Attempts",
      value: String(overview?.totals.contestAttemptCount ?? 0),
      icon: Building2,
    },
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 border-t border-border pt-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">Head of Department</p>
          <h2 className="mt-1 font-display text-2xl font-bold">
            {overview?.department ?? "Department"} Participation
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Student engagement across your department. Participation data only — contest questions and
            submitted code are not shown here.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="w-40">
            <ThemedSelect value={year} onValueChange={onYearChange} options={YEAR_OPTIONS} />
          </div>
          <div className="w-44">
            <ThemedSelect
              value={String(windowDays)}
              onValueChange={(value) => onWindowDaysChange(Number(value))}
              options={WINDOW_OPTIONS}
            />
          </div>
        </div>
      </div>

      {query.isLoading ? (
        <Card className="p-6 text-center text-muted-foreground">Loading department data...</Card>
      ) : query.isError ? (
        <Card className="p-6 text-center text-destructive">
          {(query.error as Error)?.message || "Failed to load department data"}
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map((stat) => (
              <Card key={stat.label} className="border-l-4 border-l-accent p-5 shadow-card">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-semibold uppercase tracking-wider">{stat.label}</span>
                  <stat.icon className="h-5 w-5 text-accent" />
                </div>
                <div className="mt-2 font-display text-2xl font-bold">{stat.value}</div>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard
              title="Department Activity"
              className="lg:col-span-2"
              subtitle={`Submissions and active students over the last ${overview?.window.days ?? windowDays} days`}
            >
              <TrendAreaChart
                data={trendData}
                xKey="date"
                series={[
                  { dataKey: "submissions", name: "Submissions", color: SERIES_COLORS.accent },
                  { dataKey: "students", name: "Active students", color: SERIES_COLORS.success },
                ]}
                emptyMessage="No department activity in this window."
              />
            </ChartCard>

            <ChartCard title="Problems Solved" subtitle="By difficulty, department-wide">
              <DonutChart data={difficultyData} centerLabel="Solved" emptyMessage="No problems solved yet." />
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="Participation by Year" subtitle="Active vs. inactive students in each year">
              <CategoryBarChart
                data={participationData}
                categoryKey="name"
                bars={[
                  { dataKey: "participating", name: "Participating", color: SERIES_COLORS.success, stackId: "a" },
                  { dataKey: "inactive", name: "Inactive", color: SERIES_COLORS.muted, stackId: "a" },
                ]}
                emptyMessage="No students in this department yet."
              />
            </ChartCard>

            <ChartCard title="Activity Levels" subtitle="How many students are active, and how much">
              <CategoryBarChart
                data={activityLevelData}
                categoryKey="name"
                bars={[{ dataKey: "count", name: "Students" }]}
                colorByCategory={ACTIVITY_LEVEL_COLORS}
                emptyMessage="No students in this department yet."
              />
            </ChartCard>

            <ChartCard
              title="Consistency Distribution"
              subtitle="Blend of active-day ratio and week-to-week regularity"
            >
              <CategoryBarChart
                data={consistencyData}
                categoryKey="name"
                bars={[{ dataKey: "count", name: "Students", color: SERIES_COLORS.accent }]}
                emptyMessage="No students in this department yet."
              />
            </ChartCard>
          </div>

          <Card className="profile-card p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Department Submission Activity
            </h3>
            <div className="mt-4 overflow-x-auto">
              <SubmissionActivityHeatmap activity={overview?.submissionHeatmap ?? []} />
            </div>
          </Card>

          <Card className="overflow-hidden shadow-card">
            <div className="p-6 pb-3">
              <h3 className="font-display text-xl font-bold">Contest Participation</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Attendance for contests your students took, across all faculty. Titles only.
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contest</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Registered</TableHead>
                    <TableHead className="text-right">Attempted</TableHead>
                    <TableHead className="text-right">Completed</TableHead>
                    <TableHead className="text-right">Avg. Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(overview?.contestParticipation ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        No contest participation recorded for your department yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (overview?.contestParticipation ?? []).map((contest) => (
                      <TableRow key={contest.contestId}>
                        <TableCell className="font-medium">{contest.title}</TableCell>
                        <TableCell className="text-muted-foreground">{contest.computedStatus}</TableCell>
                        <TableCell className="text-right font-mono-code">{contest.registeredCount}</TableCell>
                        <TableCell className="text-right font-mono-code">{contest.attemptedCount}</TableCell>
                        <TableCell className="text-right font-mono-code">{contest.completedCount}</TableCell>
                        <TableCell className="text-right font-mono-code">{contest.averageScore}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </section>
  );
}
