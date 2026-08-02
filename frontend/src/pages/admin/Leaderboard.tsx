import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { adminApi, leaderboardApi } from "@/api/services";
import { DEPARTMENTS, type Department } from "@/api/types";
import { AppLayout } from "@/components/AppLayout";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { ThemedSelect } from "@/components/ThemedSelect";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { downloadCsv } from "@/lib/download";
import {
  toContestLeaderboardRows,
  toProblemLeaderboardRows,
  type LeaderboardMode,
} from "@/lib/leaderboard-rows";

const YEAR_OPTIONS = [1, 2, 3, 4] as const;
const pathname = "/admin/leaderboard";

/**
 * Platform-wide leaderboards for institute leadership.
 *
 * Contest mode lists every contest on the platform, not just those a given faculty owns — that is the
 * point of the admin view. `linkToProfile` stays off throughout: it routes through
 * `/faculty/students/:email`, which renders submitted source code.
 */
export default function AdminLeaderboard() {
  const [viewMode, setViewMode] = useState<LeaderboardMode>("problem");
  const [department, setDepartment] = useState<Department | "All">("All");
  const [year, setYear] = useState<1 | 2 | 3 | 4 | "All">("All");
  const [contestId, setContestId] = useState<string>("");

  const departmentFilter = department === "All" ? undefined : department;
  const yearFilter = year === "All" ? undefined : year;

  const problemQuery = useQuery({
    queryKey: ["admin", "leaderboard", "problem", department, year],
    queryFn: () =>
      leaderboardApi.list({ pageSize: 50, department: departmentFilter, year: yearFilter }, pathname),
    enabled: viewMode === "problem",
  });

  const contestsQuery = useQuery({
    queryKey: ["admin", "contests"],
    queryFn: () => adminApi.listContests({ pageSize: 50 }, pathname),
    enabled: viewMode === "contest",
  });

  // Only published contests have standings — grading happens at publish, so anything else 409s.
  const availableContests = useMemo(
    () => (contestsQuery.data?.items ?? []).filter((contest) => contest.resultsPublished),
    [contestsQuery.data?.items],
  );

  const selectedContestId = contestId || availableContests[0]?.id || "";

  const standingsQuery = useQuery({
    queryKey: ["admin", "leaderboard", "contest", selectedContestId, department, year],
    queryFn: () =>
      adminApi.getContestStandings(
        selectedContestId,
        { department: departmentFilter, year: yearFilter },
        pathname,
      ),
    enabled: viewMode === "contest" && Boolean(selectedContestId),
  });

  const isProblemMode = viewMode === "problem";
  const activeQuery = isProblemMode ? problemQuery : standingsQuery;

  const rows = useMemo(
    () =>
      isProblemMode
        ? toProblemLeaderboardRows(problemQuery.data?.items ?? [])
        : toContestLeaderboardRows(standingsQuery.data?.items ?? []),
    [isProblemMode, problemQuery.data?.items, standingsQuery.data?.items],
  );

  const exportMutation = useMutation({
    mutationFn: () => leaderboardApi.exportCsv(pathname, { department: departmentFilter, year: yearFilter }),
    onSuccess: (csv) => {
      downloadCsv("leaderboard.csv", csv);
      toast.success("Leaderboard CSV downloaded");
    },
    onError: (error) => {
      toast.error((error as Error)?.message || "Failed to export CSV");
    },
  });

  const hasNoContests =
    viewMode === "contest" && !contestsQuery.isLoading && availableContests.length === 0;

  return (
    <AppLayout>
      <div className="container space-y-6 py-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Leaderboard</h1>
            <p className="text-sm text-muted-foreground">
              Switch between problem rating and the standings of any contest conducted on the platform.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(value) => value && setViewMode(value as LeaderboardMode)}
            >
              <ToggleGroupItem value="problem">Problem</ToggleGroupItem>
              <ToggleGroupItem value="contest">Contest</ToggleGroupItem>
            </ToggleGroup>
            {isProblemMode ? (
              <Button
                variant="outline"
                onClick={() => exportMutation.mutate()}
                disabled={exportMutation.isPending || rows.length === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                {exportMutation.isPending ? "Exporting..." : "Export CSV"}
              </Button>
            ) : null}
          </div>
        </div>

        <Card className="flex flex-wrap items-end gap-4 border border-border bg-background p-5 shadow-none">
          {!isProblemMode ? (
            <div className="min-w-[260px] flex-1">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Contest
              </div>
              <ThemedSelect
                value={selectedContestId}
                onValueChange={setContestId}
                options={availableContests.map((contest) => ({
                  value: contest.id,
                  label: contest.title,
                }))}
                placeholder={hasNoContests ? "No published contests" : "Select a contest"}
              />
            </div>
          ) : null}

          <div className="min-w-[240px] flex-1">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Department
            </div>
            <ThemedSelect
              value={department}
              onValueChange={(value) => setDepartment(value as Department | "All")}
              options={[
                { value: "All", label: "All departments" },
                ...DEPARTMENTS.map((entry) => ({ value: entry, label: entry })),
              ]}
            />
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Year</div>
            <ToggleGroup
              type="single"
              value={String(year)}
              onValueChange={(value) => value && setYear(value === "All" ? "All" : (Number(value) as 1 | 2 | 3 | 4))}
            >
              <ToggleGroupItem value="All">All</ToggleGroupItem>
              {YEAR_OPTIONS.map((option) => (
                <ToggleGroupItem key={option} value={String(option)}>
                  {option}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </Card>

        {hasNoContests ? (
          <Card className="border border-border bg-background p-8 text-center text-sm text-muted-foreground shadow-none">
            No contest has published results yet. Standings appear once a contest's results are published.
          </Card>
        ) : activeQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading leaderboard...</div>
        ) : activeQuery.isError ? (
          <div className="text-sm text-destructive">
            {(activeQuery.error as Error)?.message ?? "Failed to load the leaderboard"}
          </div>
        ) : (
          <LeaderboardTable
            rows={rows}
            mode={viewMode}
            emptyMessage={
              isProblemMode ? "No students match these filters." : "No standings for this contest yet."
            }
          />
        )}
      </div>
    </AppLayout>
  );
}
