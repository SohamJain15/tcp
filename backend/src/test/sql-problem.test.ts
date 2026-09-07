import request from "supertest";
import { describe, expect, it } from "vitest";

import { createTestApp } from "./helpers/create-test-app";

const facultyHeaders = {
  "x-coe-role": "FACULTY",
  "x-coe-email": "faculty1@tcetmumbai.in",
  "x-coe-name": "Prof. Mehta",
};
const studentHeaders = {
  "x-coe-role": "STUDENT",
  "x-coe-email": "student1@tcetmumbai.in",
  "x-coe-name": "Ada Student",
  "x-coe-uid": "1234567",
};

const SEED = "CREATE TABLE students (id INT, name VARCHAR(50));\nINSERT INTO students VALUES (1,'Ada'),(2,'Alan');";
const SOLUTION = "SELECT id, name FROM students ORDER BY id";

function sqlProblemBody(overrides: Record<string, unknown> = {}) {
  return {
    title: "List all students",
    statement: "Select every student ordered by id.",
    inputFormat: "The students table",
    outputFormat: "id and name, ordered by id",
    constraints: ["The table always has at least one row"],
    difficulty: "Easy",
    tags: ["SQL"],
    timeLimitSeconds: 1,
    memoryLimitMb: 256,
    lifecycleState: "Published",
    kind: "sql",
    sql: { schemaSql: SEED, solutionSql: SOLUTION, ordered: true },
    ...overrides,
  };
}

async function createSqlProblem(app: Parameters<typeof request>[0], overrides: Record<string, unknown> = {}) {
  const response = await request(app).post("/api/problems").set(facultyHeaders).send(sqlProblemBody(overrides));
  expect(response.status).toBe(201);
  return response.body.problem;
}

describe("SQL practice problems", () => {
  it("creates a SQL problem without test cases and shows students the schema but not the answer", async () => {
    const { app } = createTestApp();
    const created = await createSqlProblem(app);
    expect(created.kind).toBe("sql");
    expect(created.sql.solutionSql).toBe(SOLUTION);

    const detail = await request(app).get(`/api/problems/${created.id}`).set(studentHeaders);
    expect(detail.status).toBe(200);
    expect(detail.body.problem.kind).toBe("sql");
    // The seed is the statement — a student cannot write the query without reading the tables.
    expect(detail.body.problem.schemaSql).toContain("CREATE TABLE students");
    // The reference query is the answer key and must never reach a student, by any field name.
    expect(JSON.stringify(detail.body.problem)).not.toContain("ORDER BY id");
  });

  it("rejects a coding problem that carries SQL fields, and a SQL problem with no schema", async () => {
    const { app } = createTestApp();
    const mixed = await request(app)
      .post("/api/problems")
      .set(facultyHeaders)
      .send(sqlProblemBody({ kind: "coding", sampleTestCases: [{ input: "1", output: "1" }] }));
    expect(mixed.status).toBe(400);

    const noSchema = await request(app).post("/api/problems").set(facultyHeaders).send(sqlProblemBody({ sql: undefined }));
    expect(noSchema.status).toBe(400);
  });

  it("rejects seed SQL that would create its tables in another database", async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .post("/api/problems")
      .set(facultyHeaders)
      .send(sqlProblemBody({ sql: { schemaSql: `CREATE DATABASE x; USE x; ${SEED}`, solutionSql: SOLUTION, ordered: true } }));
    expect(response.status).toBe(400);
  });

  it("accepts SQL problems through the bulk draft importer alongside coding ones", async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .post("/api/problems/import-draft")
      .set(facultyHeaders)
      .send([
        {
          kind: "sql",
          title: "List all students",
          slug: "list-all-students",
          statement: "Select every student ordered by id.",
          difficulty: "Easy",
          topic: "SQL",
          constraints: ["At least one row"],
          inputFormat: "students",
          outputFormat: "id, name",
          explanation: "",
          timeLimit: 1,
          memoryLimit: 256,
          tags: ["SQL"],
          sql: { schemaSql: SEED, solutionSql: SOLUTION, ordered: true },
        },
        {
          title: "Echo a number",
          slug: "echo-a-number",
          statement: "Read an integer and print it back.",
          difficulty: "Easy",
          topic: "Basics",
          constraints: ["n fits in an int"],
          inputFormat: "n",
          outputFormat: "n",
          explanation: "",
          timeLimit: 1,
          memoryLimit: 256,
          tags: ["Basics"],
          sampleTestCases: [{ input: "5", output: "5" }],
          hiddenTestCases: [{ input: "9", output: "9" }],
        },
      ]);
    expect(response.status).toBe(200);
    expect(response.body.drafts).toHaveLength(2);
    expect(response.body.drafts[0].kind).toBe("sql");
  });

  it("runs a query without judging it and returns the grid rather than stdout", async () => {
    const { app } = createTestApp();
    const problem = await createSqlProblem(app);
    const response = await request(app)
      .post("/api/submissions/run")
      .set(studentHeaders)
      .send({ problemId: problem.id, language: "sql", code: SOLUTION });
    expect(response.status).toBe(200);
    expect(response.body.result.language).toBe("sql");
    expect(response.body.result.sqlResult).toBeTruthy();
  });

  it("grades a submission inline, without the Judge0 queue, and keeps the expected grid for the diff", async () => {
    const { app } = createTestApp();
    const problem = await createSqlProblem(app);
    const submitted = await request(app)
      .post("/api/submissions")
      .set(studentHeaders)
      .send({ problemId: problem.id, language: "sql", code: SOLUTION });
    expect(submitted.status).toBe(202);

    // SQL grading is a millisecond result-set comparison, so the verdict is already final when the
    // client first reads the submission back — there is nothing queued to wait for.
    const detail = await request(app)
      .get(`/api/submissions/${submitted.body.submission_id}`)
      .set(studentHeaders);
    expect(detail.status).toBe(200);
    expect(detail.body.submission.status).toBe("ACCEPTED");
    expect(detail.body.submission.language).toBe("sql");
    expect(detail.body.submission.totalCount).toBe(1);
    // Practice problems show the full diff, which is the point of a SQL problem's feedback.
    expect(detail.body.submission.sqlResult).toBeTruthy();
    expect(detail.body.submission.sqlExpected).toBeTruthy();
  });

  it("marks a query that does not match the reference as wrong", async () => {
    const { app } = createTestApp();
    const problem = await createSqlProblem(app);
    const submitted = await request(app)
      .post("/api/submissions")
      .set(studentHeaders)
      .send({ problemId: problem.id, language: "sql", code: "SELECT name FROM students" });
    expect(submitted.status).toBe(202);
    const detail = await request(app)
      .get(`/api/submissions/${submitted.body.submission_id}`)
      .set(studentHeaders);
    expect(detail.body.submission.status).toBe("WRONG_ANSWER");
  });

  it("refuses a programming language on a SQL problem and SQL on a coding problem", async () => {
    const { app } = createTestApp();
    const sqlProblem = await createSqlProblem(app);
    const wrongLanguage = await request(app)
      .post("/api/submissions/run")
      .set(studentHeaders)
      .send({ problemId: sqlProblem.id, language: "python", code: "print(1)" });
    expect(wrongLanguage.status).toBe(400);

    const codingProblem = await request(app)
      .post("/api/problems")
      .set(facultyHeaders)
      .send({
        title: "Echo a number",
        statement: "Read an integer and print it back.",
        inputFormat: "n",
        outputFormat: "n",
        constraints: ["n fits in an int"],
        difficulty: "Easy",
        tags: ["Basics"],
        timeLimitSeconds: 1,
        memoryLimitMb: 256,
        lifecycleState: "Published",
        sampleTestCases: [{ input: "5", output: "5" }],
        hiddenTestCases: [{ input: "9", output: "9" }],
      });
    expect(codingProblem.status).toBe(201);
    const sqlOnCoding = await request(app)
      .post("/api/submissions/run")
      .set(studentHeaders)
      .send({ problemId: codingProblem.body.problem.id, language: "sql", code: "SELECT 1" });
    expect(sqlOnCoding.status).toBe(400);
  });
});
