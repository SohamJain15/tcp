import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import type { DepartmentStudentItem, PaginatedResponse } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/datetime";

interface DepartmentStudentsSectionProps {
  query: UseQueryResult<PaginatedResponse<DepartmentStudentItem>>;
  /** Where a row links to. Admin and HOD reach the same data through different routes. */
  buildStudentPath: (email: string) => string;
}

/**
 * The department roster table, shared by the HOD view and the admin view.
 *
 * Like `DepartmentOverviewSection`, it takes an injected query rather than fetching, so the caller
 * decides which endpoint (and therefore which authorization scope) supplies the rows.
 */
export function DepartmentStudentsSection({ query, buildStudentPath }: DepartmentStudentsSectionProps) {
  const students = query.data?.items ?? [];
  const totalCount = query.data?.pageInfo.totalCount ?? students.length;
  // The server returns the whole roster in one page; if that ever changes, say so rather than
  // silently showing a subset labelled with the full count.
  const isPartial = students.length < totalCount;

  return (
    <Card className="border border-border bg-background p-5 shadow-none">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-xl font-semibold">Students</h2>
        <Badge variant="outline">{totalCount}</Badge>
        {isPartial ? (
          <span className="text-xs text-muted-foreground">
            showing first {students.length}
          </span>
        ) : null}
      </div>

      {query.isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Loading students...</div>
      ) : query.isError ? (
        <div className="py-8 text-center text-sm text-destructive">
          {(query.error as Error)?.message ?? "Failed to load students"}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Year</TableHead>
                <TableHead className="text-right">Rating</TableHead>
                <TableHead className="text-right">Solved</TableHead>
                <TableHead className="text-right">Accuracy</TableHead>
                <TableHead className="text-right">Active days</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Last active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => (
                <TableRow key={student.email}>
                  <TableCell className="font-mono-code">#{student.rank}</TableCell>
                  <TableCell>
                    <Link to={buildStudentPath(student.email)} className="block hover:text-accent">
                      <div className="font-medium">{student.name ?? student.email}</div>
                      <div className="text-xs text-muted-foreground">{student.uid ?? student.email}</div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{student.year ? `Year ${student.year}` : "-"}</TableCell>
                  <TableCell className="text-right font-mono-code">{student.rating}</TableCell>
                  <TableCell className="text-right font-mono-code">{student.problemsSolved}</TableCell>
                  <TableCell className="text-right font-mono-code">{student.accuracy}%</TableCell>
                  <TableCell className="text-right font-mono-code">{student.activeDays}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{student.activityLevel}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {student.lastActiveAt ? formatDateTime(student.lastActiveAt) : "-"}
                  </TableCell>
                </TableRow>
              ))}
              {students.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    No students match the selected filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
