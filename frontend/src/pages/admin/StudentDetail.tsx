import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";

import { adminApi } from "@/api/services";
import { DEPARTMENTS, type Department } from "@/api/types";
import { AppLayout } from "@/components/AppLayout";
import { DepartmentStudentDetailView } from "@/components/department/DepartmentStudentDetailView";
import { Card } from "@/components/ui/card";

/** One student's aggregate record, scoped to the department an admin selected. */
export default function AdminStudentDetail() {
  const { department: rawDepartment = "", email: rawEmail = "" } = useParams();

  const department: Department | null = useMemo(() => {
    try {
      const decoded = decodeURIComponent(rawDepartment);
      return DEPARTMENTS.find((entry) => entry === decoded) ?? null;
    } catch {
      return null;
    }
  }, [rawDepartment]);

  const email = useMemo(() => {
    try {
      return decodeURIComponent(rawEmail);
    } catch {
      return rawEmail;
    }
  }, [rawEmail]);

  const backPath = department ? `/admin/departments/${encodeURIComponent(department)}` : "/admin/dashboard";

  const studentQuery = useQuery({
    queryKey: ["admin", "department", department, "student", email],
    queryFn: () => adminApi.getStudent(department!, email, {}, backPath),
    enabled: Boolean(department && email),
  });

  if (!department) {
    return (
      <AppLayout>
        <div className="container py-8">
          <Card className="border border-border bg-background p-8 text-center shadow-none">
            <h1 className="font-display text-xl font-semibold">Department not found</h1>
            <Link to="/admin/dashboard" className="mt-3 inline-block text-sm text-accent hover:underline">
              Back to departments
            </Link>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <DepartmentStudentDetailView
        query={studentQuery}
        backPath={backPath}
        backLabel={`Back to ${department}`}
      />
    </AppLayout>
  );
}
