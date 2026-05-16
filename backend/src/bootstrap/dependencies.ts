import type { RequestHandler } from "express";
import { env } from "../config/env";
import { db } from "../firebase";
import { Judge0ExecutionProvider } from "../execution/judge0-execution-provider";
import { createAuthMiddleware } from "../middleware/auth";
import { createRequireCompleteProfile } from "../middleware/require-complete-profile";
import {
  FirestoreContestAttemptRepository,
  FirestoreContestProctoringRepository,
  FirestoreContestRepository,
  type ContestAttemptRepository,
  type ContestProctoringRepository,
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

export interface RepositoryBundle {
  userRepository: UserRepository;
  problemRepository: ProblemRepository;
  submissionRepository: SubmissionRepository;
  leaderboardRepository: LeaderboardRepository;
  contestRepository: ContestRepository;
  contestAttemptRepository: ContestAttemptRepository;
  contestProctoringRepository: ContestProctoringRepository;
}

export interface ServiceBundle {
  userService: UserService;
  problemService: ProblemService;
  submissionService: SubmissionService;
  leaderboardService: LeaderboardService;
  contestService: ContestService;
}

export interface ApplicationDependencies extends ServiceBundle {
  userRepository: UserRepository;
  authMiddleware: RequestHandler;
  profileCompletionMiddleware: RequestHandler;
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
    userRepository: overrides?.userRepository ?? new FirestoreUserRepository(db),
    problemRepository: overrides?.problemRepository ?? new FirestoreProblemRepository(db),
    submissionRepository: overrides?.submissionRepository ?? new FirestoreSubmissionRepository(db),
    leaderboardRepository: overrides?.leaderboardRepository ?? new FirestoreLeaderboardRepository(db),
    contestRepository: overrides?.contestRepository ?? new FirestoreContestRepository(db),
    contestAttemptRepository:
      overrides?.contestAttemptRepository ?? new FirestoreContestAttemptRepository(db),
    contestProctoringRepository:
      overrides?.contestProctoringRepository ?? new FirestoreContestProctoringRepository(db),
  };
}

export function createApplicationDependencies(overrides: DependencyOverrides = {}): ApplicationDependencies {
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
  });

  const contestService = createContestService({
    contestRepository: repositories.contestRepository,
    contestAttemptRepository: repositories.contestAttemptRepository,
    contestProctoringRepository: repositories.contestProctoringRepository,
    submissionRepository: repositories.submissionRepository,
    submissionQueue,
    userRepository: repositories.userRepository,
    executionProvider,
    now,
  });

  return {
    userRepository: repositories.userRepository,
    authMiddleware: overrides.authMiddleware ?? createAuthMiddleware(userService),
    profileCompletionMiddleware: createRequireCompleteProfile(repositories.userRepository),
    databaseHealthcheck: async () => {
      await db.collection(env.FIRESTORE_TEST_COLLECTION).doc("demo").set({
        message: "Firebase connected",
        time: new Date(),
      });
    },
    userService,
    problemService,
    submissionService,
    leaderboardService,
    contestService,
  };
}
