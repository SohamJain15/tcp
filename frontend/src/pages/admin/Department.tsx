import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { adminApi } from "@/api/services";
import { DEPARTMENTS, type Department } from "@/api/types";
import { AppLayout } from "@/components/AppLayout";
import { DepartmentOverviewSection } from "@/components/DepartmentOverviewSection";
import { DepartmentStudentsSection } from "@/components/department/DepartmentStudentsSection";
import { Card } from "@/components/ui/card";
import { DEPARTMENT_ICONS } from "@/lib/department-icons";

/**
 * A department's analytics, chosen by an admin rather than derived from their own profile.
 *
 * The route param is validated against the canonical list before any request is made, so a hand-typed
 * URL fails here rather than producing a confusing server error. The server validates it again.
 */
function useValidDepartment(): Department | null {
  const { department: raw = "" } = useParams();
  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();

  return DEPARTMENTS.find((entry) => entry === decoded) ?? null;
}

export default function AdminDepartment() {
  const department = useValidDepartment();
  const [windowDays, setWindowDays] = useState(90);
  const [year, setYear] = useState<string>("all");

  const pathname = department ? `/admin/departments/${encodeURIComponent(department)}` : "/admin/dashboard";
  const yearFilter = year === "all" ? undefined : (Number(year) as 1 | 2 | 3 | 4);

  // Namespaced under "admin" so an admin browsing departments can never read or evict the HOD's
  // cache entry for their own department, which is keyed ["department", "overview", ...].
  const overviewQuery = useQuery({
    queryKey: ["admin", "department", department, "overview", windowDays, year],
    queryFn: () => adminApi.overview(department!, { windowDays, year: yearFilter }, pathname),
    enabled: Boolean(department),
  });

  // A department roster is a few hundred rows at most and the endpoint returns it in one page, so
  // there is no pagination to drive here.
  const studentsQuery = useQuery({
    queryKey: ["admin", "department", department, "students", windowDays, year],
    queryFn: () => adminApi.listStudents(department!, { windowDays, year: yearFilter, pageSize: 1000 }, pathname),
    enabled: Boolean(department),
  });

  if (!department) {
    return (
      <AppLayout>
        <div className="container space-y-4 py-8">
          <Link
            to="/admin/dashboard"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-accent"
          >
            <ArrowLeft className="h-4 w-4" /> Back to departments
          </Link>
          <Card className="border border-border bg-background p-8 text-center shadow-none">
            <h1 className="font-display text-xl font-semibold">Department not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              That department is not on the institute's list. Pick one from the dashboard.
            </p>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const Icon = DEPARTMENT_ICONS[department];

  return (
    <AppLayout>
      <div className="container space-y-6 py-8">
        <div className="space-y-2">
          <Link
            to="/admin/dashboard"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-accent"
          >
            <ArrowLeft className="h-4 w-4" /> Back to departments
          </Link>
          <div className="flex items-start gap-3">
            <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border text-accent">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold leading-snug">{department}</h1>
              <p className="text-sm text-muted-foreground">Read-only department analytics</p>
            </div>
          </div>
        </div>

        <DepartmentOverviewSection
          query={overviewQuery}
          windowDays={windowDays}
          onWindowDaysChange={setWindowDays}
          year={year}
          onYearChange={setYear}
        />

        <DepartmentStudentsSection
          query={studentsQuery}
          buildStudentPath={(email) =>
            `/admin/departments/${encodeURIComponent(department)}/students/${encodeURIComponent(email)}`
          }
        />
      </div>
    </AppLayout>
  );
}
