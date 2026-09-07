import type {
  Difficulty,
  ExecutableLanguage,
  ManageProblemDetail,
  ProblemEditorData,
  ProblemLifecycleState,
  ProblemTestCase,
  ProblemUpdatePayload,
  ProblemWritePayload,
  StudentProblemDetail,
  SubmissionStatus,
  SubmissionLanguage,
  SupportedLanguage,
} from "@/api/types";

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  "c",
  "cpp",
  "java",
  "javascript",
  "python",
  "ruby",
  "arduino",
  "go",
  "rust",
  "csharp",
  "php",
  "vanilla",
  "react",
  "typescript",
  "html",
  "css",
  "assembly8086",
  "kotlin",
  "swift",
  "dart",
  "scala",
  "elixir",
  "erlang",
  "racket",
];

export const EDITOR_ONLY_LANGUAGES: SupportedLanguage[] = ["vanilla", "react", "html", "css"];
export const EXECUTION_EDITOR_ONLY_LANGUAGES: SupportedLanguage[] = ["react", "html", "css"];

// Languages our Judge0 compiler cannot actually run — hidden from the code editor
// dropdowns. They stay in SUPPORTED_LANGUAGES so historical submissions still label
// correctly, but are never offered as new choices.
export const UNSUPPORTED_EXECUTION_LANGUAGES: SupportedLanguage[] = ["arduino", "assembly8086"];

export const EXECUTABLE_LANGUAGES: ExecutableLanguage[] = SUPPORTED_LANGUAGES.filter(
  (language): language is ExecutableLanguage =>
    !EXECUTION_EDITOR_ONLY_LANGUAGES.includes(language) &&
    !UNSUPPORTED_EXECUTION_LANGUAGES.includes(language),
);

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  c: "C",
  cpp: "C++",
  java: "Java",
  javascript: "JavaScript",
  python: "Python",
  ruby: "Ruby",
  arduino: "Arduino",
  go: "Go",
  rust: "Rust",
  csharp: "C#",
  php: "PHP",
  vanilla: "Vanilla JS",
  react: "React",
  typescript: "TypeScript",
  html: "HTML",
  css: "CSS",
  assembly8086: "Assembly 8086",
  kotlin: "Kotlin",
  swift: "Swift",
  dart: "Dart",
  scala: "Scala",
  elixir: "Elixir",
  erlang: "Erlang",
  racket: "Racket",
};

const LANGUAGE_ALIASES: Record<string, SupportedLanguage> = {
  "c++": "cpp",
  cpp: "cpp",
  c: "c",
  java: "java",
  js: "javascript",
  javascript: "javascript",
  py: "python",
  python: "python",
  golang: "go",
  go: "go",
  "c#": "csharp",
  csharp: "csharp",
  "c-sharp": "csharp",
  arduino: "arduino",
  auriduno: "arduino",
  draft: "dart",
  dart: "dart",
  "react.js": "react",
  reactjs: "react",
  react: "react",
  ts: "typescript",
  typescript: "typescript",
  html: "html",
  css: "css",
  php: "php",
  ruby: "ruby",
  kotlin: "kotlin",
  swift: "swift",
  scala: "scala",
  elixir: "elixir",
  erlang: "erlang",
  racket: "racket",
  "assembly language 8086": "assembly8086",
  assembly8086: "assembly8086",
  "assembly 8086": "assembly8086",
  "8086 assembly": "assembly8086",
  "8086": "assembly8086",
};

/**
 * Accepts `SubmissionLanguage`, not just `SupportedLanguage`: submissions can be written in SQL,
 * which is deliberately outside the Judge0 language union but still has to be labelled in every
 * submission list, dashboard and profile.
 */
export function toLanguageLabel(language: SubmissionLanguage | SupportedLanguage): string {
  if (language === "sql") {
    return "SQL";
  }
  return LANGUAGE_LABELS[language] ?? language;
}

export function normalizeLanguage(value: string): SupportedLanguage | null {
  const key = value.trim().toLowerCase();
  return LANGUAGE_ALIASES[key] ?? null;
}

export function toStatusLabel(status: SubmissionStatus): string {
  const map: Record<SubmissionStatus, string> = {
    QUEUED: "Queued",
    RUNNING: "Running",
    ACCEPTED: "Accepted",
    WRONG_ANSWER: "Wrong Answer",
    TIME_LIMIT_EXCEEDED: "Time Limit Exceeded",
    RUNTIME_ERROR: "Runtime Error",
    COMPILATION_ERROR: "Compilation Error",
    INTERNAL_ERROR: "Internal Error",
  };

  return map[status] ?? status;
}

export function toLifecycleLabel(state: ProblemLifecycleState): string {
  return state;
}

function safeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function safeTestCaseArray(value: unknown): ProblemTestCase[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((testCase) => {
      if (!testCase || typeof testCase !== "object") {
        return null;
      }

      const record = testCase as { input?: unknown; output?: unknown; explanation?: unknown };
      if (typeof record.input !== "string" || typeof record.output !== "string") {
        return null;
      }

      return {
        input: record.input,
        output: record.output,
        ...(typeof record.explanation === "string" ? { explanation: record.explanation } : {}),
      };
    })
    .filter((testCase): testCase is ProblemTestCase => Boolean(testCase));
}

export function toEditorDataFromStudentProblem(problem: StudentProblemDetail): ProblemEditorData {
  return {
    kind: problem.kind ?? "coding",
    title: problem.title ?? "",
    slug: "",
    difficulty: problem.difficulty,
    topic: "",
    tags: safeStringArray(problem.tags),
    statement: problem.statement ?? "",
    inputFormat: problem.inputFormat ?? "",
    outputFormat: problem.outputFormat ?? "",
    constraints: safeStringArray(problem.constraints),
    explanation: "",
    timeLimitSeconds: Number(problem.timeLimitSeconds) || 1,
    memoryLimitMb: Number(problem.memoryLimitMb) || 256,
    sampleTestCases: safeTestCaseArray(problem.sampleTestCases),
    hiddenTestCases: [],
    targetDepartment: problem.targetDepartment ?? null,
  };
}

export function toEditorDataFromManageProblem(problem: ManageProblemDetail): ProblemEditorData {
  return {
    kind: problem.kind ?? "coding",
    // Carried through so editing a SQL problem keeps its schema instead of blanking it.
    sql: problem.sql,
    title: problem.title ?? "",
    slug: problem.slug ?? "",
    difficulty: problem.difficulty,
    topic: problem.topic ?? "",
    tags: safeStringArray(problem.tags),
    statement: problem.statement ?? "",
    inputFormat: problem.inputFormat ?? "",
    outputFormat: problem.outputFormat ?? "",
    constraints: safeStringArray(problem.constraints),
    explanation: problem.explanation ?? "",
    timeLimitSeconds: Number(problem.timeLimitSeconds) || 1,
    memoryLimitMb: Number(problem.memoryLimitMb) || 256,
    sampleTestCases: safeTestCaseArray(problem.sampleTestCases),
    hiddenTestCases: safeTestCaseArray(problem.hiddenTestCases),
    targetDepartment: problem.targetDepartment ?? null,
    lifecycleState: problem.lifecycleState,
  };
}

function cleanTestCases(testCases: ProblemTestCase[]): ProblemTestCase[] {
  return testCases
    .map((testCase) => ({
      input: testCase.input.trim(),
      output: testCase.output,
      ...(testCase.explanation ? { explanation: testCase.explanation } : {}),
    }))
    .filter((testCase) => testCase.input.length > 0);
}

export function toProblemWritePayload(
  data: ProblemEditorData,
  lifecycleState: ProblemLifecycleState,
): ProblemWritePayload {
  const isSql = data.kind === "sql";
  return {
    kind: data.kind,
    // The server rejects a coding problem carrying `sql`, and a SQL problem carries no test cases —
    // the two halves are mutually exclusive, so send exactly one of them.
    ...(isSql && data.sql
      ? {
          sql: {
            schemaSql: data.sql.schemaSql.trim(),
            solutionSql: data.sql.solutionSql.trim(),
            ordered: data.sql.ordered,
          },
        }
      : {}),
    title: data.title.trim(),
    slug: data.slug.trim() || data.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    statement: data.statement.trim(),
    topic: data.topic.trim(),
    inputFormat: data.inputFormat.trim(),
    outputFormat: data.outputFormat.trim(),
    constraints: data.constraints.map((constraint) => constraint.trim()).filter(Boolean),
    explanation: data.explanation.trim(),
    difficulty: data.difficulty as Difficulty,
    tags: data.tags.map((tag) => tag.trim()).filter(Boolean),
    timeLimitSeconds: Number(data.timeLimitSeconds),
    memoryLimitMb: Number(data.memoryLimitMb),
    lifecycleState,
    targetDepartment: data.targetDepartment ?? null,
    sampleTestCases: isSql ? [] : cleanTestCases(data.sampleTestCases),
    hiddenTestCases: isSql ? [] : cleanTestCases(data.hiddenTestCases),
  };
}

export function toProblemUpdatePayload(data: ProblemEditorData): ProblemUpdatePayload {
  const isSql = data.kind === "sql";
  return {
    kind: data.kind,
    ...(isSql && data.sql
      ? {
          sql: {
            schemaSql: data.sql.schemaSql.trim(),
            solutionSql: data.sql.solutionSql.trim(),
            ordered: data.sql.ordered,
          },
        }
      : {}),
    title: data.title.trim(),
    slug: data.slug.trim() || data.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    statement: data.statement.trim(),
    topic: data.topic.trim(),
    inputFormat: data.inputFormat.trim(),
    outputFormat: data.outputFormat.trim(),
    constraints: data.constraints.map((constraint) => constraint.trim()).filter(Boolean),
    explanation: data.explanation.trim(),
    difficulty: data.difficulty,
    tags: data.tags.map((tag) => tag.trim()).filter(Boolean),
    timeLimitSeconds: Number(data.timeLimitSeconds),
    memoryLimitMb: Number(data.memoryLimitMb),
    targetDepartment: data.targetDepartment ?? null,
    sampleTestCases: isSql ? [] : cleanTestCases(data.sampleTestCases),
    hiddenTestCases: isSql ? [] : cleanTestCases(data.hiddenTestCases),
  };
}
