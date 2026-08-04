import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { Judge0ExecutionProvider } from "./judge0-execution-provider";
import { BATCH_CASE_SEPARATOR } from "./harness/contract";
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

describe("Judge0ExecutionProvider failing-case capture", () => {
  it("reports the first failing case paired with the input that produced it", async () => {
    // Case 0 passes, case 1 is wrong. Cases 1..3 go out in one chunk, so the provider must pick
    // the first failure by index rather than by whichever response happened to arrive first.
    const client = new CountingJudge0Client((callIndex) => (callIndex === 1 ? 4 : 3));
    const provider = new Judge0ExecutionProvider(client as never);

    const result = await provider.executeSubmission({ ...cppRequest(4), sampleCaseCount: 1 });

    expect(result.failedTest).toEqual({
      index: 1,
      isHidden: true,
      status: "WRONG_ANSWER",
      input: "1",
      expectedOutput: "1",
      actualOutput: "",
    });
  });

  it("marks a failure inside the sample range as visible", async () => {
    const client = new CountingJudge0Client(() => 4);
    const provider = new Judge0ExecutionProvider(client as never);

    const result = await provider.executeSubmission({ ...cppRequest(4), sampleCaseCount: 2 });

    expect(result.failedTest?.index).toBe(0);
    expect(result.failedTest?.isHidden).toBe(false);
  });

  it("captures nothing when every case passes", async () => {
    const client = new CountingJudge0Client(() => 3);
    const provider = new Judge0ExecutionProvider(client as never);

    const result = await provider.executeSubmission({ ...cppRequest(4), sampleCaseCount: 1 });

    expect(result.failedTest).toBeUndefined();
  });

  it("captures nothing for a compilation error, which has no case to blame", async () => {
    const client = new CountingJudge0Client(() => 6);
    const provider = new Judge0ExecutionProvider(client as never);

    const result = await provider.executeSubmission({ ...cppRequest(4), sampleCaseCount: 1 });

    expect(result.status).toBe("COMPILATION_ERROR");
    expect(result.failedTest).toBeUndefined();
  });
});

/**
 * Serves a scripted stdout per call so we can drive the batch path: the batched job is
 * always call 0, and any later calls are the per-case fallback.
 */
class ScriptedJudge0Client {
  public readonly payloads: Judge0SubmissionRequest[] = [];

  constructor(private readonly replyFor: (callIndex: number) => { statusId: number; stdout: string | null }) {}

  usesApiKey(): boolean {
    return false;
  }

  async getLanguages(): Promise<Judge0Language[]> {
    return [{ id: 71, name: "Python (3.12.5)" }];
  }

  async createSubmissionAndWait(payload: Judge0SubmissionRequest): Promise<Judge0SubmissionResponse> {
    const callIndex = this.payloads.length;
    this.payloads.push(payload);
    const { statusId, stdout } = this.replyFor(callIndex);
    return {
      token: `token-${callIndex}`,
      // Judge0Client decodes base64 before returning, so the provider always sees plain text.
      stdout,
      stderr: null,
      compile_output: null,
      message: null,
      time: "0.020",
      memory: 8192,
      status: { id: statusId, description: String(statusId) },
    };
  }
}

const SEP = BATCH_CASE_SEPARATOR;

const batchRequest = (outputs: string[]) => ({
  code: "single-case program",
  language: "python" as const,
  problemId: "problem-batch",
  timeLimitSeconds: 1,
  memoryLimitMb: 256,
  comparison: { mode: "EXACT" } as const,
  batchProgram: { source: "batched program", parameterCount: 1 },
  testCases: outputs.map((output, index) => ({ input: `case-${index}`, output })),
});

describe("Judge0ExecutionProvider batched execution", () => {
  it("judges every test case from a single compiled job", async () => {
    const client = new ScriptedJudge0Client(() => ({
      statusId: 3,
      stdout: ["1", "2", "3"].map((value) => `${value}\n${SEP}\n`).join(""),
    }));
    const provider = new Judge0ExecutionProvider(client as never);

    const result = await provider.executeSubmission(batchRequest(["1", "2", "3"]));

    expect(result.status).toBe("ACCEPTED");
    expect(result.passedCount).toBe(3);
    expect(result.totalCount).toBe(3);
    // The whole point: 3 test cases cost one compile, not three.
    expect(client.payloads).toHaveLength(1);
    expect(client.payloads[0].source_code).toBe("batched program");
    // stdin is framed as a leading case count followed by one line per case.
    expect(client.payloads[0].stdin).toBe("3\ncase-0\ncase-1\ncase-2");
  });

  it("reports the failing case from a batched run", async () => {
    const client = new ScriptedJudge0Client(() => ({
      statusId: 3,
      stdout: ["1", "WRONG", "3"].map((value) => `${value}\n${SEP}\n`).join(""),
    }));
    const provider = new Judge0ExecutionProvider(client as never);

    const result = await provider.executeSubmission(batchRequest(["1", "2", "3"]));

    expect(result.status).toBe("WRONG_ANSWER");
    // A batch runs to completion in one process, so cases after the failure are still judged —
    // unlike the per-case path, which stops at the first failing chunk. The verdict matches
    // either way; only the passed-count is more informative here.
    expect(result.passedCount).toBe(2);
    expect(result.totalCount).toBe(3);
    expect(client.payloads).toHaveLength(1);
  });

  it("falls back to per-case execution when the batch output misaligns", async () => {
    // A student printing debug output breaks the segment framing; the verdict must come
    // from re-running the cases individually rather than from a misaligned batch.
    const client = new ScriptedJudge0Client((callIndex) =>
      callIndex === 0
        ? { statusId: 3, stdout: `noise\n1\n${SEP}\n2\n${SEP}\n` }
        : { statusId: 3, stdout: null },
    );
    const provider = new Judge0ExecutionProvider(client as never);

    const result = await provider.executeSubmission(batchRequest(["1", "2", "3"]));

    // 1 batched attempt + 3 per-case runs.
    expect(client.payloads).toHaveLength(4);
    expect(result.totalCount).toBe(3);
    // The fallback runs the ORIGINAL single-case program, not the batched one.
    expect(client.payloads[1].source_code).toBe("single-case program");
  });

  it("falls back when the batched run does not finish cleanly", async () => {
    // A timeout says nothing about which case was slow, so per-case execution decides.
    const client = new ScriptedJudge0Client((callIndex) =>
      callIndex === 0 ? { statusId: 5, stdout: null } : { statusId: 3, stdout: null },
    );
    const provider = new Judge0ExecutionProvider(client as never);

    const result = await provider.executeSubmission(batchRequest(["1", "2"]));

    expect(client.payloads.length).toBeGreaterThan(1);
    expect(result.status).not.toBe("INTERNAL_ERROR");
  });

  it("ignores the batch program when batching is not offered", async () => {
    const client = new ScriptedJudge0Client(() => ({ statusId: 3, stdout: null }));
    const provider = new Judge0ExecutionProvider(client as never);

    const { batchProgram: _omitted, ...withoutBatch } = batchRequest(["1", "2"]);
    await provider.executeSubmission(withoutBatch);

    // Straight to the per-case path: one job per test case.
    expect(client.payloads).toHaveLength(2);
  });
});
