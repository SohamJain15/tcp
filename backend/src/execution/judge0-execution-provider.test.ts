import { describe, expect, it } from "vitest";
import { Judge0ExecutionProvider } from "./judge0-execution-provider";
import type { Judge0Language, Judge0SubmissionRequest, Judge0SubmissionResponse } from "./judge0-client";

class FakeJudge0Client {
  public lastPayload: Judge0SubmissionRequest | null = null;

  constructor(private readonly languages: Judge0Language[]) {}

  usesApiKey(): boolean {
    return false;
  }

  async getLanguages(): Promise<Judge0Language[]> {
    return this.languages;
  }

  async createSubmissionAndWait(payload: Judge0SubmissionRequest): Promise<Judge0SubmissionResponse> {
    this.lastPayload = payload;
    return {
      token: "token-1",
      stdout: "T0sK",
      stderr: null,
      compile_output: null,
      message: null,
      time: "0.010",
      memory: 4096,
      status: {
        id: 3,
        description: "Accepted",
      },
    };
  }
}

describe("Judge0ExecutionProvider", () => {
  it("uses a JVM-safe execution profile for Java submissions", async () => {
    const client = new FakeJudge0Client([{ id: 91, name: "Java (JDK 17.0.6)" }]);
    const provider = new Judge0ExecutionProvider(client as never);

    const result = await provider.executeRun({
      code: "public class Main { public static void main(String[] args) { System.out.println(\"OK\"); } }",
      language: "java",
      problemId: "problem-1",
      timeLimitSeconds: 5,
      memoryLimitMb: 256,
      testCases: [{ input: "", output: "OK\n" }],
    });

    expect(result.status).toBe("ACCEPTED");
    expect(client.lastPayload?.language_id).toBe(91);
    expect(client.lastPayload?.cpu_time_limit).toBe(5);
    expect(client.lastPayload?.wall_time_limit).toBe(10);
    expect(client.lastPayload?.enable_per_process_and_thread_time_limit).toBe(false);
    expect(client.lastPayload?.enable_per_process_and_thread_memory_limit).toBe(false);
    expect(client.lastPayload?.memory_limit).toBe(256 * 4 * 1024);
  });

  it("applies a 3x time limit multiplier for Python submissions", async () => {
    const client = new FakeJudge0Client([{ id: 71, name: "Python (3.11.2)" }]);
    const provider = new Judge0ExecutionProvider(client as never);

    await provider.executeRun({
      code: "print('OK')",
      language: "python",
      problemId: "problem-1",
      timeLimitSeconds: 1,
      memoryLimitMb: 256,
      testCases: [{ input: "", output: "OK\n" }],
    });

    expect(client.lastPayload?.cpu_time_limit).toBe(3);
    expect(client.lastPayload?.wall_time_limit).toBe(6);
  });

  it("applies slower-runtime guardrails for Elixir submissions", async () => {
    const client = new FakeJudge0Client([{ id: 57, name: "Elixir (1.9.4)" }]);
    const provider = new Judge0ExecutionProvider(client as never);

    await provider.executeRun({
      code: 'IO.puts("OK")',
      language: "elixir",
      problemId: "problem-1",
      timeLimitSeconds: 1,
      memoryLimitMb: 256,
      testCases: [{ input: "", output: "OK\n" }],
    });

    expect(client.lastPayload?.cpu_time_limit).toBe(3);
    expect(client.lastPayload?.wall_time_limit).toBe(6);
    expect(client.lastPayload?.memory_limit).toBe(256 * 6 * 1024);
  });

  it("keeps the base time limit for C-family runtimes", async () => {
    const client = new FakeJudge0Client([{ id: 54, name: "C++ (GCC 9.2.0)" }]);
    const provider = new Judge0ExecutionProvider(client as never);

    await provider.executeRun({
      code: "#include <iostream>\nint main() { std::cout << \"OK\\n\"; }",
      language: "cpp",
      problemId: "problem-1",
      timeLimitSeconds: 1,
      memoryLimitMb: 256,
      testCases: [{ input: "", output: "OK\n" }],
    });

    expect(client.lastPayload?.cpu_time_limit).toBe(1);
    expect(client.lastPayload?.wall_time_limit).toBe(2);
  });

  it("maps compatibility aliases like arduino and vanilla to stable Judge0 runtimes", async () => {
    const client = new FakeJudge0Client([
      { id: 54, name: "C++ (GCC 9.2.0)" },
      { id: 63, name: "JavaScript (Node.js 12.14.0)" },
    ]);
    const provider = new Judge0ExecutionProvider(client as never);

    await provider.executeRun({
      code: "class Solution { public: int solve() { return 1; } };",
      language: "arduino",
      problemId: "problem-1",
      timeLimitSeconds: 1,
      memoryLimitMb: 256,
      testCases: [{ input: "", output: "1" }],
    });
    expect(client.lastPayload?.language_id).toBe(54);

    await provider.executeRun({
      code: "console.log('OK');",
      language: "vanilla",
      problemId: "problem-1",
      timeLimitSeconds: 1,
      memoryLimitMb: 256,
      testCases: [{ input: "", output: "OK\n" }],
    });
    expect(client.lastPayload?.language_id).toBe(63);
  });

  it("can resolve languages from Judge0 deployments with different version strings", async () => {
    const client = new FakeJudge0Client([{ id: 501, name: "Racket (8.13)" }]);
    const provider = new Judge0ExecutionProvider(client as never);

    const result = await provider.executeRun({
      code: '#lang racket\n(displayln "OK")',
      language: "racket",
      problemId: "problem-1",
      timeLimitSeconds: 2,
      memoryLimitMb: 256,
      testCases: [{ input: "", output: "OK\n" }],
    });

    expect(result.status).toBe("ACCEPTED");
    expect(client.lastPayload?.language_id).toBe(501);
  });
});

/** Records every submission so we can assert how many Judge0 jobs a run costs. */
class CountingJudge0Client {
  public readonly payloads: Judge0SubmissionRequest[] = [];

  constructor(private readonly statusIdFor: (callIndex: number) => number) {}

  usesApiKey(): boolean {
    return false;
  }

  async getLanguages(): Promise<Judge0Language[]> {
    return [{ id: 54, name: "C++ (GCC 14.1.0)" }];
  }

  async createSubmissionAndWait(payload: Judge0SubmissionRequest): Promise<Judge0SubmissionResponse> {
    const callIndex = this.payloads.length;
    this.payloads.push(payload);
    const statusId = this.statusIdFor(callIndex);
    return {
      token: `token-${callIndex}`,
      stdout: null,
      stderr: null,
      compile_output: statusId === 6 ? "error: expected ';'" : null,
      message: null,
      time: "0.010",
      memory: 4096,
      status: { id: statusId, description: String(statusId) },
    };
  }
}

const cppRequest = (testCaseCount: number) => ({
  code: "int main() { return 0; }",
  language: "cpp" as const,
  problemId: "problem-1",
  timeLimitSeconds: 1,
  memoryLimitMb: 256,
  testCases: Array.from({ length: testCaseCount }, (_, index) => ({
    input: String(index),
    output: String(index),
  })),
});

describe("Judge0ExecutionProvider compile handling", () => {
  it("spends no extra Judge0 job on a preflight compile check", async () => {
    // Everything passes: 4 test cases must cost exactly 4 submissions, not 5.
    const client = new CountingJudge0Client(() => 3);
    const provider = new Judge0ExecutionProvider(client as never);

    const result = await provider.executeSubmission(cppRequest(4));

    expect(result.status).toBe("ACCEPTED");
    expect(result.passedCount).toBe(4);
    expect(result.totalCount).toBe(4);
    expect(client.payloads).toHaveLength(4);
  });

  it("reports a compilation error from the first test case without running the rest", async () => {
    const client = new CountingJudge0Client(() => 6);
    const provider = new Judge0ExecutionProvider(client as never);

    const result = await provider.executeSubmission(cppRequest(10));

    expect(result.status).toBe("COMPILATION_ERROR");
    expect(result.stderr).toContain("expected ';'");
    // One job proves the compile failure — the other 9 test cases are never sent.
    expect(client.payloads).toHaveLength(1);
    expect(result.passedCount).toBe(0);
    expect(result.totalCount).toBe(0);
  });

  it("stops after the first failing test case", async () => {
    // First case fails outright, so no further chunk should be dispatched.
    const client = new CountingJudge0Client((callIndex) => (callIndex === 0 ? 4 : 3));
    const provider = new Judge0ExecutionProvider(client as never);

    const result = await provider.executeSubmission(cppRequest(8));

    expect(result.status).toBe("WRONG_ANSWER");
    expect(client.payloads).toHaveLength(1);
    expect(result.passedCount).toBe(0);
    expect(result.totalCount).toBe(1);
  });
});
