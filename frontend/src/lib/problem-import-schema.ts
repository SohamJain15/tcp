import type { ProblemEditorData } from "@/api/types";

export type JsonImportFieldError = {
  path: string;
  message: string;
};

export function toProblemEditorDataFromJsonDraft(draft: ProblemEditorData): ProblemEditorData {
  return {
    // `kind` and `sql` must survive this whitelist. Dropping them silently turns an imported SQL
    // problem into a coding one with no test cases, which the server then rejects on save — with
    // an error that points at test cases rather than at the real cause.
    kind: draft.kind ?? "coding",
    sql: draft.sql,
    title: draft.title,
    slug: draft.slug,
    difficulty: draft.difficulty,
    topic: draft.topic,
    tags: draft.tags,
    statement: draft.statement,
    inputFormat: draft.inputFormat,
    outputFormat: draft.outputFormat,
    constraints: draft.constraints,
    explanation: draft.explanation,
    timeLimitSeconds: draft.timeLimitSeconds,
    memoryLimitMb: draft.memoryLimitMb,
    sampleTestCases: draft.sampleTestCases,
    hiddenTestCases: draft.hiddenTestCases,
    lifecycleState: "Draft",
  };
}
