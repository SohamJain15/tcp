import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Eye, Pencil } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

import { classTestApi } from "@/api/services";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function ClassTestDetail() {
  const { id = "" } = useParams();
  const pathname = `/faculty/class-tests/${id}`;
  const queryClient = useQueryClient();
  const [openAttemptId, setOpenAttemptId] = useState<string | null>(null);

  const testQuery = useQuery({
    queryKey: ["class-test", id],
    queryFn: () => classTestApi.get(id, pathname),
    enabled: Boolean(id),
  });

  const attemptsQuery = useQuery({
    queryKey: ["class-test-attempts", id],
    queryFn: () => classTestApi.listAttempts(id, pathname),
    enabled: Boolean(id),
    // A live test needs a moving picture of who has joined and who has been flagged.
    refetchInterval: testQuery.data?.classTest.computedStatus === "Live" ? 15000 : false,
  });

  const attemptQuery = useQuery({
    queryKey: ["class-test-attempt", id, openAttemptId],
    queryFn: () => classTestApi.getAttempt(id, openAttemptId!, pathname),
    enabled: Boolean(openAttemptId),
  });

  const gradeMutation = useMutation({
    mutationFn: (input: { questionId: string; awardedPoints: number; graderNote: string | null }) =>
      classTestApi.gradeShortAnswer(id, openAttemptId!, input, pathname),
    onSuccess: () => {
      toast.success("Marks saved");
      void queryClient.invalidateQueries({ queryKey: ["class-test-attempt", id, openAttemptId] });
      void queryClient.invalidateQueries({ queryKey: ["class-test-attempts", id] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not save marks"),
  });

  const publishMutation = useMutation({
    mutationFn: () => classTestApi.publishResults(id, true, pathname),
    onSuccess: () => {
      toast.success("Results published — students can now see their marks");
      void queryClient.invalidateQueries({ queryKey: ["class-test", id] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not publish results"),
  });

  const test = testQuery.data?.classTest;
  const attempts = attemptsQuery.data?.items ?? [];
  const attempt = attemptQuery.data?.attempt;
  const ended = test?.computedStatus === "Ended";
  const pendingGrading = attempts.filter((a) => a.gradingStatus !== "COMPLETE").length;

  if (testQuery.isLoading || !test) {
    return (
      <AppLayout>
        <div className="container py-8 text-muted-foreground">Loading class test…</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container space-y-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-accent">{test.subject}</p>
            <h1 className="mt-1 font-display text-3xl font-bold">{test.title}</h1>
            <p className="mt-1 text-muted-foreground">
              {new Date(test.startAt).toLocaleString()} · {test.durationMinutes} min ·{" "}
              {test.assignedCount} assigned · {test.totalPoints} marks
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          {!ended && (
            <Button asChild variant="outline">
              <Link to={`/faculty/class-tests/${id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" /> Edit test
              </Link>
            </Button>
          )}
          {ended && !test.resultsPublished && (
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending || pendingGrading > 0}
              title={pendingGrading > 0 ? "Grade every written answer first" : undefined}
            >
              {publishMutation.isPending ? "Publishing…" : "Publish results"}
            </Button>
          )}
          {test.resultsPublished && <Badge className="rounded-none bg-success/15 text-success">Results published</Badge>}
          </div>
        </div>

        {!ended && (
          <Card className="border-l-4 border-l-accent p-4 text-sm text-muted-foreground">
            Marks appear here once the test ends — nothing is graded while students are still writing.
          </Card>
        )}
        {ended && pendingGrading > 0 && (
          <Card className="border-l-4 border-l-warning p-4 text-sm">
            {pendingGrading} attempt(s) still have ungraded written answers. Results cannot be published
            until every one is marked.
          </Card>
        )}

        <Card className="overflow-hidden shadow-card">
          <div className="p-6 pb-3">
            <h2 className="font-display text-xl font-bold">Attempts</h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Roll</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Violations</TableHead>
                  {ended && <TableHead className="text-right">Marks</TableHead>}
                  {ended && <TableHead>Grading</TableHead>}
                  <TableHead className="text-right">Paper</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attempts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={ended ? 7 : 5} className="py-8 text-center text-muted-foreground">
                      No attempts yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  attempts.map((row) => (
                    <TableRow key={row.attemptId}>
                      <TableCell className="font-mono-code">{row.rollNumber ?? "—"}</TableCell>
                      <TableCell>
                        <div className="font-medium">{row.name ?? row.email}</div>
                        <div className="text-xs text-muted-foreground">{row.uid ?? row.email}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{row.status}</TableCell>
                      <TableCell>
                        {row.suspectedMalpractice ? (
                          <span className="flex items-center gap-1 text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5" /> {row.violationCount} · flagged
                          </span>
                        ) : (
                          row.violationCount
                        )}
                      </TableCell>
                      {ended && (
                        <TableCell className="text-right font-mono-code">
                          {/* Denominator matters once papers are shuffled — students can sit
                              different question sets, so a bare score is ambiguous. */}
                          {row.finalScore === null ? "—" : `${row.finalScore} / ${row.totalPoints}`}
                        </TableCell>
                      )}
                      {ended && <TableCell className="text-muted-foreground">{row.gradingStatus}</TableCell>}
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setOpenAttemptId(row.attemptId)}>
                          <Eye className="mr-1 h-3.5 w-3.5" /> {ended ? "Grade" : "View"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      <Dialog open={Boolean(openAttemptId)} onOpenChange={(open) => !open && setOpenAttemptId(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{attempt ? `${attempt.name ?? attempt.email} — paper` : "Loading…"}</DialogTitle>
          </DialogHeader>
          {attempt && (
            <div className="space-y-4">
              {attempt.answers.map((answer, index) => (
                <div key={answer.questionId} className="space-y-2 border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        Q{index + 1} · {answer.type === "ShortAnswer" ? "Short answer" : answer.type}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{answer.statement}</p>
                    </div>
                    <span className="whitespace-nowrap font-mono-code text-sm">
                      {answer.awardedPoints} / {answer.maxPoints}
                    </span>
                  </div>

                  <div className="bg-muted/40 p-3 text-sm">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Answer</span>
                    <div className="mt-1 whitespace-pre-wrap">
                      {Array.isArray(answer.submittedAnswer)
                        ? answer.submittedAnswer.join(", ")
                        : answer.submittedAnswer || <em className="text-muted-foreground">Not answered</em>}
                    </div>
                  </div>

                  {answer.modelAnswer && (
                    <div className="border-l-2 border-accent bg-accent/5 p-3 text-sm">
                      <span className="text-xs uppercase tracking-wide text-accent">Model answer</span>
                      <div className="mt-1 whitespace-pre-wrap">{answer.modelAnswer}</div>
                    </div>
                  )}

                  {answer.requiresManualGrading &&
                    (ended ? (
                      <GradeRow
                        max={answer.maxPoints}
                        initialPoints={answer.awardedPoints}
                        initialNote={answer.graderNote ?? ""}
                        saving={gradeMutation.isPending}
                        onSave={(awardedPoints, graderNote) =>
                          gradeMutation.mutate({ questionId: answer.questionId, awardedPoints, graderNote })
                        }
                      />
                    ) : (
                      // The marking controls exist — they unlock when the test closes. Saying so
                      // here stops it looking like written answers simply cannot be graded.
                      <p className="border border-dashed border-border p-3 text-xs text-muted-foreground">
                        You mark this answer yourself. The marks box appears here once the test
                        ends — the server refuses grading while students are still writing.
                      </p>
                    ))}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

/** Marks + an optional note for one written answer. */
function GradeRow({
  max,
  initialPoints,
  initialNote,
  saving,
  onSave,
}: {
  max: number;
  initialPoints: number;
  initialNote: string;
  saving: boolean;
  onSave: (awardedPoints: number, graderNote: string | null) => void;
}) {
  const [points, setPoints] = useState(initialPoints);
  const [note, setNote] = useState(initialNote);

  return (
    <div className="grid gap-2 md:grid-cols-[120px_1fr_auto] md:items-end">
      <div>
        <Label className="text-xs">Marks (max {max})</Label>
        <Input type="number" min={0} max={max} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
      </div>
      <div>
        <Label className="text-xs">Note for the student (optional)</Label>
        <Textarea rows={1} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <Button onClick={() => onSave(points, note || null)} disabled={saving || points > max}>
        Save
      </Button>
    </div>
  );
}
