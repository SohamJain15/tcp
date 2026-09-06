import { Card } from "@/components/ui/card";

import type { CodingWorkspaceQuestion } from "./types";

/**
 * The statement pane of a coding workspace: title, problem statement, constraints, I/O formats and
 * sample cases.
 *
 * Extracted from the contest workspace so the lab experiment route renders exactly the same
 * statement a contest does, rather than a second, drifting copy of it.
 */
export function CodingDescription({ question }: { question: CodingWorkspaceQuestion }) {
  return (
    <Card className="p-6 shadow-card">
      <h1 className="font-display text-2xl font-bold">{question.title}</h1>
      <pre className="mt-4 whitespace-pre-wrap break-words text-sm text-muted-foreground">
        {question.problemStatement}
      </pre>

      <section className="mt-6 space-y-5 text-sm leading-relaxed">
        <div>
          <h3 className="mb-1 font-display text-base font-semibold">Constraints</h3>
          <pre className="whitespace-pre-wrap break-words text-muted-foreground">{question.constraints}</pre>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-1 font-display text-base font-semibold">Input Format</h3>
            <pre className="whitespace-pre-wrap break-words text-muted-foreground">{question.inputFormat}</pre>
          </div>
          <div>
            <h3 className="mb-1 font-display text-base font-semibold">Output Format</h3>
            <pre className="whitespace-pre-wrap break-words text-muted-foreground">{question.outputFormat}</pre>
          </div>
        </div>
        <div>
          <h3 className="mb-1 font-display text-base font-semibold">Sample Test Cases</h3>
          <div className="space-y-2">
            {question.sampleTestCases.map((testCase, index) => (
              <div key={`${question.id}-${index}`} className="rounded border border-border p-3">
                <div className="mb-1 text-xs font-semibold">Case {index + 1}</div>
                <div className="text-xs">
                  <div className="font-semibold text-accent">Input</div>
                  <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono-code text-foreground">
                    {testCase.input}
                  </pre>
                </div>
                <div className="mt-2 text-xs">
                  <div className="font-semibold text-accent">Expected Output</div>
                  <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono-code text-foreground">
                    {testCase.output}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </Card>
  );
}
