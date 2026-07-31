import type { ExecutableLanguage, SubmissionStatus } from "../shared/types/domain";
import type { ComparisonMode } from "./harness/contract";

export interface ExecutionTestCase {
  input: string;
  output: string;
  explanation?: string;
}

export interface ExecutionRequest {
  code: string;
  language: ExecutableLanguage;
  testCases: ExecutionTestCase[];
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
}

export interface ExecutionProvider {
  executeRun(request: ExecutionRequest): Promise<ExecutionResult>;
  executeSubmission(request: ExecutionRequest): Promise<ExecutionResult>;
}
