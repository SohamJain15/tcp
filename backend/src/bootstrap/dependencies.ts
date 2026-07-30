import type { RequestHandler } from "express";
import { getMongoDatabase } from "../config/mongodb";
import { ensureHarnessRegistered } from "../execution/harness/register";
import { Judge0ExecutionProvider } from "../execution/judge0-execution-provider";
import { createAuthMiddleware } from "../middleware/auth";
import { createRequireCompleteProfile } from "../middleware/require-complete-profile";
import { createRequireHod } from "../middleware/require-hod";
import {
  FirestoreContestAttemptRepository,
  FirestoreContestFeedbackRepository,
  FirestoreContestProctoringRepository,
  FirestoreContestRegistrationRepository,
  FirestoreContestRepository,
  type ContestAttemptRepository,
  type ContestFeedbackRepository,
  type ContestProctoringRepository,
  type ContestRegistrationRepository,
  type ContestRepository,
} from "../modules/contest/contest.repository";
import { createContestService, type ContestService } from "../modules/contest/contest.service";
import {
  FirestoreLeaderboardRepository,
  type LeaderboardRepository,
} from "../modules/leaderboard/leaderboard.repository";
import { createLeaderboardService, type LeaderboardService } from "../modules/leaderboard/leaderboard.service";
import { FirestoreProblemRepository, type ProblemRepository } from "../modules/problem/problem.repository";
import { createProblemService, type ProblemService } from "../modules/problem/problem.service";
import {
  FirestoreSubmissionRepository,
  type SubmissionRepository,
} from "../modules/submission/submission.repository";
import {
  createSubmissionService,
  type ExecutionProvider,
  type SubmissionService,
} from "../modules/submission/submission.service";
import { BullMQSubmissionQueue, type SubmissionQueue } from "../queue/submission-queue";
import { FirestoreUserRepository, type UserRepository } from "../modules/user/user.repository";
import { createUserService, type UserService } from "../modules/user/user.service";
import { createDepartmentService, type DepartmentService } from "../modules/department/department.service";

export interface RepositoryBundle {
  userRepository: UserRepository;
  problemRepository: ProblemRepository;
  submissionRepository: SubmissionRepository;
  leaderboardRepository: LeaderboardRepository;
  contestRepository: ContestRepository;
  contestAttemptRepository: ContestAttemptRepository;
  contestProctoringRepository: ContestProctoringRepository;
  contestRegistrationRepository: ContestRegistrationRepository;
  contestFeedbackRepository: ContestFeedbackRepository;
}

export interface ServiceBundle {
  userService: UserService;
  problemService: ProblemService;
  submissionService: SubmissionService;
  leaderboardService: LeaderboardService;
  contestService: ContestService;
  departmentService: DepartmentService;
}

export interface ApplicationDependencies extends ServiceBundle {
  userRepository: UserRepository;
  authMiddleware: RequestHandler;
  profileCompletionMiddleware: RequestHandler;
  hodMiddleware: RequestHandler;
  databaseHealthcheck?: () => Promise<void>;
}

export interface DependencyOverrides {
  authMiddleware?: RequestHandler;
  executionProvider?: ExecutionProvider;
  submissionQueue?: SubmissionQueue;
  repositories?: Partial<RepositoryBundle>;
  now?: () => Date;
}

function createRepositories(overrides?: Partial<RepositoryBundle>): RepositoryBundle {
  return {
    userRepository: overrides?.userRepository ?? new FirestoreUserRepository(),
    problemRepository: overrides?.problemRepository ?? new FirestoreProblemRepository(),
    submissionRepository: overrides?.submissionRepository ?? new FirestoreSubmissionRepository(),
    leaderboardRepository: overrides?.leaderboardRepository ?? new FirestoreLeaderboardRepository(),
    contestRepository: overrides?.contestRepository ?? new FirestoreContestRepository(),
    contestAttemptRepository:
      overrides?.contestAttemptRepository ?? new FirestoreContestAttemptRepository(),
    contestProctoringRepository:
      overrides?.contestProctoringRepository ?? new FirestoreContestProctoringRepository(),
    contestRegistrationRepository:
      overrides?.contestRegistrationRepository ?? new FirestoreContestRegistrationRepository(),
    contestFeedbackRepository:
      overrides?.contestFeedbackRepository ?? new FirestoreContestFeedbackRepository(),
  };
}

export function createApplicationDependencies(overrides: DependencyOverrides = {}): ApplicationDependencies {
  // Register harness adapters + serializer plugins before anything can generate a
  // submission program. Idempotent, so repeated calls (e.g. in tests) are safe.
  ensureHarnessRegistered();

  const repositories = createRepositories(overrides.repositories);
  const now = overrides.now ?? (() => new Date());
  const submissionQueue = overrides.submissionQueue ?? new BullMQSubmissionQueue();
  const executionProvider = overrides.executionProvider ?? new Judge0ExecutionProvider();

  const userService = createUserService({
    userRepository: repositories.userRepository,
    leaderboardRepository: repositories.leaderboardRepository,
    submissionRepository: repositories.submissionRepository,
    now,
  });

  const problemService = createProblemService({
    problemRepository: repositories.problemRepository,
    submissionRepository: repositories.submissionRepository,
    now,
  });

  const submissionService = createSubmissionService({
    problemRepository: repositories.problemRepository,
    contestRepository: repositories.contestRepository,
    contestAttemptRepository: repositories.contestAttemptRepository,
    submissionRepository: repositories.submissionRepository,
    userRepository: repositories.userRepository,
    leaderboardRepository: repositories.leaderboardRepository,
    executionProvider,
    submissionQueue,
    now,
  });

  const leaderboardService = createLeaderboardService({
    leaderboardRepository: repositories.leaderboardRepository,
    userRepository: repositories.userRepository,
  });

  const contestService = createContestService({
    contestRepository: repositories.contestRepository,
    contestAttemptRepository: repositories.contestAttemptRepository,
    contestProctoringRepository: repositories.contestProctoringRepository,
    contestRegistrationRepository: repositories.contestRegistrationRepository,
    contestFeedbackRepository: repositories.contestFeedbackRepository,
    submissionRepository: repositories.submissionRepository,
    submissionQueue,
    userRepository: repositories.userRepository,
    executionProvider,
    now,
  });

  const departmentService = createDepartmentService({
    userRepository: repositories.userRepository,
    submissionRepository: repositories.submissionRepository,
    problemRepository: repositories.problemRepository,
    contestRepository: repositories.contestRepository,
    contestRegistrationRepository: repositories.contestRegistrationRepository,
    contestAttemptRepository: repositories.contestAttemptRepository,
    now,
  });

  return {
    userRepository: repositories.userRepository,
    authMiddleware: overrides.authMiddleware ?? createAuthMiddleware(userService),
    profileCompletionMiddleware: createRequireCompleteProfile(repositories.userRepository),
    hodMiddleware: createRequireHod(repositories.userRepository),
    databaseHealthcheck: async () => {
      const db = await getMongoDatabase();
      await db.command({ ping: 1 });
    },
    userService,
    problemService,
    submissionService,
    leaderboardService,
    contestService,
    departmentService,
  };
}
