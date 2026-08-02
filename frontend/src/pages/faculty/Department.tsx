import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { departmentApi } from "@/api/services";
import type { ManagedContestItem } from "@/api/types";
import { AppLayout } from "@/components/AppLayout";
import { DepartmentOverviewSection } from "@/components/DepartmentOverviewSection";
import { DepartmentStudentsSection } from "@/components/department/DepartmentStudentsSection";
import { ThemedSelect } from "@/components/ThemedSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const PATHNAME = "/faculty/department";

function ContestDelegationCard() {
  const queryClient = useQueryClient();

  const facultyQuery = useQuery({
    queryKey: ["department", "faculty"],
    queryFn: () => departmentApi.listFaculty(PATHNAME),
  });
  const managedQuery = useQuery({
    queryKey: ["department", "managed-contests"],
    queryFn: () => departmentApi.listManagedContests(PATHNAME),
  });

  const setManagersMutation = useMutation({
    mutationFn: ({ contestId, managerEmails }: { contestId: string; managerEmails: string[] }) =>
      departmentApi.setContestManagers(contestId, managerEmails, PATHNAME),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["department", "managed-contests"] });
      toast.success("Contest managers updated");
    },
    onError: (error: Error) => toast.error(error.message || "Could not update managers"),
  });

  const faculty = facultyQuery.data?.faculty ?? [];
  const contests = managedQuery.data?.contests ?? [];

  const updateManagers = (contest: ManagedContestItem, managerEmails: string[]) => {
    setManagersMutation.mutate({ contestId: contest.contestId, managerEmails });
  };

  return (
    <Card className="profile-card p-5">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Contest Management Delegation
        </h3>
        <p className="mt-1 text-xs text-muted-foreground/80">
          Give any faculty in your department the power to manage a contest you conducted. A manager can
          edit, review and publish that contest exactly like you — but cannot re-delegate it.
        </p>
      </div>

      {managedQuery.isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading your contests…</p>
      ) : contests.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">You have not created any contests yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {contests.map((contest) => {
            const managerEmails = contest.managers.map((manager) => manager.email);
            const available = faculty.filter((member) => !managerEmails.includes(member.email));

            return (
              <div key={contest.contestId} className="border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{contest.title}</p>
                    <p className="text-xs text-muted-foreground">{contest.computedStatus}</p>
                  </div>
                  <div className="w-56">
                    <ThemedSelect
                      value=""
                      onValueChange={(email) => updateManagers(contest, [...managerEmails, email])}
                      placeholder={available.length === 0 ? "No faculty to add" : "Delegate to faculty…"}
                      disabled={available.length === 0 || setManagersMutation.isPending}
                      options={available.map((member) => ({
                        value: member.email,
                        label: member.name ? `${member.name}${member.isHod ? " (HOD)" : ""}` : member.email,
                      }))}
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {contest.managers.length === 0 ? (
                    <span className="text-xs text-muted-foreground">No managers delegated.</span>
                  ) : (
                    contest.managers.map((manager) => (
                      <Badge key={manager.email} variant="secondary" className="gap-1 rounded-none">
                        <UserPlus className="h-3 w-3" />
                        {manager.name ?? manager.email}
                        <button
                          type="button"
                          aria-label={`Remove ${manager.name ?? manager.email}`}
                          className="ml-1 hover:text-destructive"
                          disabled={setManagersMutation.isPending}
                          onClick={() =>
                            updateManagers(
                              contest,
                              managerEmails.filter((email) => email !== manager.email),
                            )
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default function FacultyDepartment() {
  const [windowDays, setWindowDays] = useState(90);
  const [year, setYear] = useState<string>("all");

  const yearFilter = year === "all" ? undefined : (Number(year) as 1 | 2 | 3 | 4);

  const overviewQuery = useQuery({
    queryKey: ["department", "overview", windowDays, year],
    queryFn: () => departmentApi.overview({ windowDays, year: yearFilter }, PATHNAME),
  });

  // Same roster the admin panel shows, scoped by requireHod to the caller's own department.
  const studentsQuery = useQuery({
    queryKey: ["department", "students", windowDays, year],
    queryFn: () => departmentApi.listStudents({ windowDays, year: yearFilter, pageSize: 1000 }, PATHNAME),
  });

  return (
    <AppLayout>
      <div className="container space-y-6 py-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">Head of Department</p>
          <h1 className="mt-1 font-display text-3xl font-bold md:text-4xl">Department View</h1>
          <p className="mt-1 text-muted-foreground">
            Student participation across your department, and contest-management delegation.
          </p>
        </div>

        <ContestDelegationCard />

        <DepartmentOverviewSection
          query={overviewQuery}
          windowDays={windowDays}
          onWindowDaysChange={setWindowDays}
          year={year}
          onYearChange={setYear}
        />

        <DepartmentStudentsSection
          query={studentsQuery}
          buildStudentPath={(email) => `/faculty/department/students/${encodeURIComponent(email)}`}
        />
      </div>
    </AppLayout>
  );
}
