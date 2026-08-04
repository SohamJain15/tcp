import { describe, expect, it } from "vitest";
import type { FailedTestCase, SubmissionRecord } from "../modules/submission/submission.model";
import {
  redactFailedTest,
  resolveFailedTestVisibility,
  toSubmissionResponse,
} from "../modules/submission/submission.model";

const failedTest: FailedTestCase = {
  index: 7,
  isHidden: true,
  status: "WRONG_ANSWER",
  input: "x".repeat(500),
  expectedOutput: "42",
  actualOutput: "y".repeat(500),
};

describe("failed test case visibility", () => {
  it("treats practice problems as full-disclosure and graded work as truncated", () => {
    expect(resolveFailedTestVisibility("problem")).toBe("full");
    expect(resolveFailedTestVisibility("contest_coding")).toBe("truncated");
    expect(resolveFailedTestVisibility("classtest_coding")).toBe("truncated");
  });

  it("hands back the whole case under full visibility", () => {
    const view = redactFailedTest(failedTest, "full");

    expect(view).toEqual({ ...failedTest, truncated: false });
  });

  it("omits the expected output entirely under truncated visibility", () => {
    const view = redactFailedTest(failedTest, "truncated");

    // Absent, not blanked: an empty string would read as "the answer was empty".
    expect(view).not.toHaveProperty("expectedOutput");
    expect(view?.truncated).toBe(true);
    expect(view?.input).toBe(`${"x".repeat(200)}…`);
    expect(view?.actualOutput).toBe(`${"y".repeat(200)}…`);
  });

  it("leaves short fields alone rather than appending a misleading ellipsis", () => {
    const view = redactFailedTest({ ...failedTest, input: "3 4", actualOutput: "7" }, "truncated");

    expect(view?.input).toBe("3 4");
    expect(view?.actualOutput).toBe("7");
  });

  it("returns null when there is no failing case", () => {
    expect(redactFailedTest(null, "full")).toBeNull();
    expect(redactFailedTest(undefined, "truncated")).toBeNull();
  });

  it("applies the source type's rule when serialising a submission", () => {
    const base = buildSubmission("problem");

    expect(toSubmissionResponse(base).failedTest?.expectedOutput).toBe("42");
    expect(toSubmissionResponse(buildSubmission("contest_coding")).failedTest).not.toHaveProperty(
      "expectedOutput",
    );
    expect(toSubmissionResponse(buildSubmission("classtest_coding")).failedTest).not.toHaveProperty(
      "expectedOutput",
    );
  });
});

function buildSubmission(sourceType: SubmissionRecord["sourceType"]): SubmissionRecord {
  const now = new Date(Date.UTC(2026, 4, 12, 0, 0, 0));

  return {
    id: "sub_1",
    queueJobId: null,
    judge0Token: null,
    sourceType,
    userEmail: "student@tcetmumbai.in",
    userRole: "STUDENT",
    userDepartment: null,
    resourceOwnerEmail: "faculty@tcetmumbai.in",
    resourceTargetDepartment: null,
    problemId: "problem_1",
    problemTitleSnapshot: "Problem",
    problemDifficultySnapshot: "Easy",
    contestId: null,
    contestTitleSnapshot: null,
    contestQuestionId: null,
    classTestId: null,
    classTestQuestionId: null,
    code: "print(1)",
    language: "python",
    status: "WRONG_ANSWER",
    runtimeMs: 12,
    memoryKb: 2048,
    passedCount: 7,
    totalCount: 10,
    executionProvider: "judge0",
    ratingAwarded: 0,
    stdout: null,
    stderr: null,
    failedTest,
    createdAt: now,
    updatedAt: now,
    judgedAt: now,
    finalizationAppliedAt: now,
  };
}
