import type { ProblemEditorData } from "@/api/types";

export type JsonImportFieldError = {
  path: string;
  message: string;
};

export function toProblemEditorDataFromJsonDraft(draft: ProblemEditorData): ProblemEditorData {
  return {
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
