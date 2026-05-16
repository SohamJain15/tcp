import type { ExecutableLanguage, SubmissionStatus } from "../shared/types/domain";
import { isExecutableLanguage, tryNormalizeSupportedLanguage } from "../shared/utils/normalize";
import type { ExecutionProvider, ExecutionRequest, ExecutionResult, ExecutionTestCase } from "./execution-provider";
import {
  Judge0Client,
  Judge0ClientError,
  type Judge0Language,
  type Judge0SubmissionResponse,
} from "./judge0-client";

const PROVIDER_NAME = "judge0";
const SUBMISSION_CHUNK_SIZE = 5;
const MAX_CPU_TIME_LIMIT_SECONDS = 5;

const EDITOR_ONLY_BLOCKLIST = new Set(["react", "html", "css"]);

type LanguageIdMap = Record<ExecutableLanguage, number | null>;

interface TestExecutionOutcome {
  status: SubmissionStatus;
  runtimeMs: number;
  memoryKb: number;
  stdout?: string;
  stderr?: string;
}

const LANGUAGE_RUNTIME_ALIASES: Partial<Record<ExecutableLanguage, ExecutableLanguage>> = {
  arduino: "cpp",
  vanilla: "javascript",
};

const LANGUAGE_TIME_LIMIT_MULTIPLIERS: Partial<Record<ExecutableLanguage, number>> = {
  python: 3,
  java: 1.5,
  c: 1,
  cpp: 1,
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
        return this.buildInternalErrorResult(0, "No sample test case configured.");
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
      };
    } catch (error) {
      const judge0Error = error as { response?: { data?: unknown }; message?: string };
      console.error("JUDGE0_SYSTEM_ERROR:", judge0Error.response?.data || judge0Error.message);
      return this.buildInternalErrorResult(
        request.testCases.length > 0 ? 1 : 0,
        error instanceof Error ? error.message : "Judge0 run execution failed.",
      );
    }
  }

  async executeSubmission(request: ExecutionRequest): Promise<ExecutionResult> {
    try {
      if (request.testCases.length === 0) {
        return this.buildInternalErrorResult(0, "No test cases configured.");
      }

      const languageId = await this.resolveLanguageId(request.language);
      const preflightResult = await this.executeTestCase(
        request,
        {
          input: "",
          output: "",
        },
        languageId,
      );

      if (preflightResult.status === "COMPILATION_ERROR") {
        return {
          status: preflightResult.status,
          runtimeMs: preflightResult.runtimeMs,
          memoryKb: preflightResult.memoryKb,
          passedCount: 0,
          totalCount: 0,
          provider: PROVIDER_NAME,
          stdout: preflightResult.stdout,
          stderr: preflightResult.stderr,
        };
      }

      const results: TestExecutionOutcome[] = [];

      for (let index = 0; index < request.testCases.length; index += SUBMISSION_CHUNK_SIZE) {
        const testCaseChunk = request.testCases.slice(index, index + SUBMISSION_CHUNK_SIZE);
        const chunkResults = await Promise.all(
          testCaseChunk.map((testCase) => this.executeTestCase(request, testCase, languageId)),
        );
        results.push(...chunkResults);

        if (chunkResults.some((result) => result.status !== "ACCEPTED")) {
          break;
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
      };
    } catch (error) {
      const judge0Error = error as { response?: { data?: unknown }; message?: string };
      console.error("JUDGE0_SYSTEM_ERROR:", judge0Error.response?.data || judge0Error.message);
      return this.buildInternalErrorResult(
        request.testCases.length,
        error instanceof Error ? error.message : "Judge0 submission execution failed.",
      );
    }
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
      const judge0Error = error as { response?: { data?: unknown }; message?: string };
      console.error("JUDGE0_SYSTEM_ERROR:", judge0Error.response?.data || judge0Error.message);

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

      const response = await this.client.createSubmissionAndWait({
        source_code: request.code,
        language_id: languageId,
        stdin: testCase.input,
        expected_output: testCase.output,
        cpu_time_limit: adjustedTimeLimitSeconds,
        wall_time_limit: Math.max(adjustedTimeLimitSeconds * 2, adjustedTimeLimitSeconds + 1),
        memory_limit: request.memoryLimitMb * 1024,
        enable_network: false,
        redirect_stderr_to_stdout: false,
        enable_per_process_and_thread_time_limit: false,
        enable_per_process_and_thread_memory_limit: false,
      });

      return this.normalizeJudge0Response(response);
    } catch (error) {
      const judge0Error = error as { response?: { data?: unknown }; message?: string };
      console.error("JUDGE0_SYSTEM_ERROR:", judge0Error.response?.data || judge0Error.message);

      if (error instanceof Judge0ClientError) {
        return {
          status: "INTERNAL_ERROR",
          runtimeMs: 0,
          memoryKb: 0,
          stderr: error.message,
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

  private normalizeJudge0Response(response: Judge0SubmissionResponse): TestExecutionOutcome {
    return {
      status: this.normalizeStatus(response.status.id),
      runtimeMs: this.parseRuntimeMs(response.time),
      memoryKb: response.memory ?? 0,
      stdout: response.stdout ?? undefined,
      stderr: this.extractDiagnostic(response) ?? undefined,
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

  private buildInternalErrorResult(totalCount: number, stderr: string): ExecutionResult {
    return {
      status: "INTERNAL_ERROR",
      runtimeMs: 0,
      memoryKb: 0,
      passedCount: 0,
      totalCount,
      provider: PROVIDER_NAME,
      stderr,
    };
  }
}
