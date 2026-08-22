import request from "supertest";
import { describe, expect, it } from "vitest";

import { createTestApp } from "./helpers/create-test-app";

/**
 * DBMS Lab, catalog + self-paced SQL solving, exercised over HTTP with the stub SQL executor
 * (which grades ACCEPTED when the student's query text matches the reference). These assert the
 * shape of the flow — authoring, dept/semester-scoped visibility, the reference query never
 * reaching a student, and that a solve stays solved.
 */

const facultyHeaders = {
  "x-coe-role": "FACULTY",
  "x-coe-email": "faculty1@tcetmumbai.in",
  "x-coe-name": "Prof. Mehta",
};

// student1 is seeded as B.E. Computer Engineering, semester 4.
const studentHeaders = {
  "x-coe-role": "STUDENT",
  "x-coe-email": "student1@tcetmumbai.in",
  "x-coe-name": "Student One",
};

// student2 is seeded as B.E. Information Technology, semester 4.
const otherDeptStudentHeaders = {
  "x-coe-role": "STUDENT",
  "x-coe-email": "student2@tcetmumbai.in",
  "x-coe-name": "Student Two",
};

const SOLUTION = "SELECT id, name FROM students ORDER BY id";

function labPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "DBMS Practical Lab",
    subject: "Database Management Systems Lab",
    kind: "DBMS",
    department: "B.E. Computer Engineering",
    semester: 4,
    lifecycleState: "Published",
    experiments: [
      {
        kind: "sql",
        number: 1,
        title: "List all students",
        aim: "Select every student ordered by id.",
        points: 10,
        schemaSql: "CREATE TABLE students (id INT, name VARCHAR(20)); INSERT INTO students VALUES (1,'amy');",
        solutionSql: SOLUTION,
        ordered: true,
      },
    ],
    ...overrides,
  };
}

async function createLab(app: ReturnType<typeof createTestApp>["app"], overrides = {}) {
  const response = await request(app).post("/api/labs").set(facultyHeaders).send(labPayload(overrides));
  return response;
}

describe("lab authoring", () => {
  it("creates a DBMS lab and assigns experiment ids", async () => {
    const { app } = createTestApp();
    const response = await createLab(app);
    expect(response.status).toBe(201);
    expect(response.body.lab.experiments[0].id).toMatch(/^exp_/);
    expect(response.body.lab.kind).toBe("DBMS");
  });

  it("rejects a lab with no experiments", async () => {
    const { app } = createTestApp();
    const response = await createLab(app, { experiments: [] });
    expect(response.status).toBe(400);
  });

  it("rejects a sql experiment missing the reference query", async () => {
    const { app } = createTestApp();
    const response = await createLab(app, {
      experiments: [
        { kind: "sql", number: 1, title: "x", aim: "y", points: 5, schemaSql: "CREATE TABLE t(a INT);", solutionSql: "", ordered: false },
      ],
    });
    expect(response.status).toBe(400);
  });
});

describe("lab student catalog", () => {
  it("lists a published lab for a student in the same department and hides the reference query", async () => {
    const { app } = createTestApp();
    await createLab(app);

    const list = await request(app).get("/api/labs/mine").set(studentHeaders);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    const labId = list.body.items[0].id;

    const detail = await request(app).get(`/api/labs/mine/${labId}`).set(studentHeaders);
    expect(detail.status).toBe(200);
    const experiment = detail.body.lab.experiments[0];
    expect(experiment.schemaSql).toContain("CREATE TABLE"); // schema is shown
    expect(experiment).not.toHaveProperty("solutionSql"); // the answer is not
    expect(detail.body.lab.progress[0].passed).toBe(false);
  });

  it("hides a lab from a student in another department", async () => {
    const { app } = createTestApp();
    await createLab(app);
    const list = await request(app).get("/api/labs/mine").set(otherDeptStudentHeaders);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(0);
  });

  it("hides a Draft lab from students", async () => {
    const { app } = createTestApp();
    await createLab(app, { lifecycleState: "Draft" });
    const list = await request(app).get("/api/labs/mine").set(studentHeaders);
    expect(list.body.items).toHaveLength(0);
  });
});

const codingLabPayload = {
  title: "DSA Practical Lab",
  subject: "Data Structures Lab",
  kind: "DSA",
  department: "B.E. Computer Engineering",
  semester: 4,
  lifecycleState: "Published",
  experiments: [
    {
      kind: "coding",
      number: 1,
      title: "Echo a number",
      aim: "Read a number and print it.",
      points: 20,
      difficulty: "Easy",
      constraints: "",
      inputFormat: "",
      outputFormat: "",
      timeLimitSeconds: 2,
      memoryLimitMb: 256,
      supportedLanguages: ["python"],
      sampleTestCases: [{ input: "5", output: "5" }],
      hiddenTestCases: [{ input: "9", output: "9" }],
    },
  ],
};

describe("lab coding run and submit", () => {
  it("runs and submits a coding experiment, and marks it solved once judged", async () => {
    const { app, services } = createTestApp();
    await request(app).post("/api/labs").set(facultyHeaders).send(codingLabPayload);

    const list = await request(app).get("/api/labs/mine").set(studentHeaders);
    const labId = list.body.items[0].id;
    const detail = await request(app).get(`/api/labs/mine/${labId}`).set(studentHeaders);
    const experiment = detail.body.lab.experiments[0];
    expect(experiment.kind).toBe("coding");
    expect(experiment).not.toHaveProperty("hiddenTestCases"); // hidden tests never reach the student
    expect(experiment.sampleTestCases).toHaveLength(1);

    const run = await request(app)
      .post(`/api/labs/mine/${labId}/coding-run`)
      .set(studentHeaders)
      .send({ experimentId: experiment.id, code: "print(input())", language: "python" });
    expect(run.status).toBe(200);
    expect(run.body.result.status).toBe("ACCEPTED"); // the stub accepts ordinary code

    const submit = await request(app)
      .post(`/api/labs/mine/${labId}/coding-submit`)
      .set(studentHeaders)
      .send({ experimentId: experiment.id, code: "print(input())", language: "python" });
    expect(submit.status).toBe(201);
    expect(submit.body.submissionId).toBeDefined();

    // Drive the (stub) judge worker, then the experiment should read as solved.
    await services.submissionService.processQueuedSubmission(submit.body.submissionId);

    const after = await request(app).get(`/api/labs/mine/${labId}`).set(studentHeaders);
    expect(after.body.lab.progress[0].passed).toBe(true);
    expect(after.body.lab.progress[0].awardedPoints).toBe(20);
  });

  it("rejects a language the experiment does not allow", async () => {
    const { app } = createTestApp();
    await request(app).post("/api/labs").set(facultyHeaders).send(codingLabPayload);
    const list = await request(app).get("/api/labs/mine").set(studentHeaders);
    const labId = list.body.items[0].id;
    const detail = await request(app).get(`/api/labs/mine/${labId}`).set(studentHeaders);

    const run = await request(app)
      .post(`/api/labs/mine/${labId}/coding-run`)
      .set(studentHeaders)
      .send({ experimentId: detail.body.lab.experiments[0].id, code: "x", language: "java" });
    expect(run.status).toBe(400);
  });
});

describe("lab SQL run and submit", () => {
  async function seedAndGetExperiment(app: ReturnType<typeof createTestApp>["app"]) {
    await createLab(app);
    const list = await request(app).get("/api/labs/mine").set(studentHeaders);
    const labId = list.body.items[0].id;
    const detail = await request(app).get(`/api/labs/mine/${labId}`).set(studentHeaders);
    return { labId, experimentId: detail.body.lab.experiments[0].id };
  }

  it("runs a query and returns a result grid", async () => {
    const { app } = createTestApp();
    const { labId, experimentId } = await seedAndGetExperiment(app);
    const response = await request(app)
      .post(`/api/labs/mine/${labId}/sql-run`)
      .set(studentHeaders)
      .send({ experimentId, sql: "SELECT 1" });
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.result.columns).toBeDefined();
  });

  it("accepts a correct submission, awards points, and keeps it solved after a later wrong one", async () => {
    const { app } = createTestApp();
    const { labId, experimentId } = await seedAndGetExperiment(app);

    const correct = await request(app)
      .post(`/api/labs/mine/${labId}/sql-submit`)
      .set(studentHeaders)
      .send({ experimentId, sql: SOLUTION });
    expect(correct.status).toBe(201);
    expect(correct.body.passed).toBe(true);
    expect(correct.body.awardedPoints).toBe(10);

    const wrong = await request(app)
      .post(`/api/labs/mine/${labId}/sql-submit`)
      .set(studentHeaders)
      .send({ experimentId, sql: "SELECT name FROM students" });
    expect(wrong.body.passed).toBe(false);

    // The experiment stays solved and keeps the awarded points.
    const detail = await request(app).get(`/api/labs/mine/${labId}`).set(studentHeaders);
    expect(detail.body.lab.progress[0].passed).toBe(true);
    expect(detail.body.lab.progress[0].awardedPoints).toBe(10);
  });
});
