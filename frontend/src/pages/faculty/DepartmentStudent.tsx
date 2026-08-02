import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useParams } from "react-router-dom";

import { departmentApi } from "@/api/services";
import { AppLayout } from "@/components/AppLayout";
import { DepartmentStudentDetailView } from "@/components/department/DepartmentStudentDetailView";

const BACK_PATH = "/faculty/department";

/**
 * One student's aggregate record for the HOD.
 *
 * No department is named in the URL: `requireHod` resolves it from the caller's saved profile, and
 * `getStudentDetail` 404s for a student outside it — so an HOD cannot reach another department's
 * roster by editing the address bar.
 */
export default function FacultyDepartmentStudent() {
  const { email: rawEmail = "" } = useParams();

  const email = useMemo(() => {
    try {
      return decodeURIComponent(rawEmail);
    } catch {
      return rawEmail;
    }
  }, [rawEmail]);

  const studentQuery = useQuery({
    queryKey: ["department", "student", email],
    queryFn: () => departmentApi.getStudent(email, {}, `${BACK_PATH}/students/${encodeURIComponent(email)}`),
    enabled: Boolean(email),
  });

  return (
    <AppLayout>
      <DepartmentStudentDetailView
        query={studentQuery}
        backPath={BACK_PATH}
        backLabel="Back to department"
      />
    </AppLayout>
  );
}
