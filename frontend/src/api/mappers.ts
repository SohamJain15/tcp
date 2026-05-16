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

export const EXECUTABLE_LANGUAGES: ExecutableLanguage[] = SUPPORTED_LANGUAGES.filter(
  (language): language is ExecutableLanguage => !EXECUTION_EDITOR_ONLY_LANGUAGES.includes(language),
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

export function toLanguageLabel(language: SupportedLanguage): string {
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

export function toEditorDataFromStudentProblem(problem: StudentProblemDetail): ProblemEditorData {
  return {
    title: problem.title,
    difficulty: problem.difficulty,
    tags: problem.tags,
    statement: problem.statement,
    inputFormat: problem.inputFormat,
    outputFormat: problem.outputFormat,
    constraints: problem.constraints,
    timeLimitSeconds: problem.timeLimitSeconds,
    memoryLimitMb: problem.memoryLimitMb,
    sampleTestCases: problem.sampleTestCases,
    hiddenTestCases: [],
    targetDepartment: problem.targetDepartment ?? null,
  };
}

export function toEditorDataFromManageProblem(problem: ManageProblemDetail): ProblemEditorData {
  return {
    title: problem.title,
    difficulty: problem.difficulty,
    tags: problem.tags,
    statement: problem.statement,
    inputFormat: problem.inputFormat,
    outputFormat: problem.outputFormat,
    constraints: problem.constraints,
    timeLimitSeconds: problem.timeLimitSeconds,
    memoryLimitMb: problem.memoryLimitMb,
    sampleTestCases: problem.sampleTestCases,
    hiddenTestCases: problem.hiddenTestCases,
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
  return {
    title: data.title.trim(),
    statement: data.statement.trim(),
    inputFormat: data.inputFormat.trim(),
    outputFormat: data.outputFormat.trim(),
    constraints: data.constraints.map((constraint) => constraint.trim()).filter(Boolean),
    difficulty: data.difficulty as Difficulty,
    tags: data.tags.map((tag) => tag.trim()).filter(Boolean),
    timeLimitSeconds: Number(data.timeLimitSeconds),
    memoryLimitMb: Number(data.memoryLimitMb),
    lifecycleState,
    targetDepartment: data.targetDepartment ?? null,
    sampleTestCases: cleanTestCases(data.sampleTestCases),
    hiddenTestCases: cleanTestCases(data.hiddenTestCases),
  };
}

export function toProblemUpdatePayload(data: ProblemEditorData): ProblemUpdatePayload {
  return {
    title: data.title.trim(),
    statement: data.statement.trim(),
    inputFormat: data.inputFormat.trim(),
    outputFormat: data.outputFormat.trim(),
    constraints: data.constraints.map((constraint) => constraint.trim()).filter(Boolean),
    difficulty: data.difficulty,
    tags: data.tags.map((tag) => tag.trim()).filter(Boolean),
    timeLimitSeconds: Number(data.timeLimitSeconds),
    memoryLimitMb: Number(data.memoryLimitMb),
    targetDepartment: data.targetDepartment ?? null,
    sampleTestCases: cleanTestCases(data.sampleTestCases),
    hiddenTestCases: cleanTestCases(data.hiddenTestCases),
  };
}
