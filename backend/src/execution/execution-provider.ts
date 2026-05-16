import type { ExecutableLanguage, SubmissionStatus } from "../shared/types/domain";

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
