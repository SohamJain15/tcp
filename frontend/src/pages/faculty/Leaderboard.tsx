import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
const pathname = "/faculty/leaderboard";

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.setAttribute("download", filename);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function FacultyLeaderboard() {
  const [department, setDepartment] = useState<Department | "All">("All");
  const [year, setYear] = useState<1 | 2 | 3 | 4 | "All">("All");
  const [viewMode, setViewMode] = useState<LeaderboardMode>("problem");
  const [contestId, setContestId] = useState<string>("");

  const contestsQuery = useQuery({
    queryKey: ["faculty-leaderboard-contests"],
    queryFn: () => contestsApi.list({ pageSize: 100 }, pathname),
    enabled: viewMode === "contest",
  });

  const availableContests = useMemo(
    () =>
      (contestsQuery.data?.items ?? []).filter(
        (contest) => contest.resultsPublished || contest.computedStatus === "Ended",
      ),
    [contestsQuery.data?.items],
  );

  // Single source of truth for both the dropdown and the query, and self-healing when a filter
  // change removes the previously selected contest.
  const selectedContestId =
    contestId && availableContests.some((contest) => contest.id === contestId)
      ? contestId
      : availableContests[0]?.id ?? "";

  const problemQuery = useQuery({
    queryKey: ["faculty-leaderboard", department, year],
    queryFn: () =>
      leaderboardApi.list(
        {
          pageSize: 100,
          department: department === "All" ? undefined : department,
          year: year === "All" ? undefined : year,
        },
        pathname,
      ),
    enabled: viewMode === "problem",
  });

  const contestStandingsQuery = useQuery({
    queryKey: ["faculty-contest-leaderboard", selectedContestId, department, year],
    queryFn: () =>
      contestsApi.getStandings(selectedContestId, pathname, {
        department: department === "All" ? undefined : department,
        year: year === "All" ? undefined : year,
      }),
    enabled: viewMode === "contest" && Boolean(selectedContestId),
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      viewMode === "problem"
        ? leaderboardApi.exportCsv(pathname, {
            department: department === "All" ? undefined : department,
            year: year === "All" ? undefined : year,
          })
        : contestsApi.exportStandingsCsv(selectedContestId, pathname, {
            department: department === "All" ? undefined : department,
            year: year === "All" ? undefined : year,
          }),
    onSuccess: (csv) => {
      downloadCsv(
        viewMode === "problem" ? "leaderboard.csv" : `contest-${selectedContestId}-standings.csv`,
        csv,
      );
      toast.success("CSV export ready");
    },
    onError: (mutationError) => {
      toast.error((mutationError as Error)?.message || "Failed to export CSV");
    },
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
              Track problem ratings or published contest standings.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
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

            <Button
              variant="outline"
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending || (viewMode === "contest" && !selectedContestId)}
            >
              <Download className="mr-2 h-4 w-4" /> {exportMutation.isPending ? "Exporting..." : "Export CSV"}
            </Button>
          </div>
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
            No contests have ended yet. Standings appear here once a contest closes.
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
            linkToProfile
            emptyMessage={
              viewMode === "contest" ? "No standings for this contest yet." : "No leaderboard data yet."
            }
          />
        )}
      </div>
    </AppLayout>
  );
}
