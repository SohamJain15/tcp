import request from "supertest";
import { describe, expect, it } from "vitest";

import type { SubmissionRecord } from "../modules/submission/submission.model";
import { createTestApp } from "./helpers/create-test-app";

const adminHeaders = {
  "x-coe-role": "ADMIN",
  "x-coe-email": "principal@tcetmumbai.in",
  "x-coe-name": "Principal",
};

const COMPUTER_ENGINEERING = "B.E. Computer Engineering";
const encoded = encodeURIComponent(COMPUTER_ENGINEERING);

// The seeded clock in create-test-app sits at 2026-05-07, which is inside the default 90-day window.
const DAY = new Date(Date.UTC(2026, 4, 6, 10, 0, 0));
const DAY_KEY = "2026-05-06";

function buildSubmission(id: string, overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  return {
    id,
    queueJobId: null,
    judge0Token: null,
    sourceType: "problem",
    // student1 is the seeded Computer Engineering student.
    userEmail: "student1@tcetmumbai.in",
    userRole: "STUDENT",
    userDepartment: COMPUTER_ENGINEERING,
    resourceOwnerEmail: "faculty1@tcetmumbai.in",
    resourceTargetDepartment: null,
    problemId: "problem_1",
    problemTitleSnapshot: "Two Sum",
    problemDifficultySnapshot: "Easy",
    contestId: null,
    contestTitleSnapshot: null,
    contestQuestionId: null,
    classTestId: null,
    classTestQuestionId: null,
    code: "print(1)",
    language: "python",
    status: "ACCEPTED",
    runtimeMs: 10,
    memoryKb: 1024,
    passedCount: 2,
    totalCount: 2,
    executionProvider: "stub",
    ratingAwarded: 0,
    stdout: null,
    stderr: null,

    failedTest: null,
    createdAt: DAY,
    updatedAt: DAY,
    judgedAt: DAY,
    finalizationAppliedAt: null,
    ...overrides,
  };
}

async function trendFor(submissions: SubmissionRecord[]) {
  const { app, repositories } = createTestApp();
  for (const submission of submissions) {
    await repositories.submissionRepository.create(submission);
  }

  const response = await request(app)
    .get(`/api/admin/departments/${encoded}/overview`)
    .set(adminHeaders);

  expect(response.status).toBe(200);
  const point = (response.body.overview.activityTrend as { date: string; submissionCount: number; activeStudentCount: number }[])
    .find((entry) => entry.date === DAY_KEY);

  return point ?? { date: DAY_KEY, submissionCount: 0, activeStudentCount: 0 };
}

describe("department activity trend", () => {
  it("counts accepted practice-problem submissions", async () => {
    const point = await trendFor([buildSubmission("s1"), buildSubmission("s2")]);
    expect(point.submissionCount).toBe(2);
    expect(point.activeStudentCount).toBe(1);
  });

  it("ignores every non-accepted verdict", async () => {
    // The real incident: a queue outage wrote ~2,700 INTERNAL_ERROR rows in a single day and the
    // chart read them as a spike in engagement.
    const point = await trendFor([
      buildSubmission("ok"),
      buildSubmission("err", { status: "INTERNAL_ERROR", stderr: "Redis version needs to be >= 5.0.0" }),
      buildSubmission("wa", { status: "WRONG_ANSWER" }),
      buildSubmission("ce", { status: "COMPILATION_ERROR" }),
      buildSubmission("tle", { status: "TIME_LIMIT_EXCEEDED" }),
      buildSubmission("queued", { status: "QUEUED" }),
      buildSubmission("running", { status: "RUNNING" }),
    ]);

    expect(point.submissionCount).toBe(1);
  });

  it("ignores contest submissions", async () => {
    const point = await trendFor([
      buildSubmission("practice"),
      buildSubmission("contest", {
        sourceType: "contest_coding",
        contestId: "contest_1",
        contestQuestionId: "q1",
      }),
    ]);

    expect(point.submissionCount).toBe(1);
  });

  it("does not count a student who only failed as solving that day", async () => {
    const point = await trendFor([
      buildSubmission("fail-only", { status: "INTERNAL_ERROR" }),
    ]);

    expect(point.submissionCount).toBe(0);
    expect(point.activeStudentCount).toBe(0);
  });

  it("leaves the rest of the overview counting every submission", async () => {
    // The narrowing is scoped to the trend line: totals and accuracy still describe all activity, so
    // a judge outage stays visible somewhere rather than being erased from the record entirely.
    const { app, repositories } = createTestApp();
    await repositories.submissionRepository.create(buildSubmission("ok"));
    await repositories.submissionRepository.create(
      buildSubmission("err", { status: "INTERNAL_ERROR" }),
    );

    const response = await request(app)
      .get(`/api/admin/departments/${encoded}/overview`)
      .set(adminHeaders);

    expect(response.body.overview.totals.submissionCount).toBe(2);
    expect(response.body.overview.totals.acceptedSubmissionCount).toBe(1);
  });
});
