import type { UserRole } from "../../shared/types/auth";
import type {
  Department,
  Difficulty,
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
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
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
  createdAt: Date;
  updatedAt: Date;
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
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
  timeLimitSeconds: number;
  memoryLimitMb: number;
  targetDepartment: Department | null;
  createdBy: string;
  createdByRole: UserRole;
  sampleTestCases: ProblemTestCase[];
  hiddenTestCases: ProblemTestCase[];
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
  };
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
    statement: problem.statement,
    inputFormat: problem.inputFormat,
    outputFormat: problem.outputFormat,
    constraints: problem.constraints,
    timeLimitSeconds: problem.timeLimitSeconds,
    memoryLimitMb: problem.memoryLimitMb,
    targetDepartment: problem.targetDepartment,
    createdBy: problem.createdBy,
    createdByRole: problem.createdByRole,
    sampleTestCases: problem.sampleTestCases,
    hiddenTestCases: problem.hiddenTestCases,
    createdAt: toIsoString(problem.createdAt) ?? new Date(0).toISOString(),
  };
}
