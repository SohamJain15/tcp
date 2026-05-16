import { env } from "../../config/env";
import type {
  Department,
  Difficulty,
  EditorOnlyLanguage,
  ExecutableLanguage,
  ProblemLifecycleState,
  SubmissionStatus,
  SupportedLanguage,
} from "../types/domain";

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
export const EDITOR_ONLY_LANGUAGES: EditorOnlyLanguage[] = ["react", "html", "css"];
export const EXECUTABLE_LANGUAGES: ExecutableLanguage[] = SUPPORTED_LANGUAGES.filter(
  (language): language is ExecutableLanguage => !EDITOR_ONLY_LANGUAGES.includes(language as EditorOnlyLanguage),
);
export const PROBLEM_LIFECYCLE_STATES: ProblemLifecycleState[] = ["Draft", "Published", "Archived"];
export const DIFFICULTIES: Difficulty[] = ["Easy", "Medium", "Hard"];
export const DEPARTMENTS = [
  "B.E. Computer Engineering",
  "B.E. Information Technology",
  "B.E. Electronics & Tele-Communication",
  "B.E. Electronics and Computer Science",
  "B.E. Mechanical Engineering",
  "B.E. Civil Engineering",
  "B.E. Computer Science and Engineering (Cyber Security)",
  "B.E. Mechanical and Mechatronics Engineering (Additive Manufacturing)",
  "B.Tech – Artificial Intelligence & Machine Learning",
  "B.Tech – Artificial Intelligence & Data Science",
  "B.Tech – Internet of Things (IoT)",
  "B.Tech – Computer Science & Engineering (CSE-IOT)",
] as const satisfies readonly Department[];
export const FINAL_SUBMISSION_STATUSES: SubmissionStatus[] = [
  "ACCEPTED",
  "WRONG_ANSWER",
  "TIME_LIMIT_EXCEEDED",
  "RUNTIME_ERROR",
  "COMPILATION_ERROR",
  "INTERNAL_ERROR",
];
export const DIFFICULTY_RATING_WEIGHTS: Record<Difficulty, number> = {
  Easy: env.RATING_POINTS_EASY,
  Medium: env.RATING_POINTS_MEDIUM,
  Hard: env.RATING_POINTS_HARD,
};
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PROBLEM_TIME_LIMIT_SECONDS = env.DEFAULT_PROBLEM_TIME_LIMIT_SECONDS;
export const DEFAULT_PROBLEM_MEMORY_LIMIT_MB = env.DEFAULT_PROBLEM_MEMORY_LIMIT_MB;
