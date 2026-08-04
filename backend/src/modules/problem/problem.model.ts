import { generateStarterCode } from "../../execution/harness";
import type { HarnessSpec } from "../../execution/harness/contract";
import { EXECUTABLE_LANGUAGES } from "../../shared/constants/domain";
import type { UserRole } from "../../shared/types/auth";
import type {
  Department,
  Difficulty,
  ExecutableLanguage,
  ProblemLifecycleState,
  StudentProblemStatus,
} from "../../shared/types/domain";
import { toIsoString } from "../../shared/utils/date";

export interface ProblemTestCase {
  input: string;
  output: string;
  explanation?: string;
}

export interface ProblemRecord {
  id: string;
  title: string;
  slug?: string;
  statement: string;
  topic?: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
  explanation?: string;
  difficulty: Difficulty;
  tags: string[];
  timeLimitSeconds: number;
  memoryLimitMb: number;
  lifecycleState: ProblemLifecycleState;
  targetDepartment: Department | null;
  createdBy: string;
  createdByRole: UserRole;
  totalSubmissions: number;
  acceptedSubmissions: number;
  acceptanceRate: number;
  sampleTestCases: ProblemTestCase[];
  hiddenTestCases: ProblemTestCase[];
  /**
   * Optional metadata-driven judging contract. When present, submissions are
   * wrapped by the harness framework (typed args, canonical JSON I/O). When
   * absent, the problem uses legacy raw-stdin judging.
   */
  harness?: HarnessSpec;
  /**
   * Cached AI-generated hints, in reveal order. Empty until generated.
   *
   * Cached on the problem rather than generated per request so every student sees the same three
   * hints, faculty can review and correct them, and revealing a hint costs a database read
   * instead of a multi-second model call.
   */
  hints: ProblemHint[];
  /**
   * Set while a generation is in flight, so two students opening the hints panel at the same
   * moment do not both drive the model. Reclaimed after `AI_STALE_LOCK_MS`, so a crash
   * mid-generation cannot wedge a problem's hints forever.
   */
  hintsLockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProblemHint {
  /** 1-based position in the reveal sequence. */
  order: number;
  text: string;
  generatedAt: Date | null;
  /** Model that produced it, or null once a human has rewritten it. */
  model: string | null;
  promptVersion: string | null;
  /** Email of the faculty member who last edited the text, if any. */
  editedBy: string | null;
}

export interface StudentProblemSummaryResponse {
  id: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  userStatus: StudentProblemStatus;
  submissions: number;
  totalSubmissions: number;
  acceptance: number;
  acceptanceRate: number;
  timeLimit: string;
  timeLimitSeconds: number;
  memoryLimit: string;
  memoryLimitMb: number;
  targetDepartment: Department | null;
}

export interface StudentProblemDetailResponse extends StudentProblemSummaryResponse {
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
  examples: Array<ProblemTestCase & { hidden: false }>;
  sampleTestCases: ProblemTestCase[];
  /**
   * Per-language starter code derived from the harness signature (only present for
   * metadata-driven problems). The editor should prefer this over any hardcoded
   * template so students see the correct function skeleton (right method name and
   * typed parameters, no Main / stdin plumbing).
   */
  starterCode?: Partial<Record<ExecutableLanguage, string>>;
  /** Whether this problem uses the metadata-driven harness. */
  harnessEnabled?: boolean;
}

export interface ManageProblemSummaryResponse {
  id: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  lifecycleState: ProblemLifecycleState;
  totalSubmissions: number;
  acceptanceRate: number;
  updatedAt: string;
}

export interface ManageProblemDetailResponse extends ManageProblemSummaryResponse {
  slug: string;
  statement: string;
  topic: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
  explanation: string;
  timeLimitSeconds: number;
  memoryLimitMb: number;
  targetDepartment: Department | null;
  createdBy: string;
  createdByRole: UserRole;
  sampleTestCases: ProblemTestCase[];
  hiddenTestCases: ProblemTestCase[];
  harness?: HarnessSpec;
  createdAt: string;
}

export function toStudentProblemSummary(
  problem: ProblemRecord,
  userStatus: StudentProblemStatus,
): StudentProblemSummaryResponse {
  return {
    id: problem.id,
    title: problem.title,
    difficulty: problem.difficulty,
    tags: problem.tags,
    userStatus,
    submissions: problem.totalSubmissions,
    totalSubmissions: problem.totalSubmissions,
    acceptance: problem.acceptanceRate,
    acceptanceRate: problem.acceptanceRate,
    timeLimit: String(problem.timeLimitSeconds),
    timeLimitSeconds: problem.timeLimitSeconds,
    memoryLimit: String(problem.memoryLimitMb),
    memoryLimitMb: problem.memoryLimitMb,
    targetDepartment: problem.targetDepartment,
  };
}

export function toStudentProblemDetail(
  problem: ProblemRecord,
  userStatus: StudentProblemStatus,
): StudentProblemDetailResponse {
  return {
    ...toStudentProblemSummary(problem, userStatus),
    statement: problem.statement,
    inputFormat: problem.inputFormat,
    outputFormat: problem.outputFormat,
    constraints: problem.constraints,
    examples: problem.sampleTestCases.map((testCase) => ({
      ...testCase,
      hidden: false as const,
    })),
    sampleTestCases: problem.sampleTestCases,
    ...(problem.harness
      ? { harnessEnabled: true, starterCode: buildStarterCode(problem.harness) }
      : {}),
  };
}

/**
 * Generate starter code for every language whose adapter can express this
 * signature. Languages that cannot represent a declared type (e.g. Rust has no
 * TreeNode, C has no List return) throw during generation and are simply skipped —
 * never let that fail the whole problem-detail response.
 */
function buildStarterCode(harness: HarnessSpec): Partial<Record<ExecutableLanguage, string>> {
  const out: Partial<Record<ExecutableLanguage, string>> = {};
  for (const language of EXECUTABLE_LANGUAGES) {
    try {
      const starter = generateStarterCode(language, harness);
      if (starter) {
        out[language] = starter;
      }
    } catch {
      // This language can't represent the signature; omit its starter.
    }
  }
  return out;
}

export function toManageProblemSummary(problem: ProblemRecord): ManageProblemSummaryResponse {
  return {
    id: problem.id,
    title: problem.title,
    difficulty: problem.difficulty,
    tags: problem.tags,
    lifecycleState: problem.lifecycleState,
    totalSubmissions: problem.totalSubmissions,
    acceptanceRate: problem.acceptanceRate,
    updatedAt: toIsoString(problem.updatedAt) ?? new Date(0).toISOString(),
  };
}

export function toManageProblemDetail(problem: ProblemRecord): ManageProblemDetailResponse {
  return {
    ...toManageProblemSummary(problem),
    slug: problem.slug ?? problem.id,
    statement: problem.statement,
    topic: problem.topic ?? "",
    inputFormat: problem.inputFormat,
    outputFormat: problem.outputFormat,
    constraints: problem.constraints,
    explanation: problem.explanation ?? "",
    timeLimitSeconds: problem.timeLimitSeconds,
    memoryLimitMb: problem.memoryLimitMb,
    targetDepartment: problem.targetDepartment,
    createdBy: problem.createdBy,
    createdByRole: problem.createdByRole,
    sampleTestCases: problem.sampleTestCases,
    hiddenTestCases: problem.hiddenTestCases,
    harness: problem.harness,
    createdAt: toIsoString(problem.createdAt) ?? new Date(0).toISOString(),
  };
}
