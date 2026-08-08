import { Download, Users } from "lucide-react";

import type { ContestRegistrationItem, FacultyContestDetail } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/datetime";
import { toFacultyStudentProfilePath } from "@/lib/student-profile";
import { Link } from "react-router-dom";

interface ContestRegistrationsSectionProps {
  registrations: ContestRegistrationItem[];
  registrationStatus: FacultyContestDetail["registrationStatus"];
  onExport: () => void;
  isExporting: boolean;
}

function toRegistrationStatusLabel(status: FacultyContestDetail["registrationStatus"]): string {
  if (status === "OPEN") return "Open";
  if (status === "NOT_OPEN") return "Not Open Yet";
  return "Closed";
}

export function ContestRegistrationsSection({
  registrations,
  registrationStatus,
  onExport,
  isExporting,
}: ContestRegistrationsSectionProps) {
  return (
    <Card className="border border-border bg-background p-5 shadow-none">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-accent" />
          <h2 className="font-display text-xl font-semibold">Registrations</h2>
          <Badge variant="outline">{registrations.length}</Badge>
          <Badge variant="outline">{toRegistrationStatusLabel(registrationStatus)}</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={onExport} disabled={isExporting || registrations.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          {isExporting ? "Exporting..." : "Download CSV"}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Year</TableHead>
            <TableHead>Registered</TableHead>
            <TableHead className="text-right">Attempt</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {registrations.map((registration) => (
            <TableRow key={registration.id}>
              <TableCell>
                <Link to={toFacultyStudentProfilePath(registration.userEmail)} className="block hover:text-accent">
                  <div className="font-medium">{registration.userName ?? registration.userEmail}</div>
                  <div className="text-xs text-muted-foreground">{registration.userUid ?? registration.userEmail}</div>
                </Link>
              </TableCell>
              <TableCell className="text-sm">{registration.userDepartment ?? "-"}</TableCell>
              <TableCell className="text-sm">{registration.year ? `Year ${registration.year}` : "-"}</TableCell>
              <TableCell className="text-sm">{formatDateTime(registration.registeredAt)}</TableCell>
              <TableCell className="text-right">
                <Badge variant={registration.hasAttempted ? "default" : "outline"}>
                  {registration.hasAttempted ? registration.attemptStatus.replace(/_/g, " ") : "Not Started"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {registrations.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                No students have registered yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
        </Table>
      </div>
    </Card>
  );
}
