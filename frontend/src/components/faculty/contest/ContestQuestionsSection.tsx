import type { ContestQuestion } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function ContestQuestionsSection({ questions }: { questions: ContestQuestion[] }) {
  return (
    <Card className="border border-border bg-background p-5 shadow-none">
      <h2 className="mb-4 font-display text-xl font-semibold">Questions</h2>
      <div className="space-y-4">
        {questions.map((question, index) => (
          <div key={question.id} className="rounded border border-border p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline">Q{index + 1}</Badge>
              <Badge variant="outline">{question.type}</Badge>
              <Badge variant="outline">{question.points} pts</Badge>
              {question.type === "Coding" && <Badge>{question.difficulty}</Badge>}
            </div>
            <div className="font-medium">
              {question.type === "Coding" ? question.problemTitle : question.statement}
            </div>
          </div>
        ))}
        {questions.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">This contest has no questions yet.</div>
        )}
      </div>
    </Card>
  );
}
