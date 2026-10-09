import request from "supertest";
import { describe, expect, it } from "vitest";

import { StubSqlExecutor } from "../execution/sql/stub-sql-executor";
import type { SqlExecutor } from "../execution/sql/sql-executor";
import { createTestApp } from "./helpers/create-test-app";

/**
 * Database (SQL) questions inside a contest.
 *
 * Unlike every other contest question these are graded inline against the MySQL sandbox instead of
 * going through the Judge0 queue, which puts them on a code path with its own failure modes — and
 * its own opportunities to leak grading information that the coding path deliberately withholds.
 */

const facultyHeaders = {
  "x-coe-role": "FACULTY",
  "x-coe-email": "faculty1@tcetmumbai.in",
  "x-coe-name": "Prof. Mehta",
};

const SEED = "CREATE TABLE employees (id INT, name VARCHAR(50), salary INT);";
const SOLUTION = "SELECT name FROM employees WHERE salary > 75000";

function sqlQuestion(overrides: Record<string, unknown> = {}) {
  return {
    id: "q_sql_1",
    type: "Coding",
    kind: "sql",
    points: 100,
    problemTitle: "High earners",
    difficulty: "Easy",
    problemStatement: "List employees earning more than 75000.",
    constraints: "Use MySQL syntax.",
    inputFormat: "The employees table.",
    outputFormat: "One name column.",
    sampleTestCases: [],
    hiddenTestCases: [],
    supportedLanguages: [],
    sql: { schemaSql: SEED, solutionSql: SOLUTION, ordered: false },
    ...overrides,
  };
}

function codingQuestion() {
  return {
    id: "q_code_1",
    type: "Coding",
    points: 100,
    problemTitle: "Sum Two Numbers",
    difficulty: "Easy",
    problemStatement: "Read two integers and print their sum.",
    constraints: "1 <= a,b <= 10^9",
    inputFormat: "Two integers",
    outputFormat: "Their sum",
    sampleTestCases: [{ input: "2 3", output: "5" }],
    hiddenTestCases: [{ input: "10 20", output: "30" }],
    timeLimitSeconds: 1,
    memoryLimitMb: 256,
    supportedLanguages: ["cpp", "python"],
  };
}

async function createContest(
  app: Parameters<typeof request>[0],
  questions: Record<string, unknown>[],
) {
  const startTime = "2026-05-07T00:00:00.000Z";
  const endTime = new Date(Date.parse(startTime) + 60 * 60_000).toISOString();
  const response = await request(app)
    .post("/api/contests")
    .set(facultyHeaders)
    .send({
      title: "DBMS Contest",
      startTime,
      endTime,
      duration: 60,
      type: "Rated",
      lifecycleState: "Published",
      targetDepartment: null,
      maxViolations: 3,
      registrationOpenAt: new Date(Date.parse(startTime) - 24 * 60 * 60_000).toISOString(),
      registrationCloseAt: endTime,
      questions,
    });
  return response;
}

/** A published, live contest with one Database question and an active attempt for the student. */
async function liveSqlContest(options: { sqlExecutor?: SqlExecutor } = {}) {
  const harness = createTestApp(options);
  const created = await createContest(harness.app, [sqlQuestion(), codingQuestion()]);
  expect(created.status).toBe(201);
  const contest = created.body.contest;

  expect((await request(harness.app).post(`/api/contests/${contest.id}/registration`)).status).toBe(201);
  const attempt = await request(harness.app).post(`/api/contests/${contest.id}/attempts`);
  expect(attempt.status).toBe(201);

  return { ...harness, contest };
}

describe("contest Database questions — authoring", () => {
  it("accepts a Database question with no test cases and blanks the coding-only fields", async () => {
    const { app, repositories } = createTestApp();
    const response = await createContest(app, [sqlQuestion()]);
    expect(response.status).toBe(201);

    const stored = await repositories.contestRepository.getById(response.body.contest.id);
    const question = stored!.questions[0];
    expect(question.type).toBe("Coding");
    if (question.type !== "Coding") throw new Error("expected a coding-shaped question");
    expect(question.kind).toBe("sql");
    expect(question.sql).toEqual({ schemaSql: SEED, solutionSql: SOLUTION, ordered: false });
    // Judge0 concepts a SQL question has no use for — persisting stale values would mislead every
    // reader of the record, and the hidden-testcase requirement must not apply either.
    expect(question.sampleTestCases).toEqual([]);
    expect(question.hiddenTestCases).toEqual([]);
    expect(question.supportedLanguages).toEqual([]);
  });

  it("rejects a Database question missing its schema or reference query", async () => {
    const { app } = createTestApp();
    expect((await createContest(app, [sqlQuestion({ sql: undefined })])).status).toBe(400);
    expect(
      (await createContest(app, [sqlQuestion({ sql: { schemaSql: "", solutionSql: SOLUTION, ordered: false } })])).status,
    ).toBe(400);
  });

  it("rejects seed SQL that would create its tables in another database", async () => {
    const { app } = createTestApp();
    const response = await createContest(app, [
      sqlQuestion({ sql: { schemaSql: `CREATE DATABASE x; USE x; ${SEED}`, solutionSql: SOLUTION, ordered: false } }),
    ]);
    expect(response.status).toBe(400);
  });

  it("rejects a reference query that breaks the single-statement policy", async () => {
    const { app } = createTestApp();
    const response = await createContest(app, [
      sqlQuestion({ sql: { schemaSql: SEED, solutionSql: "SELECT 1; DROP DATABASE x;", ordered: false } }),
    ]);
    expect(response.status).toBe(400);
  });

  it("still requires hidden test cases for an ordinary coding question", async () => {
    const { app } = createTestApp();
    const response = await createContest(app, [{ ...codingQuestion(), hiddenTestCases: [] }]);
    expect(response.status).toBe(400);
  });
});

describe("contest Database questions — what students see", () => {
  it("shows the seed schema but never the reference query", async () => {
    const { app, contest } = await liveSqlContest();

    const detail = await request(app).get(`/api/contests/${contest.id}`);
    expect(detail.status).toBe(200);
    const summary = detail.body.contest.questions.find((item: { id: string }) => item.id === "q_sql_1");
    expect(summary.kind).toBe("sql");
    expect(summary.sqlSchema).toContain("CREATE TABLE employees");

    const question = await request(app).get(`/api/contests/${contest.id}/questions/q_sql_1`);
    expect(question.status).toBe(200);
    expect(question.body.question.kind).toBe("sql");
    expect(question.body.question.sqlSchema).toContain("CREATE TABLE employees");
    // The answer key must not reach the student under any field name.
    expect(JSON.stringify(question.body)).not.toContain("salary > 75000");
    expect(JSON.stringify(detail.body)).not.toContain("salary > 75000");
  });
});

describe("contest Database questions — running and submitting", () => {
  it("runs a query and returns the grid instead of stdout", async () => {
    const { app, contest } = await liveSqlContest();
    const response = await request(app)
      .post(`/api/contests/${contest.id}/coding-run`)
      .send({ questionId: "q_sql_1", code: SOLUTION, language: "sql" });
    expect(response.status).toBe(200);
    expect(response.body.result.language).toBe("sql");
    expect(response.body.result.sqlResult).toBeTruthy();
  });

  it("grades a submission inline without the Judge0 queue", async () => {
    const { app, contest, repositories } = await liveSqlContest();
    const submitted = await request(app)
      .post(`/api/contests/${contest.id}/coding-submissions`)
      .send({ questionId: "q_sql_1", code: SOLUTION, language: "sql" });
    expect(submitted.status).toBe(201);

    const submissions = await repositories.submissionRepository.listForAnalytics({});
    const submission = submissions.find((item) => item.contestQuestionId === "q_sql_1");
    expect(submission).toBeTruthy();
    // Finalized on the spot — nothing was queued, so nothing will ever come back to finish it.
    expect(submission!.status).toBe("ACCEPTED");
    expect(submission!.finalizationAppliedAt).not.toBeNull();
    expect(submission!.queueJobId).toBeNull();
    expect(submission!.totalCount).toBe(1);
  });

  it("withholds the expected grid from the student during a contest", async () => {
    const { app, contest, repositories } = await liveSqlContest();
    await request(app)
      .post(`/api/contests/${contest.id}/coding-submissions`)
      .send({ questionId: "q_sql_1", code: "SELECT name FROM employees", language: "sql" });

    const stored = (await repositories.submissionRepository.listForAnalytics({})).find(
      (item) => item.contestQuestionId === "q_sql_1",
    );
    const response = await request(app).get(`/api/submissions/${stored!.id}`);
    expect(response.status).toBe(200);
    expect(response.body.submission.status).toBe("WRONG_ANSWER");
    // The student's own grid is fine to echo back; the reference grid is the answer key and
    // follows the same contest redaction a failing test case does.
    expect(response.body.submission.sqlResult).toBeTruthy();
    expect(response.body.submission.sqlExpected).toBeUndefined();
  });

  it("does not score a Database answer during the live contest", async () => {
    // The platform's rule is that nothing is graded until the attempt ends — a student must never
    // learn mid-contest whether an answer was right. Scoring SQL inline would hand it an instant
    // SOLVED and points that coding questions withhold.
    const { app, contest, repositories } = await liveSqlContest();
    const submitted = await request(app)
      .post(`/api/contests/${contest.id}/coding-submissions`)
      .send({ questionId: "q_sql_1", code: SOLUTION, language: "sql" });
    expect(submitted.status).toBe(201);

    const attempt = await repositories.contestAttemptRepository.getByContestAndUser(
      contest.id,
      "student1@tcetmumbai.in",
    );
    const state = attempt!.questionStates.find((item) => item.questionId === "q_sql_1")!;
    expect(state.finalSubmissionStatus).toBe("ACCEPTED");
    expect(state.passedCount).toBe(1);
    expect(state.status).toBe("ATTEMPTED");
    expect(state.awardedPoints).toBe(0);
    expect(state.solvedAt).toBeNull();
    expect(attempt!.score).toBe(0);
  });

  it("scores the Database answer when results are published", async () => {
    // Submitting the attempt freezes it without grading; publish is the only place points are
    // awarded, for SQL exactly as for coding.
    const { app, contest, repositories } = await liveSqlContest();
    await request(app)
      .post(`/api/contests/${contest.id}/coding-submissions`)
      .send({ questionId: "q_sql_1", code: SOLUTION, language: "sql" });

    const ended = await request(app).post(`/api/contests/${contest.id}/attempts/submit`);
    expect(ended.status).toBe(200);

    const frozen = await repositories.contestAttemptRepository.getByContestAndUser(
      contest.id,
      "student1@tcetmumbai.in",
    );
    expect(frozen!.questionStates.find((item) => item.questionId === "q_sql_1")!.awardedPoints).toBe(0);

    // Publish is only allowed once the contest window has closed. The test clock is frozen at the
    // contest's start, so wind the window back rather than trying to advance time.
    const record = (await repositories.contestRepository.getById(contest.id))!;
    await repositories.contestRepository.save({
      ...record,
      startAt: new Date(record.startAt.getTime() - 3 * 60 * 60_000),
      endAt: new Date(record.endAt.getTime() - 3 * 60 * 60_000),
      registrationOpenAt: new Date(record.registrationOpenAt.getTime() - 3 * 60 * 60_000),
      registrationCloseAt: new Date(record.registrationCloseAt.getTime() - 3 * 60 * 60_000),
    });

    const published = await request(app)
      .patch(`/api/contests/${contest.id}/results`)
      .set(facultyHeaders)
      .send({ resultsPublished: true });
    expect(published.status).toBe(200);

    const attempt = await repositories.contestAttemptRepository.getByContestAndUser(
      contest.id,
      "student1@tcetmumbai.in",
    );
    const state = attempt!.questionStates.find((item) => item.questionId === "q_sql_1")!;
    expect(state.status).toBe("SOLVED");
    expect(state.awardedPoints).toBe(100);
  });
});

describe("contest Database questions — language pairing", () => {
  it("refuses a programming language on a Database question", async () => {
    const { app, contest } = await liveSqlContest();
    const run = await request(app)
      .post(`/api/contests/${contest.id}/coding-run`)
      .send({ questionId: "q_sql_1", code: "print(1)", language: "python" });
    expect(run.status).toBe(400);

    const submit = await request(app)
      .post(`/api/contests/${contest.id}/coding-submissions`)
      .send({ questionId: "q_sql_1", code: "print(1)", language: "python" });
    expect(submit.status).toBe(400);
  });

  it("refuses SQL on an ordinary coding question", async () => {
    const { app, contest } = await liveSqlContest();
    const run = await request(app)
      .post(`/api/contests/${contest.id}/coding-run`)
      .send({ questionId: "q_code_1", code: "SELECT 1", language: "sql" });
    expect(run.status).toBe(400);
  });

  it("refuses a language the coding question does not enable", async () => {
    const { app, contest } = await liveSqlContest();
    const run = await request(app)
      .post(`/api/contests/${contest.id}/coding-run`)
      .send({ questionId: "q_code_1", code: "int main(){}", language: "java" });
    expect(run.status).toBe(400);
  });
});

describe("contest Database questions — sandbox failure", () => {
  /** A sandbox that is down: `grade` rejects rather than returning a verdict. */
  class BrokenSqlExecutor extends StubSqlExecutor {
    override async grade(): Promise<never> {
      throw new Error("sandbox unavailable");
    }
  }

  it("finalizes the submission instead of leaving it queued forever", async () => {
    const { app, contest, repositories } = await liveSqlContest({ sqlExecutor: new BrokenSqlExecutor() });
    const submitted = await request(app)
      .post(`/api/contests/${contest.id}/coding-submissions`)
      .send({ questionId: "q_sql_1", code: SOLUTION, language: "sql" });
    expect(submitted.status).toBe(201);

    const submission = (await repositories.submissionRepository.listForAnalytics({})).find(
      (item) => item.contestQuestionId === "q_sql_1",
    );
    // A thrown grade used to escape past an already-created QUEUED record, leaving a submission
    // nothing would ever finish — and aborting the contest-end auto-submit loop for everyone else.
    expect(submission!.status).toBe("INTERNAL_ERROR");
    expect(submission!.finalizationAppliedAt).not.toBeNull();
  });

  it("still ends the attempt when a pending Database draft cannot be graded", async () => {
    const { app, contest } = await liveSqlContest({ sqlExecutor: new BrokenSqlExecutor() });
    const draft = await request(app)
      .post(`/api/contests/${contest.id}/coding-draft`)
      .send({ questionId: "q_sql_1", code: SOLUTION, language: "sql" });
    expect(draft.status).toBe(200);

    const ended = await request(app).post(`/api/contests/${contest.id}/attempts/submit`);
    expect(ended.status).toBe(200);
  });
});
