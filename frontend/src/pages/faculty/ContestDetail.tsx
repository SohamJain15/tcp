import { Download, Eye } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";

import { AppLayout } from "@/components/AppLayout";
import { contestsApi } from "@/api/services";
import { toFacultyStudentProfilePath } from "@/lib/student-profile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function downloadCsv(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function FacultyContestDetail() {
  const { id = "" } = useParams();
  const pathname = `/faculty/contests/${id}`;
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);

  const contestQuery = useQuery({
    queryKey: ["faculty-contest-detail", id],
    queryFn: () => contestsApi.getFacultyDetail(id, pathname),
    enabled: Boolean(id),
  });

  const standingsQuery = useQuery({
    queryKey: ["faculty-contest-standings", id],
    queryFn: () => contestsApi.getStandings(id, pathname),
    enabled: Boolean(id),
  });

  const attemptsQuery = useQuery({
    queryKey: ["faculty-contest-attempts", id],
    queryFn: () => contestsApi.listAttempts(id, pathname),
    enabled: Boolean(id),
  });

  const reviewQuery = useQuery({
    queryKey: ["faculty-contest-attempt-review", id, selectedAttemptId],
    queryFn: () => contestsApi.getAttemptReview(id, selectedAttemptId!, pathname),
    enabled: Boolean(id && selectedAttemptId),
  });

  const publishMutation = useMutation({
    mutationFn: () => contestsApi.updateResultsVisibility(id, { resultsPublished: true }, pathname),
    onSuccess: async () => {
      toast.success("Contest results published");
      await Promise.all([contestQuery.refetch(), standingsQuery.refetch(), attemptsQuery.refetch()]);
    },
    onError: (mutationError) => {
      toast.error((mutationError as Error)?.message || "Failed to publish results");
    },
  });

  const exportMutation = useMutation({
    mutationFn: () => contestsApi.exportStandingsCsv(id, pathname),
    onSuccess: (csv) => {
      downloadCsv(`contest-${id}-standings.csv`, csv);
      toast.success("Leaderboard CSV downloaded");
    },
    onError: (mutationError) => {
      toast.error((mutationError as Error)?.message || "Failed to export CSV");
    },
  });

  if (!id) {
    return <Navigate to="/faculty/contests" replace />;
  }

  if (contestQuery.isLoading) {
    return (
      <AppLayout>
        <div className="container py-8 text-muted-foreground">Loading contest...</div>
      </AppLayout>
    );
  }

  if (contestQuery.isError || !contestQuery.data?.contest) {
    return (
      <AppLayout>
        <div className="container py-8 text-destructive">{(contestQuery.error as Error)?.message || "Failed to load contest"}</div>
      </AppLayout>
    );
  }

  const contest = contestQuery.data.contest;
  const standings = standingsQuery.data?.items ?? [];
  const attempts = attemptsQuery.data?.items ?? [];
  const review = reviewQuery.data?.review ?? null;

  return (
    <AppLayout>
      <div className="container space-y-6 py-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <Link to="/faculty/contests" className="text-sm text-muted-foreground hover:text-accent">
              Back to contests
            </Link>
            <h1 className="font-display text-3xl font-bold">{contest.title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{contest.type}</Badge>
              <Badge variant={contest.resultsPublished ? "default" : "outline"}>
                {contest.resultsPublished ? "Results Published" : "Results Hidden"}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
              <Download className="mr-2 h-4 w-4" /> {exportMutation.isPending ? "Exporting..." : "Download CSV"}
            </Button>
            <Button asChild variant="outline">
              <Link to={`/faculty/contests/${id}/edit`}>Edit Contest</Link>
            </Button>
            {!contest.resultsPublished && (
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
                {publishMutation.isPending ? "Publishing..." : "Publish Results"}
              </Button>
            )}
          </div>
        </div>

        <Card className="grid gap-4 border border-border bg-background p-5 shadow-none md:grid-cols-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Start</div>
            <div className="mt-1 text-sm">{new Date(contest.startAt).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Duration</div>
            <div className="mt-1 text-sm">{contest.durationMinutes} mins</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Max Violations</div>
            <div className="mt-1 text-sm">{contest.maxViolations}</div>
          </div>
        </Card>

        <Card className="border border-border bg-background p-5 shadow-none">
          <h2 className="mb-4 font-display text-xl font-semibold">Questions</h2>
          <div className="space-y-4">
            {contest.questions.map((question, index) => (
              <div key={question.id} className="rounded border border-border p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Q{index + 1}</Badge>
                  <Badge variant="outline">{question.type}</Badge>
                  <Badge variant="outline">{question.points} pts</Badge>
                  {question.type === "Coding" && <Badge>{question.difficulty}</Badge>}
                </div>
                <div className="font-medium">{question.type === "Coding" ? question.problemTitle : question.statement}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border border-border bg-background p-5 shadow-none">
          <h2 className="mb-4 font-display text-xl font-semibold">Attempts & Proctoring</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
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
                  <TableCell>{attempt.score}</TableCell>
                  <TableCell>{attempt.timeTakenMs !== null ? `${Math.ceil(attempt.timeTakenMs / 1000)} sec` : "-"}</TableCell>
                  <TableCell>{attempt.violationCount} ({attempt.violationPenaltyPoints} pts)</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setSelectedAttemptId(attempt.id)}>
                      <Eye className="mr-1 h-3.5 w-3.5" /> View Solutions
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {attempts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No attempts yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <Card className="border border-border bg-background p-5 shadow-none">
          <h2 className="mb-4 font-display text-xl font-semibold">Standings</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Solved</TableHead>
                <TableHead>Time</TableHead>
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
                  <TableCell>{entry.timeTakenMs !== null ? `${Math.ceil(entry.timeTakenMs / 1000)} sec` : "-"}</TableCell>
                  <TableCell>{entry.violationCount}</TableCell>
                  <TableCell>{entry.score}</TableCell>
                </TableRow>
              ))}
              {standings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No standings available yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Dialog open={Boolean(selectedAttemptId)} onOpenChange={(open) => !open && setSelectedAttemptId(null)}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              {review ? `${review.student.name ?? review.student.email} — Full Attempt Review` : "Loading review..."}
            </DialogTitle>
          </DialogHeader>
          {reviewQuery.isLoading && <div className="text-sm text-muted-foreground">Loading student solutions...</div>}
          {!reviewQuery.isLoading && review && (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-4">
                <Card className="p-4 shadow-none">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Student</div>
                  <Link to={toFacultyStudentProfilePath(review.student.email)} className="mt-2 block hover:text-accent">
                    <div className="font-medium">{review.student.name ?? review.student.email}</div>
                    <div className="text-xs text-muted-foreground">{review.student.uid ?? review.student.email}</div>
                  </Link>
                </Card>
                <Card className="p-4 shadow-none">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Score</div>
                  <div className="mt-2 text-lg font-semibold">{review.score}</div>
                </Card>
                <Card className="p-4 shadow-none">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Time Taken</div>
                  <div className="mt-2 text-lg font-semibold">{review.timeTakenMs !== null ? `${Math.ceil(review.timeTakenMs / 1000)} sec` : "-"}</div>
                </Card>
                <Card className="p-4 shadow-none">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Violations</div>
                  <div className="mt-2 text-lg font-semibold">{review.violationCount} ({review.violationPenaltyPoints} pts)</div>
                </Card>
              </div>

              <div className="space-y-4">
                {review.questionReviews.map((item) => (
                  <Card key={item.questionId} className="border border-border p-4 shadow-none">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Q{item.questionNumber}</Badge>
                      <Badge variant="outline">{item.type}</Badge>
                      <Badge variant="outline">{item.awardedPoints}/{item.points} pts</Badge>
                      <Badge variant="outline">{item.status}</Badge>
                    </div>
                    <h3 className="mt-3 text-base font-semibold">{item.title}</h3>
                    {item.type !== "Coding" ? (
                      <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                        <div>{item.statement}</div>
                        <div>Submitted: <span className="font-medium text-foreground">{Array.isArray(item.submittedAnswer) ? item.submittedAnswer.join(", ") : item.submittedAnswer ?? "-"}</span></div>
                        <div>Correct: <span className="font-medium text-foreground">{Array.isArray(item.correctAnswer) ? item.correctAnswer.join(", ") : item.correctAnswer}</span></div>
                        <div>Correctness: <span className="font-medium text-foreground">{item.isCorrect ? "Correct" : "Incorrect"}</span></div>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                        <div>{item.problemStatement}</div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>Passed: <span className="font-medium text-foreground">{item.passedCount}/{item.totalCount}</span></div>
                          <div>Verdict: <span className="font-medium text-foreground">{item.finalSubmissionStatus ?? "-"}</span></div>
                          <div>Language: <span className="font-medium text-foreground">{item.finalSubmissionLanguage ?? "-"}</span></div>
                          <div>Runtime / Memory: <span className="font-medium text-foreground">{item.finalRuntimeMs} ms / {(item.finalMemoryKb / 1024).toFixed(1)} MB</span></div>
                        </div>
                        <pre className="max-h-72 overflow-auto rounded-lg bg-[hsl(220_50%_8%)] p-4 font-mono-code text-xs text-[hsl(40_30%_92%)]">
                          {item.finalCode || "// No submitted code available"}
                        </pre>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
