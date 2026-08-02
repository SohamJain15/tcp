import { Link } from "react-router-dom";

import type { FacultyContestAttemptReview } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toFacultyStudentProfilePath } from "@/lib/student-profile";

interface ContestAttemptReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  review: FacultyContestAttemptReview | null;
  isLoading: boolean;
  resultsPublished: boolean;
}

export function ContestAttemptReviewDialog({
  open,
  onOpenChange,
  review,
  isLoading,
  resultsPublished,
}: ContestAttemptReviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {review ? `${review.student.name ?? review.student.email} — Full Attempt Review` : "Loading review..."}
          </DialogTitle>
        </DialogHeader>
        {isLoading && <div className="text-sm text-muted-foreground">Loading student solutions...</div>}
        {!isLoading && review && (
          <div className="space-y-5">
            <div className={`grid gap-3 ${resultsPublished ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
              <Card className="p-4 shadow-none">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Student</div>
                <Link to={toFacultyStudentProfilePath(review.student.email)} className="mt-2 block hover:text-accent">
                  <div className="font-medium">{review.student.name ?? review.student.email}</div>
                  <div className="text-xs text-muted-foreground">{review.student.uid ?? review.student.email}</div>
                </Link>
              </Card>
              {/* Same rule as the attempts table: no score exists before publish. */}
              {resultsPublished && (
                <Card className="p-4 shadow-none">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Score</div>
                  <div className="mt-2 text-lg font-semibold">{review.score}</div>
                </Card>
              )}
              <Card className="p-4 shadow-none">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Time Taken</div>
                <div className="mt-2 text-lg font-semibold">
                  {review.timeTakenMs !== null ? `${Math.ceil(review.timeTakenMs / 1000)} sec` : "-"}
                </div>
              </Card>
              <Card className="p-4 shadow-none">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Violations</div>
                <div className="mt-2 text-lg font-semibold">
                  {review.violationCount} ({review.violationPenaltyPoints} pts)
                </div>
              </Card>
            </div>

            <div className="space-y-4">
              {review.questionReviews.map((item) => (
                <Card key={item.questionId} className="border border-border p-4 shadow-none">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Q{item.questionNumber}</Badge>
                    <Badge variant="outline">{item.type}</Badge>
                    <Badge variant="outline">
                      {item.awardedPoints}/{item.points} pts
                    </Badge>
                    <Badge variant="outline">{item.status}</Badge>
                  </div>
                  <h3 className="mt-3 text-base font-semibold">{item.title}</h3>
                  {item.type !== "Coding" ? (
                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                      <div>{item.statement}</div>
                      <div>
                        Submitted:{" "}
                        <span className="font-medium text-foreground">
                          {Array.isArray(item.submittedAnswer)
                            ? item.submittedAnswer.join(", ")
                            : item.submittedAnswer ?? "-"}
                        </span>
                      </div>
                      <div>
                        Correct:{" "}
                        <span className="font-medium text-foreground">
                          {Array.isArray(item.correctAnswer) ? item.correctAnswer.join(", ") : item.correctAnswer}
                        </span>
                      </div>
                      <div>
                        Correctness:{" "}
                        <span className="font-medium text-foreground">{item.isCorrect ? "Correct" : "Incorrect"}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                      <div>{item.problemStatement}</div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          Passed:{" "}
                          <span className="font-medium text-foreground">
                            {item.passedCount}/{item.totalCount}
                          </span>
                        </div>
                        <div>
                          Verdict:{" "}
                          <span className="font-medium text-foreground">{item.finalSubmissionStatus ?? "-"}</span>
                        </div>
                        <div>
                          Language:{" "}
                          <span className="font-medium text-foreground">{item.finalSubmissionLanguage ?? "-"}</span>
                        </div>
                        <div>
                          Runtime / Memory:{" "}
                          <span className="font-medium text-foreground">
                            {item.finalRuntimeMs} ms / {(item.finalMemoryKb / 1024).toFixed(1)} MB
                          </span>
                        </div>
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
  );
}
