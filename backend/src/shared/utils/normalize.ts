import {
  DEPARTMENTS,
  DIFFICULTIES,
  EDITOR_ONLY_LANGUAGES,
  FINAL_SUBMISSION_STATUSES,
  PROBLEM_LIFECYCLE_STATES,
  SUPPORTED_LANGUAGES,
} from "../constants/domain";
import type {
  Department,
  Difficulty,
  EditorOnlyLanguage,
  ExecutableLanguage,
  ProblemLifecycleState,
  SubmissionStatus,
  SupportedLanguage,
} from "../types/domain";
import type { UserRole } from "../types/auth";

export function normalizeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

export function normalizeRole(value: unknown): UserRole {
  return typeof value === "string" && value.toUpperCase() === "FACULTY" ? "FACULTY" : "STUDENT";
}

export function normalizeDepartment(value: unknown): Department | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const directMatch = DEPARTMENTS.find((department) => department === trimmed);
  if (directMatch) {
    return directMatch;
  }

  const normalizedInput = trimmed.toLowerCase();
  const aliasMap: Record<string, Department> = {
    "ai&ds": "B.Tech – Artificial Intelligence & Data Science",
    comp: "B.E. Computer Engineering",
    it: "B.E. Information Technology",
    extc: "B.E. Electronics & Tele-Communication",
    ecs: "B.E. Electronics and Computer Science",
    civil: "B.E. Civil Engineering",
    mechanical: "B.E. Mechanical Engineering",
    csbs: "B.E. Computer Science and Engineering (Cyber Security)",
    "cyber security": "B.E. Computer Science and Engineering (Cyber Security)",
    amm: "B.E. Mechanical and Mechatronics Engineering (Additive Manufacturing)",
    aiml: "B.Tech – Artificial Intelligence & Machine Learning",
    iot: "B.Tech – Internet of Things (IoT)",
    "cse-iot": "B.Tech – Computer Science & Engineering (CSE-IOT)",
  };

  if (aliasMap[normalizedInput]) {
    return aliasMap[normalizedInput];
  }

  return DEPARTMENTS.find((department) => department.toLowerCase() === normalizedInput) ?? null;
}

export function normalizeDifficulty(value: unknown): Difficulty {
  if (typeof value === "string") {
    const candidate = value.trim().toLowerCase();
    if (candidate === "easy") {
      return "Easy";
    }
    if (candidate === "medium") {
      return "Medium";
    }
    if (candidate === "hard") {
      return "Hard";
    }
  }

  return DIFFICULTIES[0];
}

export function normalizeProblemLifecycleState(value: unknown): ProblemLifecycleState {
  if (typeof value === "string") {
    const candidate = value.trim().toLowerCase();
    if (candidate === "published") {
      return "Published";
    }
    if (candidate === "archived") {
      return "Archived";
    }
    if (candidate === "draft") {
      return "Draft";
    }
  }

  return PROBLEM_LIFECYCLE_STATES[0];
}

export function tryNormalizeSupportedLanguage(value: unknown): SupportedLanguage | null {
  if (typeof value === "string") {
    const candidate = value.trim().toLowerCase();
    if (candidate === "c++" || candidate === "cpp") {
      return "cpp";
    }
    if (candidate === "c#" || candidate === "csharp" || candidate === "c-sharp") {
      return "csharp";
    }
    if (candidate === "js" || candidate === "javascript") {
      return "javascript";
    }
    if (candidate === "vanilla" || candidate === "vanilla js" || candidate === "vanilla javascript") {
      return "vanilla";
    }
    if (candidate === "react" || candidate === "reactjs" || candidate === "react.js") {
      return "react";
    }
    if (candidate === "ts" || candidate === "typescript") {
      return "typescript";
    }
    if (candidate === "py" || candidate === "python") {
      return "python";
    }
    if (candidate === "go" || candidate === "golang") {
      return "go";
    }
    if (candidate === "arduino" || candidate === "auriduno") {
      return "arduino";
    }
    if (
      candidate === "assembly language 8086" ||
      candidate === "assembly8086" ||
      candidate === "assembly 8086" ||
      candidate === "8086 assembly" ||
      candidate === "8086"
    ) {
      return "assembly8086";
    }
    if (candidate === "dart" || candidate === "draft") {
      return "dart";
    }
    if (SUPPORTED_LANGUAGES.includes(candidate as SupportedLanguage)) {
      return candidate as SupportedLanguage;
    }
  }

  return null;
}

export function normalizeSupportedLanguage(value: unknown, fallback: SupportedLanguage = "cpp"): SupportedLanguage {
  return tryNormalizeSupportedLanguage(value) ?? fallback;
}

export function isEditorOnlyLanguage(language: SupportedLanguage): language is EditorOnlyLanguage {
  return EDITOR_ONLY_LANGUAGES.includes(language as EditorOnlyLanguage);
}

export function isExecutableLanguage(language: SupportedLanguage): language is ExecutableLanguage {
  return !isEditorOnlyLanguage(language);
}

export function normalizeExecutableLanguage(
  value: unknown,
  fallback: ExecutableLanguage = "cpp",
): ExecutableLanguage {
  const normalized = tryNormalizeSupportedLanguage(value);
  return normalized && isExecutableLanguage(normalized) ? normalized : fallback;
}

export function normalizeSubmissionStatus(value: unknown): SubmissionStatus {
  if (typeof value === "string") {
    const candidate = value.trim().toUpperCase();
    if (candidate === "ACCEPTED") {
      return "ACCEPTED";
    }
    if (candidate === "WRONG_ANSWER" || candidate === "WRONG ANSWER") {
      return "WRONG_ANSWER";
    }
    if (candidate === "TIME_LIMIT_EXCEEDED" || candidate === "TLE") {
      return "TIME_LIMIT_EXCEEDED";
    }
    if (candidate === "RUNTIME_ERROR") {
      return "RUNTIME_ERROR";
    }
    if (candidate === "COMPILATION_ERROR") {
      return "COMPILATION_ERROR";
    }
    if (candidate === "RUNNING") {
      return "RUNNING";
    }
    if (candidate === "INTERNAL_ERROR") {
      return "INTERNAL_ERROR";
    }
    if (candidate === "QUEUED") {
      return "QUEUED";
    }
  }

  return "QUEUED";
}

export function isFinalSubmissionStatus(status: SubmissionStatus): boolean {
  return FINAL_SUBMISSION_STATUSES.includes(status);
}
