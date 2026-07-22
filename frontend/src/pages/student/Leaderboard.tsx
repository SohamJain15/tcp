import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { ThemedSelect } from "@/components/ThemedSelect";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { contestsApi, leaderboardApi } from "@/api/services";
import { DEPARTMENTS, type Department } from "@/api/types";
import {
  toContestLeaderboardRows,
  toProblemLeaderboardRows,
  type LeaderboardMode,
} from "@/lib/leaderboard-rows";

const YEAR_OPTIONS = [1, 2, 3, 4] as const;
const pathname = "/student/leaderboard";

export default function StudentLeaderboard() {
  const [department, setDepartment] = useState<Department | "All">("All");
  const [year, setYear] = useState<1 | 2 | 3 | 4 | "All">("All");
  const [viewMode, setViewMode] = useState<LeaderboardMode>("problem");
  const [contestId, setContestId] = useState<string>("");

  const contestsQuery = useQuery({
    queryKey: ["student-leaderboard-contests"],
    queryFn: () => contestsApi.list({ pageSize: 100 }, pathname),
    enabled: viewMode === "contest",
  });

  // Students only see standings they earned a place in: attempted, and results published.
  const availableContests = useMemo(
    () => (contestsQuery.data?.items ?? []).filter((contest) => contest.resultsPublished && contest.hasAttempted),
    [contestsQuery.data?.items],
  );

  // Single source of truth for both the dropdown and the query. Deriving it here also self-heals
  // when a filter change removes the previously selected contest from the list.
  const selectedContestId =
    contestId && availableContests.some((contest) => contest.id === contestId)
      ? contestId
      : availableContests[0]?.id ?? "";

  const problemQuery = useQuery({
    queryKey: ["student-leaderboard", department, year],
    queryFn: () =>
      leaderboardApi.list({
        pageSize: 100,
        department: department === "All" ? undefined : department,
        year: year === "All" ? undefined : year,
      }),
    enabled: viewMode === "problem",
  });

  const contestStandingsQuery = useQuery({
    queryKey: ["student-contest-leaderboard", selectedContestId, department, year],
    queryFn: () =>
      contestsApi.getStandings(selectedContestId, pathname, {
        department: department === "All" ? undefined : department,
        year: year === "All" ? undefined : year,
      }),
    enabled: viewMode === "contest" && Boolean(selectedContestId),
  });

  const isProblemMode = viewMode === "problem";
  const activeQuery = isProblemMode ? problemQuery : contestStandingsQuery;
  const rows = useMemo(
    () =>
      isProblemMode
        ? toProblemLeaderboardRows(problemQuery.data?.items ?? [])
        : toContestLeaderboardRows(contestStandingsQuery.data?.items ?? []),
    [isProblemMode, problemQuery.data?.items, contestStandingsQuery.data?.items],
  );

  const hasNoContests = viewMode === "contest" && !contestsQuery.isLoading && availableContests.length === 0;

  return (
    <AppLayout>
      <div className="container space-y-6 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Leaderboard</h1>
            <p className="mt-1 text-muted-foreground">
              Switch between problem rating and contest standings.
            </p>
          </div>

          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => value && setViewMode(value as LeaderboardMode)}
            className="justify-start border border-border bg-background p-1"
          >
            <ToggleGroupItem
              value="problem"
              className="rounded-none px-4 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
            >
              Problem
            </ToggleGroupItem>
            <ToggleGroupItem
              value="contest"
              className="rounded-none px-4 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
            >
              Contest
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <Card className="p-4 shadow-card">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {viewMode === "contest" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Contest
                </label>
                <ThemedSelect
                  value={selectedContestId}
                  onValueChange={setContestId}
                  placeholder={availableContests.length === 0 ? "No contests available" : "Select contest"}
                  disabled={availableContests.length === 0}
                  triggerClassName="h-11 px-4"
                  options={availableContests.map((contest) => ({
                    value: contest.id,
                    label: contest.title,
                  }))}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Department
              </label>
              <ThemedSelect
                value={department}
                onValueChange={(value) => setDepartment(value as Department | "All")}
                placeholder="All Departments"
                triggerClassName="h-11 px-4"
                options={[
                  { value: "All", label: "All Departments" },
                  ...DEPARTMENTS.map((entry) => ({ value: entry, label: entry })),
                ]}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Year
              </label>
              <ThemedSelect
                value={String(year)}
                onValueChange={(value) => setYear(value === "All" ? "All" : (Number(value) as 1 | 2 | 3 | 4))}
                placeholder="All Years"
                triggerClassName="h-11 px-4"
                options={[
                  { value: "All", label: "All Years" },
                  ...YEAR_OPTIONS.map((entry) => ({
                    value: String(entry),
                    label: entry === 1 ? "1st Year" : entry === 2 ? "2nd Year" : entry === 3 ? "3rd Year" : "4th Year",
                  })),
                ]}
              />
            </div>
          </div>
        </Card>

        {hasNoContests ? (
          <Card className="p-6 text-center text-muted-foreground">
            You have no contests with published results yet. Standings appear here once you attempt a
            contest and faculty publish its results.
          </Card>
        ) : activeQuery.isLoading ? (
          <Card className="p-6 text-center text-muted-foreground">Loading leaderboard...</Card>
        ) : activeQuery.isError ? (
          <Card className="p-6 text-center text-destructive">
            {(activeQuery.error as Error)?.message || "Failed to load leaderboard"}
          </Card>
        ) : (
          <LeaderboardTable
            rows={rows}
            mode={viewMode}
            emptyMessage={
              viewMode === "contest" ? "No standings for this contest yet." : "No leaderboard data yet."
            }
          />
        )}
      </div>
    </AppLayout>
  );
}
