import { formatDuration } from "@/lib/duration";
import { Link } from "react-router-dom";

import type { ContestStandingItem } from "@/api/types";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toFacultyStudentProfilePath } from "@/lib/student-profile";

interface ContestStandingsSectionProps {
  standings: ContestStandingItem[];
  resultsPublished: boolean;
}

export function ContestStandingsSection({ standings, resultsPublished }: ContestStandingsSectionProps) {
  return (
    <Card className="border border-border bg-background p-5 shadow-none">
      <h2 className="font-display text-xl font-semibold">Standings</h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        Ranked by score, then by how efficient the code was, then time taken, then runtime.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rank</TableHead>
            <TableHead>Student</TableHead>
            <TableHead>Solved</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Efficiency</TableHead>
            <TableHead>Runtime</TableHead>
            <TableHead>Violations</TableHead>
            <TableHead>Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {standings.map((entry) => (
            <TableRow key={entry.attemptId}>
              <TableCell>#{entry.rank}</TableCell>
              <TableCell>
                <Link to={toFacultyStudentProfilePath(entry.userEmail)} className="block hover:text-accent">
                  <div className="font-medium">{entry.userName ?? entry.userEmail}</div>
                  <div className="text-xs text-muted-foreground">{entry.userUid ?? entry.userEmail}</div>
                </Link>
              </TableCell>
              <TableCell>{entry.solvedCount}</TableCell>
              <TableCell>{entry.timeTakenMs !== null ? `${formatDuration(entry.timeTakenMs)}` : "-"}</TableCell>
              {/* Why one student outranks another on equal marks — shown so the order can be
                  explained rather than disputed. */}
              <TableCell>
                {entry.optimizationScore === null ? "-" : `${Math.round(entry.optimizationScore * 100)}%`}
              </TableCell>
              <TableCell>{entry.totalRuntimeMs > 0 ? `${entry.totalRuntimeMs} ms` : "-"}</TableCell>
              <TableCell>{entry.violationCount}</TableCell>
              <TableCell>{entry.score}</TableCell>
            </TableRow>
          ))}
          {standings.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                {resultsPublished
                  ? "No standings available yet."
                  : "Attempts are graded when you publish results — standings appear then."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
