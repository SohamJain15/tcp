import { randomUUID } from "node:crypto";
import { env } from "../../config/env";
import { inferHarness } from "../../execution/harness/inference/infer-harness";
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
import type { UserRepository } from "../user/user.repository";
import { buildProblemLeaderboard, type ProblemLeaderboardItem } from "./problem-leaderboard.model";
import {
  toManageProblemDetail,
  toManageProblemSummary,
  toStudentProblemDetail,
  toStudentProblemSummary,
  type ManageProblemDetailResponse,
  type ManageProblemSummaryResponse,
  type ProblemHint,
  type ProblemRecord,
  type StudentProblemDetailResponse,
  type StudentProblemSummaryResponse,
} from "./problem.model";
import {
  buildGeneratedHints,
  toFacultyHintViews,
  toProblemHintsResponse,
  type FacultyHintView,
  type ProblemHintsResponse,
} from "./problem-hints.model";
import type { HintGenerator } from "./ai/hint-generator";
import type { HintRevealRepository } from "./hint-reveal.repository";
import type { ProblemRepository } from "./problem.repository";
import type { CanonicalProblemPayload, CanonicalProblemUpdatePayload } from "./problem.validator";

export interface ProblemService {
  listStudentProblems(
    user: AuthenticatedUser,
    query: StudentProblemQuery,
  ): Promise<PaginatedResult<StudentProblemSummaryResponse>>;
  getStudentProblemDetail(user: AuthenticatedUser, problemId: string): Promise<StudentProblemDetailResponse>;
  getProblemLeaderboard(
    user: AuthenticatedUser,
    problemId: string,
    query: PaginationInput,
  ): Promise<PaginatedResult<ProblemLeaderboardItem> & { currentUserEntry: ProblemLeaderboardItem | null }>;
  getProblemHints(user: AuthenticatedUser, problemId: string): Promise<ProblemHintsResponse>;
  revealProblemHint(user: AuthenticatedUser, problemId: string): Promise<ProblemHintsResponse>;
  generateProblemHints(user: AuthenticatedUser, problemId: string): Promise<{ hints: FacultyHintView[] }>;
  updateProblemHints(
    user: AuthenticatedUser,
    problemId: string,
    hints: { order: number; text: string }[],
  ): Promise<{ hints: FacultyHintView[] }>;
  listManageProblems(user: AuthenticatedUser, query: ManageProblemQuery): Promise<PaginatedResult<ManageProblemSummaryResponse>>;
  getManageProblemDetail(user: AuthenticatedUser, problemId: string): Promise<ManageProblemDetailResponse>;
  createProblem(user: AuthenticatedUser, payload: CanonicalProblemPayload): Promise<ManageProblemDetailResponse>;
  updateProblem(user: AuthenticatedUser, problemId: string, payload: CanonicalProblemUpdatePayload): Promise<ManageProblemDetailResponse>;
  updateProblemState(user: AuthenticatedUser, problemId: string, lifecycleState: ProblemLifecycleState): Promise<ManageProblemDetailResponse>;
}

interface ProblemServiceDependencies {
  problemRepository: ProblemRepository;
  submissionRepository: SubmissionRepository;
  userRepository: UserRepository;
  hintRevealRepository: HintRevealRepository;
  hintGenerator: HintGenerator;
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

async function ensureStudentVisibleProblem(
  dependencies: ProblemServiceDependencies,
  user: AuthenticatedUser,
  problemId: string,
): Promise<ProblemRecord> {
  const problem = await dependencies.problemRepository.getById(problemId);

  // Faculty reach their own drafts through the manage endpoints; this path is the published,
  // department-scoped view, and applies the same 404 as the detail endpoint so hints cannot be
  // used to probe for problems a student is not allowed to see.
  if (!problem || problem.lifecycleState !== "Published" || !canStudentAccessProblem(user, problem)) {
    throw new AppError(404, "Problem not found");
  }

  return problem;
}

/**
 * Generates a problem's hints once, on first request, and caches them on the problem.
 *
 * Returns the existing hints untouched when they are already there — the model is only consulted
 * for a problem nobody has asked for hints on yet.
 */
async function ensureHintsGenerated(
  dependencies: ProblemServiceDependencies,
  problem: ProblemRecord,
): Promise<ProblemHint[]> {
  if (problem.hints.length > 0) {
    return problem.hints;
  }

  return generateAndStoreHints(dependencies, problem, { force: false });
}

async function generateAndStoreHints(
  dependencies: ProblemServiceDependencies,
  problem: ProblemRecord,
  options: { force: boolean },
): Promise<ProblemHint[]> {
  const now = dependencies.now();

  // Another request is already generating for this problem. Rather than queue a second model
  // call, hand back what we have (usually nothing) and let the student retry — a lock older than
  // AI_STALE_LOCK_MS is treated as abandoned so a crash cannot wedge hints permanently.
  const lockIsLive =
    problem.hintsLockedAt !== null &&
    now.getTime() - problem.hintsLockedAt.getTime() < env.AI_STALE_LOCK_MS;
  if (lockIsLive && !options.force) {
    return problem.hints;
  }

  await dependencies.problemRepository.save({ ...problem, hintsLockedAt: now, updatedAt: now });

  let texts: string[] | null = null;
  try {
    texts = await dependencies.hintGenerator.generate(problem);
  } catch {
    // The generator is documented as total, but a caching layer above it may not be. Either way
    // a failed hint generation must not fail the request that triggered it.
    texts = null;
  }

  if (!texts) {
    // Release the lock so the next request can try again rather than waiting out the stale timer.
    await dependencies.problemRepository.save({
      ...problem,
      hintsLockedAt: null,
      updatedAt: dependencies.now(),
    });
    return options.force ? [] : problem.hints;
  }

  const hints = buildGeneratedHints(
    texts,
    dependencies.hintGenerator.model,
    dependencies.hintGenerator.promptVersion,
    now,
  );

  await dependencies.problemRepository.save({
    ...problem,
    hints,
    hintsLockedAt: null,
    updatedAt: dependencies.now(),
  });

  return hints;
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

    async getProblemHints(user, problemId) {
      const problem = await ensureStudentVisibleProblem(dependencies, user, problemId);
      const hints = await ensureHintsGenerated(dependencies, problem);
      const reveal = await dependencies.hintRevealRepository.get(user.email, problemId);

      return toProblemHintsResponse(hints, reveal?.revealedCount ?? 0);
    },

    async revealProblemHint(user, problemId) {
      const problem = await ensureStudentVisibleProblem(dependencies, user, problemId);
      const hints = await ensureHintsGenerated(dependencies, problem);

      if (hints.length === 0) {
        throw new AppError(409, "No hints are available for this problem");
      }

      const now = dependencies.now();
      const existing = await dependencies.hintRevealRepository.get(user.email, problemId);
      const revealedCount = existing?.revealedCount ?? 0;

      if (revealedCount >= hints.length) {
        throw new AppError(409, "All hints for this problem have already been revealed");
      }

      const updated = await dependencies.hintRevealRepository.save({
        userEmail: user.email,
        problemId,
        revealedCount: revealedCount + 1,
        firstRevealedAt: existing?.firstRevealedAt ?? now,
        lastRevealedAt: now,
      });

      return toProblemHintsResponse(hints, updated.revealedCount);
    },

    async generateProblemHints(user, problemId) {
      const problem = ensureFacultyOwnsProblem(user, await dependencies.problemRepository.getById(problemId));
      // Faculty regeneration bypasses the cache on purpose — it is the "these hints are wrong"
      // button, so returning the existing ones would make it a no-op.
      const hints = await generateAndStoreHints(dependencies, problem, { force: true });

      if (hints.length === 0) {
        throw new AppError(503, "Hint generation is unavailable right now");
      }

      return { hints: toFacultyHintViews(hints) };
    },

    async updateProblemHints(user, problemId, hints) {
      const problem = ensureFacultyOwnsProblem(user, await dependencies.problemRepository.getById(problemId));
      const now = dependencies.now();

      const existingByOrder = new Map(problem.hints.map((hint) => [hint.order, hint]));
      const updated = hints
        .slice()
        .sort((left, right) => left.order - right.order)
        .map((hint) => {
          const existing = existingByOrder.get(hint.order);
          const text = hint.text.trim();
          return {
            order: hint.order,
            text,
            generatedAt: existing?.generatedAt ?? now,
            // Clearing the model marks the text as human-authored, so a later regeneration
            // warning can tell faculty they are about to discard their own edits.
            model: existing && existing.text === text ? existing.model : null,
            promptVersion: existing && existing.text === text ? existing.promptVersion : null,
            editedBy: existing && existing.text === text ? existing.editedBy : user.email,
          };
        });

      await dependencies.problemRepository.save({
        ...problem,
        hints: updated,
        hintsLockedAt: null,
        updatedAt: now,
      });

      return { hints: toFacultyHintViews(updated) };
    },

    async getProblemLeaderboard(user, problemId, query) {
      const problem = await dependencies.problemRepository.getById(problemId);
      if (!problem || problem.lifecycleState !== "Published" || !canStudentAccessProblem(user, problem)) {
        throw new AppError(404, "Problem not found");
      }

      // `listForAnalytics` projects code/stdout/stderr away in the database, so the "stats only,
      // no source code" guarantee is enforced by the query rather than by remembering to strip
      // fields on the way out.
      const accepted = await dependencies.submissionRepository.listForAnalytics({
        problemId,
        sourceType: "problem",
        status: "ACCEPTED",
      });

      const emails = [...new Set(accepted.map((submission) => submission.userEmail))];
      const users = await Promise.all(emails.map((email) => dependencies.userRepository.getByEmail(email)));
      const userSnapshots = new Map(
        emails.map((email, index) => [
          email,
          { name: users[index]?.name ?? null, uid: users[index]?.uid ?? null },
        ]),
      );

      const ranked = buildProblemLeaderboard(accepted, {
        currentUserEmail: user.email,
        userSnapshots,
      });

      return {
        ...paginateArray(ranked, query),
        // Pinned separately so a student outside the visible page can still see where they sit.
        currentUserEntry: ranked.find((item) => item.isCurrentUser) ?? null,
      };
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

      // Auto-detect a harness from the raw test cases + tags when the faculty did
      // not supply one, so new problems become metadata-driven with no extra work.
      // Only high-confidence detections are applied; anything ambiguous stays legacy.
      let harness = payload.harness ?? undefined;
      let sampleTestCases = payload.sampleTestCases;
      let hiddenTestCases = payload.hiddenTestCases;
      if (!harness) {
        const inferred = inferHarness({
          title: payload.title,
          tags: payload.tags,
          topic: payload.topic,
          statement: payload.statement,
          inputFormat: payload.inputFormat,
          outputFormat: payload.outputFormat,
          sampleTestCases: payload.sampleTestCases,
          hiddenTestCases: payload.hiddenTestCases,
        });
        if (inferred.ok && inferred.confidence === "high" && inferred.harness) {
          harness = inferred.harness;
          sampleTestCases = inferred.sampleTestCases ?? sampleTestCases;
          hiddenTestCases = inferred.hiddenTestCases ?? hiddenTestCases;
        }
      }

      const problem: ProblemRecord = {
        id: `problem_${randomUUID()}`,
        title: payload.title,
        slug: payload.slug,
        statement: payload.statement,
        topic: payload.topic,
        inputFormat: payload.inputFormat,
        outputFormat: payload.outputFormat,
        constraints: payload.constraints,
        explanation: payload.explanation,
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
        sampleTestCases,
        hiddenTestCases,
        harness,
        // Generated lazily on the first hint request rather than at creation, so publishing a
        // problem never blocks on the model being up.
        hints: [],
        hintsLockedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      await dependencies.problemRepository.save(problem);
      return toManageProblemDetail(problem);
    },

    async updateProblem(user, problemId, payload) {
      const existingProblem = ensureFacultyOwnsProblem(user, await dependencies.problemRepository.getById(problemId));

      // `harness` needs special handling: null clears it, undefined leaves it as-is.
      const { harness: harnessUpdate, ...rest } = payload;
      const updatedProblem: ProblemRecord = {
        ...existingProblem,
        ...rest,
        ...(harnessUpdate !== undefined ? { harness: harnessUpdate ?? undefined } : {}),
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
