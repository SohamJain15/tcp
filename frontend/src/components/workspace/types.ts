import type { ExecutableLanguage, SubmissionResult } from "@/api/types";

/**
 * Where run / submit / draft-save go.
 *
 * Injected rather than hard-wired so the same workspace serves contests, class tests and labs —
 * the editor, console, verdict handling and draft persistence are identical, only the endpoints
 * differ.
 */
export interface CodingWorkspaceApi {
  run(input: CodingWorkspaceInput): Promise<{ result: SubmissionResult }>;
  submit(input: CodingWorkspaceInput): Promise<{ submissionId: string }>;
  saveDraft(input: CodingWorkspaceInput): Promise<unknown>;
}

export interface CodingWorkspaceInput {
  questionId: string;
  code: string;
  language: ExecutableLanguage;
}

/**
 * Only what the workspace actually renders. Kept structural rather than tied to the contest type
 * so a class-test question and a lab experiment satisfy it too.
 */
export interface CodingWorkspaceQuestion {
  id: string;
  title: string;
  problemStatement: string;
  constraints?: string;
  inputFormat?: string;
  outputFormat?: string;
  sampleTestCases: { input: string; output: string; explanation?: string }[];
  /** When set, the language picker offers only these — and disappears if there is just one. */
  supportedLanguages?: ExecutableLanguage[];
}
