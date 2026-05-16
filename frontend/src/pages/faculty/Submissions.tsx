import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { Link } from "react-router-dom";

import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/Badges";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { submissionsApi } from "@/api/services";
import { toFacultyStudentProfilePath } from "@/lib/student-profile";
import { toLanguageLabel, toStatusLabel } from "@/api/mappers";

type FacultyStatusFilter = "All" | "ACCEPTED" | "WRONG_ANSWER";

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleString();
}

export default function FacultySubmissions() {
  const [problemIdFilter, setProblemIdFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<FacultyStatusFilter>("All");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["faculty-submissions", problemIdFilter, statusFilter],
    queryFn: () =>
      submissionsApi.list(
        {
          pageSize: 100,
          sourceType: "problem",
          problemId: problemIdFilter.trim() || undefined,
          status: statusFilter === "All" ? undefined : statusFilter,
        },
        "/faculty/submissions",
      ),
  });

  const { data: selectedSubmissionData, isLoading: selectedLoading } = useQuery({
    queryKey: ["faculty-submission-detail", selectedSubmissionId],
    queryFn: () => submissionsApi.getById(selectedSubmissionId || "", "/faculty/submissions"),
    enabled: Boolean(selectedSubmissionId),
  });

  const submissions = data?.items ?? [];
  return (
    <AppLayout>
      <div className="container space-y-6 py-8">
        <div>
          <h1 className="font-display text-3xl font-bold">Code Submissions</h1>
          <p className="mt-1 text-muted-foreground">Track and filter student code submissions for analysis.</p>
        </div>

        <Card className="grid gap-4 p-4 shadow-card md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="submission-status-filter">Status</Label>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as FacultyStatusFilter)}
            >
              <SelectTrigger id="submission-status-filter">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All</SelectItem>
                <SelectItem value="ACCEPTED">Accepted</SelectItem>
                <SelectItem value="WRONG_ANSWER">Wrong Answer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="submission-problem-id-filter">Problem ID</Label>
            <Input
              id="submission-problem-id-filter"
              placeholder="e.g. problem_123"
              value={problemIdFilter}
              onChange={(event) => setProblemIdFilter(event.target.value)}
            />
          </div>
        </Card>

        <Card className="overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left text-secondary-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Problem</th>
                  <th className="px-4 py-3 font-semibold">Lang</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Runtime</th>
                  <th className="px-4 py-3 text-right font-semibold">Memory</th>
                  <th className="px-4 py-3 font-semibold">Submitted</th>
                  <th className="px-4 py-3 text-right font-semibold">Code</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      Loading submissions...
                    </td>
                  </tr>
                )}
                {isError && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-destructive">
                      {(error as Error)?.message || "Failed to load submissions"}
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  !isError &&
                  submissions.map((submission) => (
                    <tr key={submission.id} className="border-t border-border hover:bg-secondary/40">
                      <td className="px-4 py-3">
                        <Link to={toFacultyStudentProfilePath(submission.userEmail)} className="block hover:text-accent">
                          <div className="font-medium">{submission.userName ?? submission.userEmail}</div>
                          <div className="font-mono-code text-xs text-muted-foreground">
                            {submission.userUid ?? submission.userEmail}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">{submission.problemTitle}</td>
                      <td className="px-4 py-3 font-mono-code text-xs">{toLanguageLabel(submission.language)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={toStatusLabel(submission.status)} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono-code text-xs">{submission.runtimeMs} ms</td>
                      <td className="px-4 py-3 text-right font-mono-code text-xs">
                        {(submission.memoryKb / 1024).toFixed(1)} MB
                      </td>
                      <td className="px-4 py-3 font-mono-code text-xs text-muted-foreground">
                        {formatDate(submission.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => setSelectedSubmissionId(submission.id)}>
                          <Eye className="mr-1 h-3.5 w-3.5" /> View
                        </Button>
                      </td>
                    </tr>
                  ))}
                {!isLoading && !isError && submissions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      No submissions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Dialog open={Boolean(selectedSubmissionId)} onOpenChange={(open) => !open && setSelectedSubmissionId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-display">
              {(selectedSubmissionData?.submission.userName ?? selectedSubmissionData?.submission.userEmail) || "Student"} —{" "}
              {selectedSubmissionData?.submission.problemTitle}
            </DialogTitle>
          </DialogHeader>
          {selectedLoading && <div className="text-sm text-muted-foreground">Loading code...</div>}
          {!selectedLoading && selectedSubmissionData?.submission && (
            <>
              <div className="flex items-center gap-3 text-xs">
                <span className="font-mono-code text-muted-foreground">
                  {selectedSubmissionData.submission.userUid ?? selectedSubmissionData.submission.userEmail}
                </span>
                <StatusBadge status={toStatusLabel(selectedSubmissionData.submission.status)} />
                <span className="font-mono-code text-muted-foreground">
                  {toLanguageLabel(selectedSubmissionData.submission.language)}
                </span>
                <span className="font-mono-code text-muted-foreground">
                  {selectedSubmissionData.submission.runtimeMs} ms ·{" "}
                  {(selectedSubmissionData.submission.memoryKb / 1024).toFixed(1)} MB
                </span>
              </div>
              <pre className="max-h-96 overflow-auto rounded-lg bg-[hsl(220_50%_8%)] p-4 font-mono-code text-xs text-[hsl(40_30%_92%)]">
                {selectedSubmissionData.submission.code || "// No code payload returned"}
              </pre>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
