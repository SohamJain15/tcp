import { describe, expect, it } from "vitest";
import { StubExecutionProvider } from "../execution/stub-execution-provider";
import { createSubmissionService } from "../modules/submission/submission.service";
import type { SubmissionQueue } from "../queue/submission-queue";
import {
  InMemoryContestAttemptRepository,
  InMemoryContestRepository,
  InMemoryLeaderboardRepository,
  InMemoryProblemRepository,
  InMemorySubmissionRepository,
  InMemoryUserRepository,
} from "./helpers/in-memory-repositories";

describe("submission recovery", () => {
  it("re-enqueues stale queued and running submissions without touching fresh ones", async () => {
    const now = new Date(Date.UTC(2026, 4, 12, 0, 10, 0));
    const enqueued: string[] = [];

    const submissionRepository = new InMemorySubmissionRepository([
      {
        id: "submission-stale-queued",
        queueJobId: null,
        judge0Token: null,
        sourceType: "problem",
        userEmail: "student1@tcetmumbai.in",
        userRole: "STUDENT",
        userDepartment: "B.E. Computer Engineering",
        resourceOwnerEmail: "faculty1@tcetmumbai.in",
        resourceTargetDepartment: null,
        problemId: "problem-1",
        problemTitleSnapshot: "Problem 1",
        problemDifficultySnapshot: "Easy",
        contestId: null,
        contestTitleSnapshot: null,
        contestQuestionId: null,
        code: "accepted",
        language: "python",
        status: "QUEUED",
        runtimeMs: 0,
        memoryKb: 0,
        passedCount: 0,
        totalCount: 2,
        executionProvider: "judge0",
        ratingAwarded: 0,
        stdout: null,
        stderr: null,
        createdAt: new Date(Date.UTC(2026, 4, 12, 0, 0, 0)),
        updatedAt: new Date(Date.UTC(2026, 4, 12, 0, 0, 0)),
        judgedAt: null,
        finalizationAppliedAt: null,
      },
      {
        id: "submission-stale-running",
        queueJobId: "old-job",
        judge0Token: null,
        sourceType: "problem",
        userEmail: "student1@tcetmumbai.in",
        userRole: "STUDENT",
        userDepartment: "B.E. Computer Engineering",
        resourceOwnerEmail: "faculty1@tcetmumbai.in",
        resourceTargetDepartment: null,
        problemId: "problem-2",
        problemTitleSnapshot: "Problem 2",
        problemDifficultySnapshot: "Medium",
        contestId: null,
        contestTitleSnapshot: null,
        contestQuestionId: null,
        code: "accepted",
        language: "java",
        status: "RUNNING",
        runtimeMs: 0,
        memoryKb: 0,
        passedCount: 0,
        totalCount: 3,
        executionProvider: "judge0",
        ratingAwarded: 0,
        stdout: null,
        stderr: "old error",
        createdAt: new Date(Date.UTC(2026, 4, 12, 0, 1, 0)),
        updatedAt: new Date(Date.UTC(2026, 4, 12, 0, 1, 0)),
        judgedAt: null,
        finalizationAppliedAt: null,
      },
      {
        id: "submission-fresh-queued",
        queueJobId: null,
        judge0Token: null,
        sourceType: "problem",
        userEmail: "student1@tcetmumbai.in",
        userRole: "STUDENT",
        userDepartment: "B.E. Computer Engineering",
        resourceOwnerEmail: "faculty1@tcetmumbai.in",
        resourceTargetDepartment: null,
        problemId: "problem-3",
        problemTitleSnapshot: "Problem 3",
        problemDifficultySnapshot: "Hard",
        contestId: null,
        contestTitleSnapshot: null,
        contestQuestionId: null,
        code: "accepted",
        language: "go",
        status: "QUEUED",
        runtimeMs: 0,
        memoryKb: 0,
        passedCount: 0,
        totalCount: 4,
        executionProvider: "judge0",
        ratingAwarded: 0,
        stdout: null,
        stderr: null,
        createdAt: new Date(Date.UTC(2026, 4, 12, 0, 9, 45)),
        updatedAt: new Date(Date.UTC(2026, 4, 12, 0, 9, 45)),
        judgedAt: null,
        finalizationAppliedAt: null,
      },
    ]);

    const submissionQueue: SubmissionQueue = {
      async enqueue(submissionId: string) {
        enqueued.push(submissionId);
        return `job-${submissionId}`;
      },
    };

    const service = createSubmissionService({
      problemRepository: new InMemoryProblemRepository(),
      contestRepository: new InMemoryContestRepository(),
      contestAttemptRepository: new InMemoryContestAttemptRepository(),
      submissionRepository,
      userRepository: new InMemoryUserRepository(),
      leaderboardRepository: new InMemoryLeaderboardRepository(),
      executionProvider: new StubExecutionProvider(),
      submissionQueue,
      now: () => now,
    });

    const summary = await service.recoverStaleSubmissions();

    expect(summary.recoveredCount).toBe(2);
    expect(summary.recoveredSubmissionIds).toEqual(["submission-stale-queued", "submission-stale-running"]);
    expect(enqueued).toEqual(["submission-stale-queued", "submission-stale-running"]);

    const recoveredQueued = await submissionRepository.getById("submission-stale-queued");
    expect(recoveredQueued?.status).toBe("QUEUED");
    expect(recoveredQueued?.queueJobId).toBe("job-submission-stale-queued");
    expect(recoveredQueued?.stderr).toBeNull();

    const recoveredRunning = await submissionRepository.getById("submission-stale-running");
    expect(recoveredRunning?.status).toBe("QUEUED");
    expect(recoveredRunning?.queueJobId).toBe("job-submission-stale-running");
    expect(recoveredRunning?.stderr).toBeNull();

    const freshQueued = await submissionRepository.getById("submission-fresh-queued");
    expect(freshQueued?.queueJobId).toBeNull();
    expect(freshQueued?.updatedAt.toISOString()).toBe(new Date(Date.UTC(2026, 4, 12, 0, 9, 45)).toISOString());
  });
});
