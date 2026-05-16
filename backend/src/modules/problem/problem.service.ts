import { randomUUID } from "node:crypto";
import { AppError } from "../../shared/errors/app-error";
import { paginateArray, type PaginatedResult, type PaginationInput } from "../../shared/utils/pagination";
import type { AuthenticatedUser } from "../../shared/types/auth";
import type {
  Department,
  Difficulty,
  ProblemLifecycleState,
  StudentProblemStatus,
} from "../../shared/types/domain";
import type { SubmissionRecord } from "../submission/submission.model";
import type { SubmissionRepository } from "../submission/submission.repository";
import {
  toManageProblemDetail,
  toManageProblemSummary,
  toStudentProblemDetail,
  toStudentProblemSummary,
  type ManageProblemDetailResponse,
  type ManageProblemSummaryResponse,
  type ProblemRecord,
  type StudentProblemDetailResponse,
  type StudentProblemSummaryResponse,
} from "./problem.model";
import type { ProblemRepository } from "./problem.repository";
import type { CanonicalProblemPayload, CanonicalProblemUpdatePayload } from "./problem.validator";

export interface ProblemService {
  listStudentProblems(
    user: AuthenticatedUser,
    query: StudentProblemQuery,
  ): Promise<PaginatedResult<StudentProblemSummaryResponse>>;
  getStudentProblemDetail(user: AuthenticatedUser, problemId: string): Promise<StudentProblemDetailResponse>;
  listManageProblems(user: AuthenticatedUser, query: ManageProblemQuery): Promise<PaginatedResult<ManageProblemSummaryResponse>>;
  getManageProblemDetail(user: AuthenticatedUser, problemId: string): Promise<ManageProblemDetailResponse>;
  createProblem(user: AuthenticatedUser, payload: CanonicalProblemPayload): Promise<ManageProblemDetailResponse>;
  updateProblem(user: AuthenticatedUser, problemId: string, payload: CanonicalProblemUpdatePayload): Promise<ManageProblemDetailResponse>;
  updateProblemState(user: AuthenticatedUser, problemId: string, lifecycleState: ProblemLifecycleState): Promise<ManageProblemDetailResponse>;
}

interface ProblemServiceDependencies {
  problemRepository: ProblemRepository;
  submissionRepository: SubmissionRepository;
  now: () => Date;
}

export interface StudentProblemQuery extends PaginationInput {
  search?: string;
  difficulty?: Difficulty;
  tag?: string;
}

export interface ManageProblemQuery extends StudentProblemQuery {
  lifecycleState?: ProblemLifecycleState;
  targetDepartment?: Department;
}

function matchesSearch(problem: ProblemRecord, search?: string): boolean {
  if (!search) {
    return true;
  }

  const normalized = search.trim().toLowerCase();
  return (
    problem.title.toLowerCase().includes(normalized) ||
    problem.tags.some((tag) => tag.toLowerCase().includes(normalized))
  );
}

function getStudentProblemStatus(submissions: SubmissionRecord[], problemId: string): StudentProblemStatus {
  const problemSubmissions = submissions.filter((submission) => submission.problemId === problemId);

  if (problemSubmissions.some((submission) => submission.status === "ACCEPTED")) {
    return "solved";
  }

  if (problemSubmissions.length > 0) {
    return "attempted";
  }

  return "todo";
}

function sortProblemsForStudents(left: ProblemRecord, right: ProblemRecord): number {
  return left.title.localeCompare(right.title);
}

function sortProblemsForFaculty(left: ProblemRecord, right: ProblemRecord): number {
  return right.updatedAt.getTime() - left.updatedAt.getTime() || left.title.localeCompare(right.title);
}

function canStudentAccessProblem(user: AuthenticatedUser, problem: ProblemRecord): boolean {
  return !problem.targetDepartment || problem.targetDepartment === user.department;
}

function ensureFacultyOwnsProblem(user: AuthenticatedUser, problem: ProblemRecord | null): ProblemRecord {
  if (!problem) {
    throw new AppError(404, "Problem not found");
  }

  if (problem.createdBy !== user.email) {
    throw new AppError(404, "Problem not found");
  }

  return problem;
}

export function createProblemService(dependencies: ProblemServiceDependencies): ProblemService {
  return {
    async listStudentProblems(user, query) {
      const [problems, submissions] = await Promise.all([
        dependencies.problemRepository.list(),
        dependencies.submissionRepository.list({ userEmail: user.email }),
      ]);

      const filtered = problems
        .filter((problem) => problem.lifecycleState === "Published")
        .filter((problem) => canStudentAccessProblem(user, problem))
        .filter((problem) => (query.difficulty ? problem.difficulty === query.difficulty : true))
        .filter((problem) => (query.tag ? problem.tags.includes(query.tag) : true))
        .filter((problem) => matchesSearch(problem, query.search))
        .sort(sortProblemsForStudents)
        .map((problem) => toStudentProblemSummary(problem, getStudentProblemStatus(submissions, problem.id)));

      return paginateArray(filtered, query);
    },

    async getStudentProblemDetail(user, problemId) {
      const [problem, submissions] = await Promise.all([
        dependencies.problemRepository.getById(problemId),
        dependencies.submissionRepository.list({ userEmail: user.email }),
      ]);

      if (!problem || problem.lifecycleState !== "Published" || !canStudentAccessProblem(user, problem)) {
        throw new AppError(404, "Problem not found");
      }

      return toStudentProblemDetail(problem, getStudentProblemStatus(submissions, problem.id));
    },

    async listManageProblems(user, query) {
      const problems = (await dependencies.problemRepository.list())
        .filter((problem) => problem.createdBy === user.email)
        .filter((problem) => (!query.lifecycleState ? true : problem.lifecycleState === query.lifecycleState))
        .filter((problem) => (query.difficulty ? problem.difficulty === query.difficulty : true))
        .filter((problem) => (query.tag ? problem.tags.includes(query.tag) : true))
        .filter((problem) => (query.targetDepartment !== undefined ? problem.targetDepartment === query.targetDepartment : true))
        .filter((problem) => matchesSearch(problem, query.search))
        .sort(sortProblemsForFaculty)
        .map(toManageProblemSummary);

      return paginateArray(problems, query);
    },

    async getManageProblemDetail(user, problemId) {
      const problem = ensureFacultyOwnsProblem(user, await dependencies.problemRepository.getById(problemId));

      return toManageProblemDetail(problem);
    },

    async createProblem(user, payload) {
      const now = dependencies.now();
      const problem: ProblemRecord = {
        id: `problem_${randomUUID()}`,
        title: payload.title,
        statement: payload.statement,
        inputFormat: payload.inputFormat,
        outputFormat: payload.outputFormat,
        constraints: payload.constraints,
        difficulty: payload.difficulty,
        tags: payload.tags,
        timeLimitSeconds: payload.timeLimitSeconds,
        memoryLimitMb: payload.memoryLimitMb,
        lifecycleState: payload.lifecycleState,
        targetDepartment: payload.targetDepartment,
        createdBy: user.email,
        createdByRole: user.role,
        totalSubmissions: 0,
        acceptedSubmissions: 0,
        acceptanceRate: 0,
        sampleTestCases: payload.sampleTestCases,
        hiddenTestCases: payload.hiddenTestCases,
        createdAt: now,
        updatedAt: now,
      };

      await dependencies.problemRepository.save(problem);
      return toManageProblemDetail(problem);
    },

    async updateProblem(user, problemId, payload) {
      const existingProblem = ensureFacultyOwnsProblem(user, await dependencies.problemRepository.getById(problemId));

      const updatedProblem: ProblemRecord = {
        ...existingProblem,
        ...payload,
        updatedAt: dependencies.now(),
      };

      await dependencies.problemRepository.save(updatedProblem);
      return toManageProblemDetail(updatedProblem);
    },

    async updateProblemState(user, problemId, lifecycleState) {
      const existingProblem = ensureFacultyOwnsProblem(user, await dependencies.problemRepository.getById(problemId));

      const updatedProblem: ProblemRecord = {
        ...existingProblem,
        lifecycleState,
        updatedAt: dependencies.now(),
      };

      await dependencies.problemRepository.save(updatedProblem);
      return toManageProblemDetail(updatedProblem);
    },
  };
}
