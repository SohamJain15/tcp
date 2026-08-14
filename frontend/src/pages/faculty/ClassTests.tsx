import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Link } from "react-router-dom";

import { classTestApi } from "@/api/services";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PATHNAME = "/faculty/class-tests";

function statusTone(status: string): string {
  if (status === "Live") return "bg-success/15 text-success";
  if (status === "Scheduled") return "bg-accent/15 text-accent";
  return "bg-muted text-muted-foreground";
}

export default function FacultyClassTests() {
  const query = useQuery({
    queryKey: ["class-tests"],
    queryFn: () => classTestApi.list(PATHNAME),
  });

  const tests = query.data?.items ?? [];

  return (
    <AppLayout>
      <div className="container space-y-6 px-3 py-5 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-accent">Class Test</p>
            <h1 className="mt-1 font-display text-3xl font-bold md:text-4xl">Class Tests</h1>
            <p className="mt-1 text-muted-foreground">
              Short, proctored tests for one division or roll range. Marks are released only when you
              publish them.
            </p>
          </div>
          <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/faculty/class-tests/create">
              <Plus className="mr-2 h-4 w-4" /> New Class Test
            </Link>
          </Button>
        </div>

        <Card className="overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Starts</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Assigned</TableHead>
                  <TableHead className="text-right">Attempted</TableHead>
                  <TableHead className="text-right">Results</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Loading class tests…
                    </TableCell>
                  </TableRow>
                ) : tests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No class tests yet. Create one to run a quiz after your next lecture.
                    </TableCell>
                  </TableRow>
                ) : (
                  tests.map((test) => (
                    <TableRow key={test.id}>
                      <TableCell className="font-medium">
                        <Link to={`/faculty/class-tests/${test.id}`} className="hover:text-accent">
                          {test.title}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {test.questionCount} question{test.questionCount === 1 ? "" : "s"} ·{" "}
                          {test.totalPoints} marks · {test.durationMinutes} min
                        </div>
                      </TableCell>
                      <TableCell>{test.subject}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(test.startAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge className={`rounded-none ${statusTone(test.computedStatus)}`}>
                          {test.computedStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono-code">{test.assignedCount}</TableCell>
                      <TableCell className="text-right font-mono-code">
                        {test.attemptedCount ?? 0}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {test.resultsPublished ? "Published" : "Not published"}
                        {test.computedStatus !== "Ended" && (
                          <Link
                            to={`/faculty/class-tests/${test.id}/edit`}
                            className="ml-3 text-xs font-medium text-accent hover:underline"
                          >
                            Edit
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
