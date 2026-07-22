import express from "express";
import { createApp } from "../../app";
import { env } from "../../config/env";
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
  InMemoryContestRegistrationRepository,
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
  const contestRegistrationRepository = new InMemoryContestRegistrationRepository();
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

  // Mirrors production auth (middleware/auth.ts), which resolves identity from the CoE token and
  // populates ONLY email/role/name. Department and uid deliberately stay absent: they live on the
  // saved profile, so any code that reads them off the request identity must be caught here.
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
      contestRegistrationRepository,
      submissionRepository,
      submissionQueue,
      userRepository,
      executionProvider: new StubExecutionProvider(),
      now,
    }),
  };

  // supertest sends no Origin header, which the app's mutation origin guard rejects outright.
  // Front the real app with a shim that supplies the browser-like Origin a real client would,
  // so tests exercise the guard rather than being blocked by it.
  const app = express();
  app.use((req, _res, next) => {
    req.headers.origin ??= env.FRONTEND_BASE_URL;
    next();
  });
  app.use(createApp(dependencies));

  return {
    app,
    repositories: {
      userRepository,
      problemRepository,
      submissionRepository,
      leaderboardRepository,
      contestRepository,
      contestAttemptRepository,
      contestProctoringRepository,
      contestRegistrationRepository,
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
