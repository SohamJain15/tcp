import { env } from "../config/env";
import type { ExecutableLanguage, SubmissionStatus } from "../shared/types/domain";
import { EXECUTION_SERVICE_UNAVAILABLE_MESSAGE } from "../shared/errors/public-messages";
import { logServerError } from "../shared/logging/error-logger";
import { isExecutableLanguage, tryNormalizeSupportedLanguage } from "../shared/utils/normalize";
import type {
  ExecutionProvider,
  ExecutionRequest,
  ExecutionResult,
  ExecutionTestCase,
  FailedTestCase,
} from "./execution-provider";
import { compareOutput, isDelegatedComparison } from "./harness";
import { BATCH_CASE_SEPARATOR } from "./harness/contract";
import {
  Judge0Client,
  Judge0ClientError,
  type Judge0Language,
  type Judge0SubmissionResponse,
} from "./judge0-client";

const PROVIDER_NAME = "judge0";
const MAX_CPU_TIME_LIMIT_SECONDS = 5;
/**
 * Ceiling for a whole batched run. Judge0's own MAX_CPU_TIME_LIMIT is far higher, but a
 * batch that outgrows this would hold an isolate worker long enough to hurt everyone else,
 * so the batch is split instead.
 */
const MAX_BATCH_CPU_TIME_LIMIT_SECONDS = 20;

/**
 * Per-field cap on a captured failing case. A problem with a megabyte of generated input would
 * otherwise write that megabyte into every failed submission document.
 */
const MAX_CAPTURED_FIELD_CHARS = 4000;

const EDITOR_ONLY_BLOCKLIST = new Set(["react", "html", "css"]);

type LanguageIdMap = Record<ExecutableLanguage, number | null>;

interface TestExecutionOutcome {
  status: SubmissionStatus;
  runtimeMs: number;
  memoryKb: number;
  stdout?: string;
  stderr?: string;
}

function clip(value: string): string {
  return value.length <= MAX_CAPTURED_FIELD_CHARS
    ? value
    : `${value.slice(0, MAX_CAPTURED_FIELD_CHARS)}\n… (truncated)`;
}

const LANGUAGE_RUNTIME_ALIASES: Partial<Record<ExecutableLanguage, ExecutableLanguage>> = {
  arduino: "cpp",
  vanilla: "javascript",
};

const LANGUAGE_TIME_LIMIT_MULTIPLIERS: Partial<Record<ExecutableLanguage, number>> = {
  python: 3,
  java: 1.5,
  javascript: 3,
  vanilla: 3,
  php: 3,
  typescript: 4,
  elixir: 3,
  erlang: 2,
  kotlin: 2,
  scala: 2,
  c: 1,
  cpp: 1,
};

const LANGUAGE_MEMORY_LIMIT_MULTIPLIERS: Partial<Record<ExecutableLanguage, number>> = {
  java: 4,
  javascript: 2,
  vanilla: 2,
  php: 2,
  typescript: 2,
  go: 2,
  kotlin: 4,
  scala: 4,
  elixir: 6,
  erlang: 6,
};

export class Judge0ExecutionProvider implements ExecutionProvider {
  private readonly client: Judge0Client;

  private readonly cloudFallbackLanguageIds: LanguageIdMap = {
    c: 103,
    cpp: 105,
    java: 91,
    javascript: 102,
    python: 113,
    ruby: 72,
    arduino: 105,
    go: 107,
    rust: 108,
    csharp: 51,
    php: 98,
    vanilla: 102,
    typescript: 101,
    assembly8086: 45,
    kotlin: 111,
    swift: 83,
    dart: 90,
    scala: 112,
    elixir: 57,
    erlang: 58,
    racket: null,
  };

  private readonly localFallbackLanguageIds: LanguageIdMap = {
    c: 50,
    cpp: 54,
    java: 62,
    javascript: 63,
    python: 71,
    ruby: 72,
    arduino: 54,
    go: 60,
    rust: 73,
    csharp: 51,
    php: 68,
    vanilla: 63,
    typescript: 74,
    assembly8086: 45,
    kotlin: 78,
    swift: 83,
    dart: 90,
    scala: 81,
    elixir: 57,
    erlang: 58,
    racket: null,
  };

  private readonly preferredLanguageNames: Record<ExecutableLanguage, readonly string[]> = {
    c: ["C (GCC 14.1.0)", "C (GCC 9.2.0)", "C (GCC 8.3.0)", "C (GCC 7.4.0)"],
    cpp: ["C++ (GCC 14.1.0)", "C++ (GCC 9.2.0)", "C++ (GCC 8.3.0)", "C++ (GCC 7.4.0)"],
    java: ["Java (JDK 17.0.6)", "Java (OpenJDK 13.0.1)"],
    javascript: [
      "JavaScript (Node.js 22.08.0)",
      "JavaScript (Node.js 20.17.0)",
      "JavaScript (Node.js 18.15.0)",
      "JavaScript (Node.js 12.14.0)",
    ],
    python: [
      "Python (3.14.0)",
      "Python (3.13.2)",
      "Python (3.12.5)",
      "Python (3.11.2)",
      "Python (3.8.1)",
    ],
    ruby: ["Ruby (2.7.0)"],
    arduino: ["C++ (GCC 14.1.0)", "C++ (GCC 9.2.0)", "C++ (GCC 8.3.0)", "C++ (GCC 7.4.0)"],
    go: ["Go (1.23.5)", "Go (1.22.0)", "Go (1.18.5)", "Go (1.13.5)"],
    rust: ["Rust (1.85.0)", "Rust (1.40.0)"],
    csharp: ["C# (Mono 6.6.0.161)"],
    php: ["PHP (8.3.11)", "PHP (7.4.1)"],
    vanilla: [
      "JavaScript (Node.js 22.08.0)",
      "JavaScript (Node.js 20.17.0)",
      "JavaScript (Node.js 18.15.0)",
      "JavaScript (Node.js 12.14.0)",
    ],
    typescript: ["TypeScript (5.6.2)", "TypeScript (5.0.3)", "TypeScript (3.7.4)"],
    assembly8086: ["Assembly (NASM 2.14.02)"],
    kotlin: ["Kotlin (2.1.10)", "Kotlin (1.3.70)"],
    swift: ["Swift (5.2.3)"],
    dart: ["Dart (2.19.2)"],
    scala: ["Scala (3.4.2)", "Scala (2.13.2)"],
    elixir: ["Elixir (1.9.4)"],
    erlang: ["Erlang (OTP 22.2)"],
    racket: [],
  };

  private readonly languageNameHints: Record<ExecutableLanguage, readonly string[]> = {
    c: ["c (gcc", "c (clang"],
    cpp: ["c++"],
    java: ["java"],
    javascript: ["javascript", "node.js"],
    python: ["python"],
    ruby: ["ruby"],
    arduino: ["arduino", "c++"],
    go: ["go ("],
    rust: ["rust"],
    csharp: ["c#"],
    php: ["php"],
    vanilla: ["javascript", "node.js"],
    typescript: ["typescript"],
    assembly8086: ["assembly", "nasm"],
    kotlin: ["kotlin"],
    swift: ["swift"],
    dart: ["dart"],
    scala: ["scala"],
    elixir: ["elixir"],
    erlang: ["erlang"],
    racket: ["racket"],
  };

  constructor(client = new Judge0Client()) {
    this.client = client;
  }

  async executeRun(request: ExecutionRequest): Promise<ExecutionResult> {
    try {
      const sample = request.testCases[0];

      if (!sample) {
        return this.buildInternalErrorResult(0, new Error("No sample test case configured."));
      }

      const languageId = await this.resolveLanguageId(request.language);
      const result = await this.executeTestCase(request, sample, languageId);

      return {
        status: result.status,
        runtimeMs: result.runtimeMs,
        memoryKb: result.memoryKb,
        passedCount: result.status === "ACCEPTED" ? 1 : 0,
        totalCount: 1,
        provider: PROVIDER_NAME,
        stdout: result.stdout,
        stderr: result.stderr,
        // Run only ever executes sample cases, which the student can already read in the
        // statement — nothing is disclosed here that the problem page does not already show.
        failedTest: this.captureFailedTest(request, [result], request.testCases.length),
      };
    } catch (error) {
      return this.buildInternalErrorResult(
        request.testCases.length > 0 ? 1 : 0,
        error,
      );
    }
  }

  async executeSubmission(request: ExecutionRequest): Promise<ExecutionResult> {
    try {
      if (request.testCases.length === 0) {
        return this.buildInternalErrorResult(0, new Error("No test cases configured."));
      }

      const languageId = await this.resolveLanguageId(request.language);

      // Compiling dominates the cost of judging (roughly 97% for C++), so when the harness
      // produced a batched program we compile once and run every case in a single job.
      // Any inconclusive outcome falls through to the per-case path below.
      if (env.JUDGE0_BATCH_TEST_CASES && request.batchProgram) {
        const batched = await this.executeBatched(request, request.batchProgram, languageId);
        if (batched) {
          return batched;
        }
      }

      const chunkSize = env.SUBMISSION_CHUNK_SIZE;
      const results: TestExecutionOutcome[] = [];

      // The first test case doubles as the compile check: a broken program fails to
      // compile here exactly as a dedicated preflight run would, so we skip that extra
      // compile entirely. It runs alone so a compile error costs one Judge0 job, not a
      // whole chunk of them.
      const firstResult = await this.executeTestCase(request, request.testCases[0], languageId);

      if (firstResult.status === "COMPILATION_ERROR") {
        return {
          status: firstResult.status,
          runtimeMs: firstResult.runtimeMs,
          memoryKb: firstResult.memoryKb,
          passedCount: 0,
          // A compile error is not a test outcome — keep reporting 0/0 as before.
          totalCount: 0,
          provider: PROVIDER_NAME,
          stdout: firstResult.stdout,
          stderr: firstResult.stderr,
        };
      }

      results.push(firstResult);

      if (firstResult.status === "ACCEPTED") {
        for (let index = 1; index < request.testCases.length; index += chunkSize) {
          const testCaseChunk = request.testCases.slice(index, index + chunkSize);
          const chunkResults = await Promise.all(
            testCaseChunk.map((testCase) => this.executeTestCase(request, testCase, languageId)),
          );
          results.push(...chunkResults);

          if (chunkResults.some((result) => result.status !== "ACCEPTED")) {
            break;
          }
        }
      }

      const passedCount = results.filter((result) => result.status === "ACCEPTED").length;
      const runtimeMs = results.reduce((max, result) => Math.max(max, result.runtimeMs), 0);
      const memoryKb = results.reduce((max, result) => Math.max(max, result.memoryKb), 0);
      const status = this.selectFinalStatus(results);
      const diagnostic = this.pickAggregateDiagnostic(results, status);

      return {
        status,
        runtimeMs,
        memoryKb,
        passedCount,
        totalCount: results.length,
        provider: PROVIDER_NAME,
        stdout: diagnostic?.stdout,
        stderr: diagnostic?.stderr,
        failedTest: this.captureFailedTest(request, results),
      };
    } catch (error) {
      return this.buildInternalErrorResult(request.testCases.length, error);
    }
  }

  /**
   * Run every test case in one compiled program.
   *
   * Returns `null` whenever the batch cannot be trusted to describe each case accurately —
   * a compile/runtime/timeout outcome, or output that does not split into exactly one
   * segment per case (a student printing debug output would misalign them). The caller then
   * re-runs the cases individually, so batching can only ever make judging faster, never
   * change a verdict.
   */
  private async executeBatched(
    request: ExecutionRequest,
    batchProgram: NonNullable<ExecutionRequest["batchProgram"]>,
    languageId: number,
  ): Promise<ExecutionResult | null> {
    const testCases = request.testCases;
    const perCaseTimeLimit = this.resolveAdjustedTimeLimitSeconds(request.language, request.timeLimitSeconds);

    // Size the batch so the whole run still fits a sane ceiling: one slow case must not be
    // able to push the job past the wall clock and take every other case down with it.
    const maxCasesPerBatch = Math.max(1, Math.floor(MAX_BATCH_CPU_TIME_LIMIT_SECONDS / perCaseTimeLimit));
    const batchSize = Math.min(env.SUBMISSION_BATCH_SIZE, maxCasesPerBatch);
    if (batchSize < 2) {
      // Nothing to gain over the per-case path.
      return null;
    }

    const outcomes: TestExecutionOutcome[] = [];

    for (let index = 0; index < testCases.length; index += batchSize) {
      const group = testCases.slice(index, index + batchSize);
      const batchOutcome = await this.executeBatchGroup(request, batchProgram, group, languageId, perCaseTimeLimit);
      if (!batchOutcome) {
        return null;
      }

      outcomes.push(...batchOutcome);
      if (batchOutcome.some((outcome) => outcome.status !== "ACCEPTED")) {
        break;
      }
    }

    const passedCount = outcomes.filter((outcome) => outcome.status === "ACCEPTED").length;
    const status = this.selectFinalStatus(outcomes);
    const diagnostic = this.pickAggregateDiagnostic(outcomes, status);

    return {
      status,
      runtimeMs: outcomes.reduce((max, outcome) => Math.max(max, outcome.runtimeMs), 0),
      memoryKb: outcomes.reduce((max, outcome) => Math.max(max, outcome.memoryKb), 0),
      passedCount,
      totalCount: outcomes.length,
      provider: PROVIDER_NAME,
      stdout: diagnostic?.stdout,
      stderr: diagnostic?.stderr,
      failedTest: this.captureFailedTest(request, outcomes),
    };
  }

  /** One Judge0 job covering `group`, split back into per-case outcomes (or null to fall back). */
  private async executeBatchGroup(
    request: ExecutionRequest,
    batchProgram: NonNullable<ExecutionRequest["batchProgram"]>,
    group: readonly ExecutionTestCase[],
    languageId: number,
    perCaseTimeLimit: number,
  ): Promise<TestExecutionOutcome[] | null> {
    // Fixed-width framing: a leading case count, then each case's parameter lines verbatim.
    const stdin = [
      String(group.length),
      ...group.map((testCase) => this.normalizeBatchCaseInput(testCase.input, batchProgram.parameterCount)),
    ].join("\n");

    const cpuTimeLimit = Math.min(perCaseTimeLimit * group.length, MAX_BATCH_CPU_TIME_LIMIT_SECONDS);

    let response: Judge0SubmissionResponse;
    try {
      response = await this.client.createSubmissionAndWait({
        source_code: batchProgram.source,
        language_id: languageId,
        stdin,
        // Always compared locally: the batch stdout holds every case's output at once.
        expected_output: undefined,
        cpu_time_limit: cpuTimeLimit,
        wall_time_limit: Math.max(cpuTimeLimit * 2, cpuTimeLimit + 1),
        memory_limit: this.resolveAdjustedMemoryLimitKb(request.language, request.memoryLimitMb),
        enable_network: false,
        redirect_stderr_to_stdout: false,
        enable_per_process_and_thread_time_limit: false,
        enable_per_process_and_thread_memory_limit: false,
      });
    } catch (error) {
      const judge0Error = error as { response?: { data?: unknown } };
      logServerError("Judge0 batch execution failed", error, {
        provider: PROVIDER_NAME,
        providerResponse: judge0Error.response?.data,
      });
      return null;
    }

    const outcome = this.normalizeJudge0Response(response);

    // A non-clean run says nothing about which case failed — re-run them individually so the
    // student sees an accurate verdict and passed-count.
    if (outcome.status !== "ACCEPTED") {
      return null;
    }

    const segments = (outcome.stdout ?? "").split(BATCH_CASE_SEPARATOR);
    // The program emits a trailing separator, so a clean run yields group.length + 1 pieces.
    const caseOutputs = segments.slice(0, -1);
    if (caseOutputs.length !== group.length) {
      return null;
    }

    const comparison = request.comparison ?? { mode: "EXACT" };
    return group.map((testCase, caseIndex) => {
      // The separator is written on its own line, so every segment but the first carries the
      // newline that introduced it. Harness output is canonical single-line JSON, so trimming
      // the framing whitespace is exactly the un-framing step — not a loosening of comparison.
      const actual = caseOutputs[caseIndex].trim();
      const passed = compareOutput(comparison, testCase.output, actual, testCase.input);
      return {
        status: passed ? "ACCEPTED" : "WRONG_ANSWER",
        // Judge0 reports one figure for the whole batch; attribute it per case rather than
        // pretending we measured each one.
        runtimeMs: outcome.runtimeMs,
        memoryKb: outcome.memoryKb,
        stdout: passed ? undefined : actual,
        stderr: undefined,
      } satisfies TestExecutionOutcome;
    });
  }

  /** Pads/trims a case to exactly the parameter-line width the batch framing expects. */
  private normalizeBatchCaseInput(input: string, parameterCount: number): string {
    const lines = input.replace(/\n+$/, "").split("\n");
    while (lines.length < parameterCount) {
      lines.push("");
    }
    return lines.slice(0, parameterCount).join("\n");
  }

  private async resolveLanguageId(language: ExecutableLanguage): Promise<number> {
    const normalizedLanguage = this.validateLanguage(language);
    const runtimeLanguage = this.resolveRuntimeLanguage(normalizedLanguage);
    this.assertLanguageAllowed(normalizedLanguage);

    const fallbackId = this.getFallbackLanguageIds()[runtimeLanguage];

    try {
      const languages = await this.client.getLanguages();
      const preferredNames = this.preferredLanguageNames[runtimeLanguage];

      for (const preferredName of preferredNames) {
        const match = languages.find((candidate) => candidate.name === preferredName);
        if (match) {
          return match.id;
        }
      }

      const hintedMatch = this.findLanguageByHint(languages, runtimeLanguage);
      if (hintedMatch) {
        return hintedMatch.id;
      }

      const fallbackMatch =
        fallbackId === null ? undefined : languages.find((candidate) => candidate.id === fallbackId);
      if (fallbackMatch) {
        return fallbackMatch.id;
      }
    } catch (error) {
      const judge0Error = error as { response?: { data?: unknown } };
      logServerError("Judge0 language discovery failed", error, {
        provider: PROVIDER_NAME,
        providerResponse: judge0Error.response?.data,
      });

      if (!(error instanceof Judge0ClientError)) {
        throw error;
      }
    }

    if (fallbackId !== null) {
      return fallbackId;
    }

    throw new Error(`Judge0 does not provide a first-class mapping for "${normalizedLanguage}".`);
  }

  private assertLanguageAllowed(language: ExecutableLanguage): void {
    if (EDITOR_ONLY_BLOCKLIST.has(language as string)) {
      throw new Error(`Editor-only language "${language}" must not be executed.`);
    }
  }

  private validateLanguage(language: ExecutableLanguage): ExecutableLanguage {
    const normalizedInput = String(language).trim().toLowerCase();
    const normalized =
      normalizedInput === "golang" ? "go" : tryNormalizeSupportedLanguage(normalizedInput);

    if (!normalized) {
      throw new Error(`Unsupported language "${String(language)}".`);
    }

    if (!isExecutableLanguage(normalized)) {
      throw new Error(`Editor-only language "${normalized}" must not be executed.`);
    }

    return normalized;
  }

  private resolveRuntimeLanguage(language: ExecutableLanguage): ExecutableLanguage {
    return LANGUAGE_RUNTIME_ALIASES[language] ?? language;
  }

  private getFallbackLanguageIds(): LanguageIdMap {
    return this.client.usesApiKey() ? this.cloudFallbackLanguageIds : this.localFallbackLanguageIds;
  }

  private findLanguageByHint(
    languages: readonly Judge0Language[],
    language: ExecutableLanguage,
  ): Judge0Language | undefined {
    const hints = this.languageNameHints[language];
    if (!hints.length) {
      return undefined;
    }

    return languages.find((candidate) => {
      const normalizedName = candidate.name.trim().toLowerCase();
      return hints.some((hint) => normalizedName.includes(hint));
    });
  }

  private async executeTestCase(
    request: ExecutionRequest,
    testCase: ExecutionTestCase,
    languageId: number,
  ): Promise<TestExecutionOutcome> {
    try {
      const adjustedTimeLimitSeconds = this.resolveAdjustedTimeLimitSeconds(request.language, request.timeLimitSeconds);
      const adjustedMemoryLimitKb = this.resolveAdjustedMemoryLimitKb(request.language, request.memoryLimitMb);

      const comparison = request.comparison ?? { mode: "EXACT" };
      const delegateToJudge0 = isDelegatedComparison(comparison);

      const response = await this.client.createSubmissionAndWait({
        source_code: request.code,
        language_id: languageId,
        stdin: testCase.input,
        // EXACT: Judge0 compares against expected_output. Non-EXACT: omit it so
        // Judge0 just runs the program and returns stdout for local comparison.
        expected_output: delegateToJudge0 ? testCase.output : undefined,
        cpu_time_limit: adjustedTimeLimitSeconds,
        wall_time_limit: Math.max(adjustedTimeLimitSeconds * 2, adjustedTimeLimitSeconds + 1),
        memory_limit: adjustedMemoryLimitKb,
        enable_network: false,
        redirect_stderr_to_stdout: false,
        enable_per_process_and_thread_time_limit: false,
        enable_per_process_and_thread_memory_limit: false,
      });

      const outcome = this.normalizeJudge0Response(response);

      // For non-EXACT modes, a clean run comes back ACCEPTED (no expected_output
      // was sent); apply the local comparator to decide pass/fail. Compile/runtime/
      // TLE outcomes are preserved as-is.
      if (!delegateToJudge0 && outcome.status === "ACCEPTED") {
        const passed = compareOutput(comparison, testCase.output, outcome.stdout ?? "", testCase.input);
        return passed ? outcome : { ...outcome, status: "WRONG_ANSWER" };
      }

      return outcome;
    } catch (error) {
      const judge0Error = error as { response?: { data?: unknown } };
      logServerError("Judge0 test-case execution failed", error, {
        provider: PROVIDER_NAME,
        providerResponse: judge0Error.response?.data,
      });

      if (error instanceof Judge0ClientError) {
        return {
          status: "INTERNAL_ERROR",
          runtimeMs: 0,
          memoryKb: 0,
          stderr: EXECUTION_SERVICE_UNAVAILABLE_MESSAGE,
        };
      }

      throw error;
    }
  }

  private resolveAdjustedTimeLimitSeconds(language: ExecutableLanguage, baseTimeLimitSeconds: number): number {
    const normalizedLanguage = this.validateLanguage(language);
    const runtimeLanguage = this.resolveRuntimeLanguage(normalizedLanguage);
    const multiplier = LANGUAGE_TIME_LIMIT_MULTIPLIERS[runtimeLanguage] ?? 1;
    const adjustedTimeLimit = baseTimeLimitSeconds * multiplier;

    return Math.min(adjustedTimeLimit, MAX_CPU_TIME_LIMIT_SECONDS);
  }

  private resolveAdjustedMemoryLimitKb(language: ExecutableLanguage, baseMemoryLimitMb: number): number {
    const normalizedLanguage = this.validateLanguage(language);
    const runtimeLanguage = this.resolveRuntimeLanguage(normalizedLanguage);
    const multiplier = LANGUAGE_MEMORY_LIMIT_MULTIPLIERS[runtimeLanguage] ?? 1;
    return Math.ceil(baseMemoryLimitMb * multiplier * 1024);
  }

  private normalizeJudge0Response(response: Judge0SubmissionResponse): TestExecutionOutcome {
    const status = this.normalizeStatus(response.status.id);
    const diagnostic = this.extractDiagnostic(response);
    if (status === "INTERNAL_ERROR") {
      logServerError(
        "Judge0 returned an internal error",
        new Error(diagnostic ?? response.status.description ?? "Judge0 internal error"),
        { provider: PROVIDER_NAME, providerStatusId: response.status.id },
      );
    }
    return {
      status,
      runtimeMs: this.parseRuntimeMs(response.time),
      memoryKb: response.memory ?? 0,
      stdout: response.stdout ?? undefined,
      stderr:
        status === "INTERNAL_ERROR"
          ? EXECUTION_SERVICE_UNAVAILABLE_MESSAGE
          : diagnostic ?? undefined,
    };
  }

  private normalizeStatus(statusId: number): SubmissionStatus {
    switch (statusId) {
      case 3:
        return "ACCEPTED";
      case 4:
        return "WRONG_ANSWER";
      case 5:
        return "TIME_LIMIT_EXCEEDED";
      case 6:
        return "COMPILATION_ERROR";
      case 7:
      case 8:
      case 9:
      case 10:
      case 11:
      case 12:
      case 14:
        return "RUNTIME_ERROR";
      case 13:
        return "INTERNAL_ERROR";
      case 1:
      case 2:
      default:
        return "INTERNAL_ERROR";
    }
  }

  private parseRuntimeMs(timeInSeconds: string | null): number {
    if (!timeInSeconds) {
      return 0;
    }

    const parsed = Number(timeInSeconds);
    return Number.isFinite(parsed) ? Math.round(parsed * 1000) : 0;
  }

  private extractDiagnostic(response: Judge0SubmissionResponse): string | null {
    return response.compile_output ?? response.stderr ?? response.message;
  }

  private selectFinalStatus(results: readonly TestExecutionOutcome[]): SubmissionStatus {
    if (results.some((result) => result.status === "INTERNAL_ERROR")) {
      return "INTERNAL_ERROR";
    }

    const priority: SubmissionStatus[] = [
      "COMPILATION_ERROR",
      "RUNTIME_ERROR",
      "TIME_LIMIT_EXCEEDED",
      "WRONG_ANSWER",
      "ACCEPTED",
    ];

    for (const status of priority) {
      if (results.some((result) => result.status === status)) {
        return status;
      }
    }

    return "INTERNAL_ERROR";
  }

  private pickAggregateDiagnostic(
    results: readonly TestExecutionOutcome[],
    finalStatus: SubmissionStatus,
  ): TestExecutionOutcome | undefined {
    return (
      results.find((result) => result.status === finalStatus && (result.stderr || result.stdout)) ??
      results.find((result) => result.stderr || result.stdout)
    );
  }

  /**
   * The first case that did not pass, paired back with the input the caller sent.
   *
   * `outcomes` is index-aligned with `request.testCases` on both judging paths — the per-case
   * path pushes case 0 then each chunk in order, the batch path pushes each group in order —
   * and both stop at the first failing chunk, so the first non-ACCEPTED entry here is also the
   * first failing case overall.
   */
  private captureFailedTest(
    request: ExecutionRequest,
    outcomes: readonly TestExecutionOutcome[],
    sampleCaseCount = request.sampleCaseCount ?? 0,
  ): FailedTestCase | undefined {
    const index = outcomes.findIndex((outcome) => outcome.status !== "ACCEPTED");
    const testCase = index >= 0 ? request.testCases[index] : undefined;
    if (!testCase) {
      return undefined;
    }

    const outcome = outcomes[index];

    return {
      index,
      isHidden: index >= sampleCaseCount,
      status: outcome.status,
      input: clip(testCase.input),
      expectedOutput: clip(testCase.output),
      // A timeout or crash often produces nothing at all; an empty string is the honest answer.
      actualOutput: clip(outcome.stdout ?? ""),
    };
  }

  private buildInternalErrorResult(totalCount: number, error: unknown): ExecutionResult {
    logServerError("Judge0 execution failed", error, { provider: PROVIDER_NAME, totalCount });
    return {
      status: "INTERNAL_ERROR",
      runtimeMs: 0,
      memoryKb: 0,
      passedCount: 0,
      totalCount,
      provider: PROVIDER_NAME,
      stderr: EXECUTION_SERVICE_UNAVAILABLE_MESSAGE,
    };
  }
}
