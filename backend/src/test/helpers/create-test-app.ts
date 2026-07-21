import { createApp } from "../../app";
import { createRequireCompleteProfile } from "../../middleware/require-complete-profile";
import { createContestService } from "../../modules/contest/contest.service";
import { createLeaderboardService } from "../../modules/leaderboard/leaderboard.service";
import { createProblemService } from "../../modules/problem/problem.service";
import { createSubmissionService } from "../../modules/submission/submission.service";
import type { SubmissionQueue } from "../../queue/submission-queue";
import { createUserService } from "../../modules/user/user.service";
import { StubExecutionProvider } from "../../execution/stub-execution-provider";
import type { ApplicationDependencies } from "../../bootstrap/dependencies";
import {
  InMemoryContestAttemptRepository,
  InMemoryContestProctoringRepository,
  InMemoryContestRepository,
  InMemoryLeaderboardRepository,
  InMemoryProblemRepository,
  InMemorySubmissionRepository,
  InMemoryUserRepository,
} from "./in-memory-repositories";

export function createTestApp() {
  const seedTime = new Date(Date.UTC(2026, 4, 7, 0, 0, 0));
  const userRepository = new InMemoryUserRepository([
    {
      email: "student1@tcetmumbai.in",
      role: "STUDENT",
      name: "Student One",
      uid: "TCET-REAL-001",
      isProfileComplete: true,
      designation: null,
      rollNumber: "TCET001",
      department: "B.E. Computer Engineering",
      semester: 4,
      linkedInUrl: null,
      githubUrl: null,
      skills: [],
      rating: 0,
      score: 0,
      problemsSolved: 0,
      submissionCount: 0,
      acceptedSubmissionCount: 0,
      accuracy: 0,
      createdAt: seedTime,
      updatedAt: seedTime,
      lastLoginAt: seedTime,
      lastAcceptedAt: null,
    },
    {
      email: "student2@tcetmumbai.in",
      role: "STUDENT",
      name: "Student Two",
      uid: "TCET-REAL-002",
      isProfileComplete: true,
      designation: null,
      rollNumber: "TCET002",
      department: "B.E. Information Technology",
      semester: 4,
      linkedInUrl: null,
      githubUrl: null,
      skills: [],
      rating: 0,
      score: 0,
      problemsSolved: 0,
      submissionCount: 0,
      acceptedSubmissionCount: 0,
      accuracy: 0,
      createdAt: seedTime,
      updatedAt: seedTime,
      lastLoginAt: seedTime,
      lastAcceptedAt: null,
    },
    {
      email: "faculty1@tcetmumbai.in",
      role: "FACULTY",
      name: "Prof. Mehta",
      uid: "TCET-FAC-001",
      isProfileComplete: true,
      designation: "Professor",
      rollNumber: null,
      department: "B.E. Computer Engineering",
      semester: null,
      linkedInUrl: null,
      githubUrl: null,
      skills: [],
      rating: 0,
      score: 0,
      problemsSolved: 0,
      submissionCount: 0,
      acceptedSubmissionCount: 0,
      accuracy: 0,
      createdAt: seedTime,
      updatedAt: seedTime,
      lastLoginAt: seedTime,
      lastAcceptedAt: null,
    },
  ]);
  const problemRepository = new InMemoryProblemRepository();
  const submissionRepository = new InMemorySubmissionRepository();
  const leaderboardRepository = new InMemoryLeaderboardRepository();
  const contestRepository = new InMemoryContestRepository();
  const contestAttemptRepository = new InMemoryContestAttemptRepository();
  const contestProctoringRepository = new InMemoryContestProctoringRepository();
  let tick = 0;

  const now = () => {
    tick += 1;
    return new Date(Date.UTC(2026, 4, 7, 0, 0, tick));
  };
  const submissionQueue: SubmissionQueue = {
    async enqueue(submissionId) {
      return submissionId;
    },
  };

  const mockAuthMiddleware: ApplicationDependencies["authMiddleware"] = (req, _res, next) => {
    req.user = {
      email:
        typeof req.headers["x-coe-email"] === "string"
          ? req.headers["x-coe-email"]
          : "student1@tcetmumbai.in",
      role:
        typeof req.headers["x-coe-role"] === "string" && req.headers["x-coe-role"].toUpperCase() === "FACULTY"
          ? "FACULTY"
          : "STUDENT",
      name: typeof req.headers["x-coe-name"] === "string" ? req.headers["x-coe-name"] : "Student One",
      uid: typeof req.headers["x-coe-uid"] === "string" ? req.headers["x-coe-uid"] : "TCET-REAL-001",
      department:
        typeof req.headers["x-coe-department"] === "string"
          ? req.headers["x-coe-department"]
          : "B.E. Computer Engineering",
    };
    next();
  };

  const dependencies: ApplicationDependencies = {
    userRepository,
    authMiddleware: mockAuthMiddleware,
    profileCompletionMiddleware: createRequireCompleteProfile(userRepository),
    userService: createUserService({
      userRepository,
      leaderboardRepository,
      submissionRepository,
      now,
    }),
    problemService: createProblemService({
      problemRepository,
      submissionRepository,
      now,
    }),
    submissionService: createSubmissionService({
      problemRepository,
      contestRepository,
      contestAttemptRepository,
      submissionRepository,
      userRepository,
      leaderboardRepository,
      executionProvider: new StubExecutionProvider(),
      submissionQueue,
      now,
    }),
    leaderboardService: createLeaderboardService({
      leaderboardRepository,
      userRepository,
    }),
    contestService: createContestService({
      contestRepository,
      contestAttemptRepository,
      contestProctoringRepository,
      submissionRepository,
      submissionQueue,
      userRepository,
      executionProvider: new StubExecutionProvider(),
      now,
    }),
  };

  return {
    app: createApp(dependencies),
    repositories: {
      userRepository,
      problemRepository,
      submissionRepository,
      leaderboardRepository,
      contestRepository,
      contestAttemptRepository,
      contestProctoringRepository,
    },
    services: {
      userService: dependencies.userService,
      problemService: dependencies.problemService,
      submissionService: dependencies.submissionService,
      leaderboardService: dependencies.leaderboardService,
      contestService: dependencies.contestService,
    },
  };
}
