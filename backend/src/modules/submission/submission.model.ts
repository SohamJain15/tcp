import type { FailedTestCase } from "../../execution/execution-provider";
import type { SqlResultSet } from "../../execution/sql/sql-executor";
import { EXECUTION_SERVICE_UNAVAILABLE_MESSAGE } from "../../shared/errors/public-messages";
import type { UserRole } from "../../shared/types/auth";
import type { Department, Difficulty, ExecutableLanguage, SubmissionStatus } from "../../shared/types/domain";
import { toIsoString } from "../../shared/utils/date";

/**
 * What a submission was written in.
 *
 * Wider than `ExecutableLanguage` by exactly one member: "sql" is a language students submit in but
 * one Judge0 never sees. SQL problems are graded by the MySQL sandbox and never enter the execution
 * queue, so keeping "sql" out of `ExecutableLanguage` — which means "Judge0 can run this" — leaves
 * every provider-facing signature honest.
 */
export type SubmissionLanguage = ExecutableLanguage | "sql";

export type { FailedTestCase } from "../../execution/execution-provider";

export type SubmissionSourceType = "problem" | "contest_coding" | "classtest_coding" | "lab_coding";

/** How much of a captured failing case a student is allowed to see. */
export type FailedTestVisibility = "full" | "truncated";

/** Contest/class-test students see enough input to reproduce, not enough to reconstruct the case. */
const TRUNCATED_FIELD_CHARS = 200;

/**
 * A failing case as shown to a student.
 *
 * `expectedOutput` is optional rather than blanked: under `truncated` the field is absent
 * entirely, so the UI can say "hidden during contests" instead of rendering an empty box that
 * reads like the answer really was an empty string.
 */
export interface FailedTestCaseView {
  index: number;
  isHidden: boolean;
  status: SubmissionStatus;
  input: string;
  expectedOutput?: string;
  actualOutput: string;
  truncated: boolean;
}

/**
 * Practice problems exist to be learned from, so the whole case is fair game. A contest or class
 * test is being graded live, and handing back the expected output of a hidden case would let a
 * student reconstruct the answer key one wrong submission at a time.
 */
export function resolveFailedTestVisibility(sourceType: SubmissionSourceType): FailedTestVisibility {
  // Practice-style surfaces (standalone problems and self-paced lab experiments) show the full
  // failing case; the timed/proctored surfaces (contest, class test) truncate it.
  return sourceType === "problem" || sourceType === "lab_coding" ? "full" : "truncated";
}

function truncate(value: string): string {
  return value.length <= TRUNCATED_FIELD_CHARS ? value : `${value.slice(0, TRUNCATED_FIELD_CHARS)}…`;
}

export function redactFailedTest(
  failedTest: FailedTestCase | null | undefined,
  visibility: FailedTestVisibility,
): FailedTestCaseView | null {
  if (!failedTest) {
    return null;
  }

  if (visibility === "full") {
    return {
      index: failedTest.index,
      isHidden: failedTest.isHidden,
      status: failedTest.status,
      input: failedTest.input,
      expectedOutput: failedTest.expectedOutput,
      actualOutput: failedTest.actualOutput,
      truncated: false,
    };
  }

  return {
    index: failedTest.index,
    isHidden: failedTest.isHidden,
    status: failedTest.status,
    input: truncate(failedTest.input),
    actualOutput: truncate(failedTest.actualOutput),
    truncated: true,
  };
}

export interface SubmissionRecord {
  id: string;
  queueJobId: string | null;
  judge0Token: string | null;
  sourceType: SubmissionSourceType;
  userEmail: string;
  userRole: UserRole;
  userDepartment: Department | null;
  resourceOwnerEmail: string;
  resourceTargetDepartment: Department | null;
  problemId: string;
  problemTitleSnapshot: string;
  problemDifficultySnapshot: Difficulty;
  contestId: string | null;
  contestTitleSnapshot: string | null;
  contestQuestionId: string | null;
  /** Set only for `classtest_coding`; contests use the `contest*` fields above. */
  classTestId: string | null;
  classTestQuestionId: string | null;
  /**
   * Set only for `lab_coding` (DSA Lab experiments). Optional so every existing submission literal
   * and stored document stays valid without a migration; absent means "not a lab submission".
   */
  labId?: string | null;
  labExperimentId?: string | null;
  /**
   * Set for a `lab_coding` submission made inside a scheduled Lab Session — grading then uses the
   * session's frozen experiment snapshot rather than the live lab.
   */
  labSessionId?: string | null;
  code: string;
  language: SubmissionLanguage;
  status: SubmissionStatus;
  runtimeMs: number;
  memoryKb: number;
  passedCount: number;
  totalCount: number;
  executionProvider: string;
  ratingAwarded: number;
  /** SQL problems: the grid the student's query produced. */
  sqlResult?: SqlResultSet | null;
  /** SQL problems: the reference grid. `toSubmissionResponse` decides who may see it. */
  sqlExpected?: SqlResultSet | null;
  stdout: string | null;
  stderr: string | null;
  /** Captured unredacted; `toSubmissionResponse` decides what the requester may see. */
  failedTest: FailedTestCase | null;
  createdAt: Date;
  updatedAt: Date;
  judgedAt: Date | null;
  finalizationAppliedAt: Date | null;
}

export interface SubmissionQueueReceipt {
  submission_id: string;
  status: "queued";
}

export interface SubmissionResponse {
  id: string;
  userEmail: string;
  userName: string | null;
  userUid: string | null;
  userDepartment: Department | null;
  sourceType: SubmissionSourceType;
  problemId: string;
  problemTitle: string;
  difficulty: Difficulty;
  contestId: string | null;
  contestTitle: string | null;
  contestQuestionId: string | null;
  language: SubmissionLanguage;
  status: SubmissionStatus;
  runtimeMs: number;
  memoryKb: number;
  passedCount: number;
  totalCount: number;
  executionProvider: string;
  ratingAwarded: number;
  stdout?: string | null;
  stderr?: string | null;
  failedTest: FailedTestCaseView | null;
  sqlResult?: SqlResultSet | null;
  /** Withheld wherever a failing test case would be — see `resolveFailedTestVisibility`. */
  sqlExpected?: SqlResultSet | null;
  createdAt: string;
  updatedAt: string;
  judgedAt: string | null;
  code?: string;
}

export interface SubmissionUserSnapshot {
  name: string | null;
  uid: string | null;
}

export interface SubmissionRunResponse {
  problemId: string;
  language: SubmissionLanguage;
  status: SubmissionStatus;
  runtimeMs: number;
  memoryKb: number;
  passedCount: number;
  totalCount: number;
  executionProvider: string;
  stdout?: string;
  stderr?: string;
  failedTest: FailedTestCaseView | null;
  /** SQL problems: the grid to render instead of a stdout blob. */
  sqlResult?: SqlResultSet | null;
}

export function toSubmissionResponse(
  submission: SubmissionRecord,
  includeCode = false,
  userSnapshot?: SubmissionUserSnapshot,
): SubmissionResponse {
  return {
    id: submission.id,
    userEmail: submission.userEmail,
    userName: userSnapshot?.name ?? null,
    userUid: userSnapshot?.uid ?? null,
    userDepartment: submission.userDepartment,
    sourceType: submission.sourceType,
    problemId: submission.problemId,
    problemTitle: submission.problemTitleSnapshot,
    difficulty: submission.problemDifficultySnapshot,
    contestId: submission.contestId,
    contestTitle: submission.contestTitleSnapshot,
    contestQuestionId: submission.contestQuestionId,
    language: submission.language,
    status: submission.status,
    runtimeMs: submission.runtimeMs,
    memoryKb: submission.memoryKb,
    passedCount: submission.passedCount,
    totalCount: submission.totalCount,
    executionProvider: submission.executionProvider,
    ratingAwarded: submission.ratingAwarded,
    stdout: submission.stdout,
    stderr:
      submission.status === "INTERNAL_ERROR"
        ? EXECUTION_SERVICE_UNAVAILABLE_MESSAGE
        : submission.stderr,
    failedTest: redactFailedTest(submission.failedTest, resolveFailedTestVisibility(submission.sourceType)),
    ...(submission.sqlResult ? { sqlResult: submission.sqlResult } : {}),
    // The expected grid is the answer key. It follows the same rule as a failing test case: full
    // detail on a practice problem, withheld during a contest or class test.
    ...(submission.sqlExpected && resolveFailedTestVisibility(submission.sourceType) === "full"
      ? { sqlExpected: submission.sqlExpected }
      : {}),
    createdAt: toIsoString(submission.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIsoString(submission.updatedAt) ?? new Date(0).toISOString(),
    judgedAt: toIsoString(submission.judgedAt),
    ...(includeCode ? { code: submission.code } : {}),
  };
}
