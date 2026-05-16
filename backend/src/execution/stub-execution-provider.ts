import { env } from "../config/env";
import type { ExecutionProvider, ExecutionRequest, ExecutionResult } from "./execution-provider";

function buildExecutionResult(request: ExecutionRequest): ExecutionResult {
  const normalizedCode = request.code.toLowerCase();
  const totalCount = request.testCases.length;
  const runtimeMs = Math.max(8, Math.min(150, request.code.length));
  const memoryKb = Math.max(10240, Math.min(65536, request.code.length * 64));

  if (normalizedCode.includes("compile_error")) {
    return {
      status: "COMPILATION_ERROR",
      runtimeMs: 0,
      memoryKb: 0,
      passedCount: 0,
      totalCount,
      provider: env.EXECUTION_PROVIDER,
      stderr: "Stub provider simulated a compilation failure.",
    };
  }

  if (normalizedCode.includes("runtime_error")) {
    return {
      status: "RUNTIME_ERROR",
      runtimeMs,
      memoryKb,
      passedCount: 0,
      totalCount,
      provider: env.EXECUTION_PROVIDER,
      stderr: "Stub provider simulated a runtime failure.",
    };
  }

  if (normalizedCode.includes("tle")) {
    return {
      status: "TIME_LIMIT_EXCEEDED",
      runtimeMs: request.timeLimitSeconds * 1000,
      memoryKb,
      passedCount: 0,
      totalCount,
      provider: env.EXECUTION_PROVIDER,
      stderr: "Stub provider simulated a timeout.",
    };
  }

  if (normalizedCode.includes("wrong_answer")) {
    return {
      status: "WRONG_ANSWER",
      runtimeMs,
      memoryKb,
      passedCount: Math.max(totalCount - 1, 0),
      totalCount,
      provider: env.EXECUTION_PROVIDER,
      stdout: "Stub provider simulated a wrong answer.",
    };
  }

  return {
    status: "ACCEPTED",
    runtimeMs,
    memoryKb,
    passedCount: totalCount,
    totalCount,
    provider: env.EXECUTION_PROVIDER,
    stdout: "Stub provider accepted the submission without executing code locally.",
  };
}

export class StubExecutionProvider implements ExecutionProvider {
  async executeRun(request: ExecutionRequest): Promise<ExecutionResult> {
    return buildExecutionResult(request);
  }

  async executeSubmission(request: ExecutionRequest): Promise<ExecutionResult> {
    return buildExecutionResult(request);
  }
}
