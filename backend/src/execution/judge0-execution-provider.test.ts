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
    expect(client.lastPayload?.memory_limit).toBe(256 * 1024);
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
