import { Eye } from "lucide-react";
import { Link } from "react-router-dom";

import type { ContestAttemptSummary } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toFacultyStudentProfilePath } from "@/lib/student-profile";

interface ContestAttemptsSectionProps {
  attempts: ContestAttemptSummary[];
  resultsPublished: boolean;
  onViewSolutions: (attemptId: string) => void;
}

export function ContestAttemptsSection({
  attempts,
  resultsPublished,
  onViewSolutions,
}: ContestAttemptsSectionProps) {
  return (
    <Card className="border border-border bg-background p-5 shadow-none">
      <h2 className="mb-4 font-display text-xl font-semibold">Attempts &amp; Proctoring</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead>Status</TableHead>
            {/* Nothing is graded until publish, so the column is dropped entirely rather
                than shown empty — there is no score to talk about during the contest. */}
            {resultsPublished && <TableHead>Score</TableHead>}
            <TableHead>Time</TableHead>
            <TableHead>Violations</TableHead>
            <TableHead className="text-right">Solutions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {attempts.map((attempt) => (
            <TableRow key={attempt.id}>
              <TableCell>
                <Link to={toFacultyStudentProfilePath(attempt.userEmail)} className="block hover:text-accent">
                  <div className="font-medium">{attempt.userName ?? attempt.userEmail}</div>
                  <div className="text-xs text-muted-foreground">{attempt.userUid ?? attempt.userEmail}</div>
                </Link>
              </TableCell>
              <TableCell>{attempt.status}</TableCell>
              {resultsPublished && <TableCell>{attempt.score}</TableCell>}
              <TableCell>
                {attempt.timeTakenMs !== null ? `${Math.ceil(attempt.timeTakenMs / 1000)} sec` : "-"}
              </TableCell>
              <TableCell>
                {attempt.violationCount} ({attempt.violationPenaltyPoints} pts)
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" onClick={() => onViewSolutions(attempt.id)}>
                  <Eye className="mr-1 h-3.5 w-3.5" /> View Solutions
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {attempts.length === 0 && (
            <TableRow>
              {/* Matches the visible column count, which drops by one before publish. */}
              <TableCell colSpan={resultsPublished ? 6 : 5} className="py-8 text-center text-muted-foreground">
                No attempts yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
