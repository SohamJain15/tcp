import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { AppLayout } from "@/components/AppLayout";
import { contestsApi } from "@/api/services";
import { DEPARTMENTS, type Department } from "@/api/types";
import { formatDateTime } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ThemedSelect } from "@/components/ThemedSelect";

type DepartmentFilter = Department | "All";

export default function FacultyContests() {
  const pathname = "/faculty/contests";
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>("All");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["faculty-contests", departmentFilter],
    queryFn: () =>
      contestsApi.list(
        { pageSize: 100, ...(departmentFilter === "All" ? {} : { department: departmentFilter }) },
        pathname,
      ),
  });

  const contests = data?.items ?? [];

  return (
    <AppLayout>
      <div className="container space-y-6 py-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">My Contests</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage contests, monitor attempts, and publish results.</p>
          </div>
          <Link to="/faculty/create-contest">
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90">Create Contest</Button>
          </Link>
        </div>

        <Card className="grid gap-4 p-4 shadow-card md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="contest-department-filter">Department</Label>
            <ThemedSelect
              id="contest-department-filter"
              value={departmentFilter}
              onValueChange={(value) => setDepartmentFilter(value as DepartmentFilter)}
              options={[
                { value: "All", label: "All Departments" },
                ...DEPARTMENTS.map((department) => ({ value: department, label: department })),
              ]}
            />
          </div>
        </Card>

        {isLoading && <Card className="p-6 text-center text-muted-foreground">Loading contests...</Card>}
        {isError && <Card className="p-6 text-center text-destructive">{(error as Error)?.message || "Failed to load contests"}</Card>}

        {!isLoading && !isError && (
          <div className="grid gap-4">
            {contests.length === 0 && (
              <Card className="border border-border bg-background p-5 text-sm text-muted-foreground shadow-none">
                {departmentFilter === "All"
                  ? "No contests created yet."
                  : `No contests targeted at ${departmentFilter}.`}
              </Card>
            )}

            {contests.map((contest) => (
              <Card key={contest.id} className="card-interactive border border-border bg-background p-5 shadow-none">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold">{contest.title}</h3>
                      <Badge>{contest.type}</Badge>
                      <Badge variant="outline">{contest.computedStatus}</Badge>
                      <Badge variant={contest.resultsPublished ? "default" : "outline"}>
                        {contest.resultsPublished ? "Results Published" : "Results Hidden"}
                      </Badge>
                      <Badge variant="outline" className="max-w-full truncate">
                        {contest.targetDepartment ?? "All Departments"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Window: {formatDateTime(contest.startAt)} — {formatDateTime(contest.endAt)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Duration: {contest.durationMinutes} mins • Registered: {contest.registeredCount} • Attempted: {contest.participantsCount}
                    </p>
                  </div>

                  <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
                    <Link to={`/faculty/contests/${contest.id}`}>Manage Contest</Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
