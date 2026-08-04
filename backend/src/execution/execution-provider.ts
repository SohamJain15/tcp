import type { ExecutableLanguage, SubmissionStatus } from "../shared/types/domain";
import type { ComparisonMode } from "./harness/contract";

export interface ExecutionTestCase {
  input: string;
  output: string;
  explanation?: string;
}

/**
 * The first test case a submission got wrong, kept so the student can be shown *which* case
 * broke rather than a bare pass count.
 *
 * Always captured in full; how much of it a given student may see is decided at the response
 * boundary (see `redactFailedTest` in the submission module), because a practice problem and a
 * live contest have very different answers to that question.
 */
export interface FailedTestCase {
  /** Position in the `[...sampleTestCases, ...hiddenTestCases]` array the caller supplied. */
  index: number;
  isHidden: boolean;
  status: SubmissionStatus;
  input: string;
  expectedOutput: string;
  actualOutput: string;
}

export interface ExecutionRequest {
  code: string;
  language: ExecutableLanguage;
  testCases: ExecutionTestCase[];
  /**
   * How many leading entries of {@link testCases} are sample (student-visible) cases. Lets the
   * provider label a failure hidden or not without needing the problem record.
   */
  sampleCaseCount?: number;
  problemId: string;
  timeLimitSeconds: number;
  memoryLimitMb: number;
  /**
   * How to compare produced output against expected. Defaults to EXACT (delegated
   * to Judge0). Non-EXACT modes are compared locally in the provider.
   */
  comparison?: ComparisonMode;
  /**
   * An equivalent program that runs every test case in one process, letting the provider
   * compile once instead of once per case. Present only for harness problems in languages
   * with batch support; the provider always keeps {@link code} as the fallback.
   */
  batchProgram?: {
    source: string;
    /** stdin lines each case occupies, so cases can be framed as a fixed-width block. */
    parameterCount: number;
  };
}

export interface ExecutionResult {
  status: SubmissionStatus;
  runtimeMs: number;
  memoryKb: number;
  passedCount: number;
  totalCount: number;
  provider: string;
  stdout?: string;
  stderr?: string;
  /** Absent when every case passed, or when the failure has no case to point at (compile error). */
  failedTest?: FailedTestCase;
}

export interface ExecutionProvider {
  executeRun(request: ExecutionRequest): Promise<ExecutionResult>;
  executeSubmission(request: ExecutionRequest): Promise<ExecutionResult>;
}
