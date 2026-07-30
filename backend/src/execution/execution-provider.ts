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
