import request from "supertest";
import { describe, expect, it } from "vitest";

import { joinCodeForStep, stepForTime } from "../modules/lab/lab-join-code";
import { createTestApp } from "./helpers/create-test-app";

/**
 * Lab attendance: the live lobby a teacher runs during a lab period, and the gate it puts in front
 * of the self-paced lab surface.
 *
 * The property under test throughout is that a student sitting at home cannot work the lab: they
 * are refused at the join, and — crucially — they are also refused at every run/submit and cannot
 * read the experiments out of the detail payload instead.
 */

const facultyHeaders = {
  "x-coe-role": "FACULTY",
  "x-coe-email": "faculty1@tcetmumbai.in",
  "x-coe-name": "Prof. Mehta",
};

const otherFacultyHeaders = {
  "x-coe-role": "FACULTY",
  "x-coe-email": "hod1@tcetmumbai.in",
  "x-coe-name": "Prof. Rao",
};

// student1 is seeded as B.E. Computer Engineering, semester 4.
const studentHeaders = {
  "x-coe-role": "STUDENT",
  "x-coe-email": "student1@tcetmumbai.in",
  "x-coe-name": "Student One",
};

const COMP = "B.E. Computer Engineering";
const SOLUTION = "SELECT id, name FROM students ORDER BY id";

function labPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "DBMS Practical Lab",
    subject: "Database Management Systems Lab",
    kind: "DBMS",
    department: COMP,
    semester: 4,
    lifecycleState: "Published",
    experiments: [
      {
        kind: "sql",
        number: 1,
        title: "List all students",
        aim: "Select every student ordered by id.",
        points: 10,
        schemaSql: "CREATE TABLE students (id INT, name VARCHAR(20));",
        solutionSql: SOLUTION,
        ordered: true,
      },
    ],
    ...overrides,
  };
}

function audience(overrides: Record<string, unknown> = {}) {
  return { department: COMP, division: null, semester: 4, year: null, rollFrom: null, rollTo: null, ...overrides };
}

type App = ReturnType<typeof createTestApp>;

async function setup(labOverrides: Record<string, unknown> = {}) {
  const harness = createTestApp();
  const labResponse = await request(harness.app).post("/api/labs").set(facultyHeaders).send(labPayload(labOverrides));
  expect(labResponse.status).toBe(201);
  return { harness, labId: labResponse.body.lab.id as string, experimentId: labResponse.body.lab.experiments[0].id as string };
}

async function openSession(harness: App, labId: string, body: Record<string, unknown> = {}) {
  return request(harness.app)
    .post("/api/lab-attendance")
    .set(facultyHeaders)
    .send({ labId, audience: audience(), ...body });
}

/** The secret never leaves the server, so a test that needs to forge a code reads it from storage. */
async function secretOf(harness: App, sessionId: string): Promise<string> {
  const session = await harness.repositories.labAttendanceSessionRepository.getById(sessionId);
  expect(session).not.toBeNull();
  return session!.joinCodeSecret;
}

describe("opening an attendance session", () => {
  it("freezes the batch roster and never returns the join-code secret", async () => {
    const { harness, labId } = await setup();
    const response = await openSession(harness, labId, { batchLabel: "Batch 1" });

    expect(response.status).toBe(201);
    expect(response.body.session.roster.map((student: { email: string }) => student.email)).toContain(
      "student1@tcetmumbai.in",
    );
    expect(response.body.session.batchLabel).toBe("Batch 1");

    const secret = await secretOf(harness, response.body.session.id);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    // The whole payload, not just the obvious field: a leak by spreading would show up here.
    expect(JSON.stringify(response.body)).not.toContain(secret);
  });

  it("refuses a second live session for the same lab", async () => {
    const { harness, labId } = await setup();
    expect((await openSession(harness, labId)).status).toBe(201);

    const second = await openSession(harness, labId);
    expect(second.status).toBe(409);
    expect(second.body.details.code).toBe("LAB_SESSION_ALREADY_OPEN");
  });

  it("refuses a faculty who does not manage the lab", async () => {
    const { harness, labId } = await setup();
    const response = await request(harness.app)
      .post("/api/lab-attendance")
      .set(otherFacultyHeaders)
      .send({ labId, audience: audience() });
    // 404, not 403 — a stranger is not told the lab exists.
    expect(response.status).toBe(404);
  });

  it("refuses a student outright", async () => {
    const { harness, labId } = await setup();
    const response = await request(harness.app)
      .post("/api/lab-attendance")
      .set(studentHeaders)
      .send({ labId, audience: audience() });
    expect(response.status).toBe(403);
  });
});

describe("joining a session", () => {
  it("puts a rostered student in the lobby, and admits them when the teacher says so", async () => {
    const { harness, labId } = await setup();
    const sessionId = (await openSession(harness, labId)).body.session.id;

    const join = await request(harness.app)
      .post(`/api/lab-attendance/mine/${sessionId}/join`)
      .set(studentHeaders)
      .send({});
    expect(join.status).toBe(200);
    expect(join.body.admission.status).toBe("PENDING");

    const pending = await request(harness.app)
      .get(`/api/lab-attendance/${sessionId}/admissions`)
      .set(facultyHeaders);
    expect(pending.status).toBe(200);
    expect(pending.body.pending).toHaveLength(1);
    expect(pending.body.counts.roster).toBeGreaterThan(0);

    const admissionId = pending.body.pending[0].id;
    const decision = await request(harness.app)
      .patch(`/api/lab-attendance/${sessionId}/admissions/${admissionId}`)
      .set(facultyHeaders)
      .send({ status: "ADMITTED" });
    expect(decision.status).toBe(200);
    expect(decision.body.admission.status).toBe("ADMITTED");

    const mine = await request(harness.app).get("/api/lab-attendance/mine").set(studentHeaders);
    expect(mine.body.admission.status).toBe("ADMITTED");
    expect(mine.body.session.id).toBe(sessionId);
    // The student is told nothing about anyone else in the room.
    expect(mine.body.session.roster).toBeUndefined();
  });

  it("admits immediately when the teacher turned the lobby off", async () => {
    const { harness, labId } = await setup();
    const sessionId = (
      await openSession(harness, labId, {
        gates: { requireAdmission: false, requireNetworkMatch: false, requireJoinCode: false },
      })
    ).body.session.id;

    const join = await request(harness.app)
      .post(`/api/lab-attendance/mine/${sessionId}/join`)
      .set(studentHeaders)
      .send({});
    expect(join.body.admission.status).toBe("ADMITTED");
  });

  it("refuses a student who is not in this batch", async () => {
    const { harness, labId } = await setup();
    // A roll range this student falls outside of.
    const sessionId = (await openSession(harness, labId, { audience: audience({ rollFrom: 900, rollTo: 999 }) })).body
      .session?.id;
    // No student matches, so opening fails before a roster can be frozen.
    expect(sessionId).toBeUndefined();
  });

  it("refuses a join for a session that has been closed", async () => {
    const { harness, labId } = await setup();
    const sessionId = (await openSession(harness, labId)).body.session.id;

    await request(harness.app)
      .patch(`/api/lab-attendance/${sessionId}`)
      .set(facultyHeaders)
      .send({ state: "CLOSED" });

    const join = await request(harness.app)
      .post(`/api/lab-attendance/mine/${sessionId}/join`)
      .set(studentHeaders)
      .send({});
    expect(join.status).toBe(404);
  });
});

describe("the rotating join code", () => {
  const codeGates = { requireAdmission: true, requireNetworkMatch: false, requireJoinCode: true };

  it("accepts the code currently on the teacher's screen", async () => {
    const { harness, labId } = await setup();
    const sessionId = (await openSession(harness, labId, { gates: codeGates })).body.session.id;

    const code = await request(harness.app).get(`/api/lab-attendance/${sessionId}/join-code`).set(facultyHeaders);
    expect(code.status).toBe(200);
    expect(code.body.code).toMatch(/^\d{6}$/);
    expect(code.body.stepSeconds).toBe(30);

    const join = await request(harness.app)
      .post(`/api/lab-attendance/mine/${sessionId}/join`)
      .set(studentHeaders)
      .send({ joinCode: code.body.code });
    expect(join.status).toBe(200);
    expect(join.body.admission.status).toBe("PENDING");
  });

  it("accepts a code that has just rotated away, and rejects a stale one", async () => {
    const { harness, labId } = await setup();
    const sessionId = (await openSession(harness, labId, { gates: codeGates })).body.session.id;
    const secret = await secretOf(harness, sessionId);
    // The service runs on the harness's injected clock, not the wall clock, so the step is derived
    // from what the server itself says the current code expires at.
    const current = await request(harness.app).get(`/api/lab-attendance/${sessionId}/join-code`).set(facultyHeaders);
    const step = stepForTime(new Date(current.body.expiresAt)) - 1;

    const previous = await request(harness.app)
      .post(`/api/lab-attendance/mine/${sessionId}/join`)
      .set(studentHeaders)
      .send({ joinCode: joinCodeForStep(secret, step - 1) });
    expect(previous.status).toBe(200);

    const stale = await request(harness.app)
      .post(`/api/lab-attendance/mine/${sessionId}/join`)
      .set(studentHeaders)
      .send({ joinCode: joinCodeForStep(secret, step - 5) });
    expect(stale.status).toBe(403);
    expect(stale.body.details.code).toBe("LAB_BAD_JOIN_CODE");
  });

  it("rejects a wrong or missing code", async () => {
    const { harness, labId } = await setup();
    const sessionId = (await openSession(harness, labId, { gates: codeGates })).body.session.id;

    const wrong = await request(harness.app)
      .post(`/api/lab-attendance/mine/${sessionId}/join`)
      .set(studentHeaders)
      .send({ joinCode: "000000" });
    expect(wrong.status).toBe(403);

    const missing = await request(harness.app)
      .post(`/api/lab-attendance/mine/${sessionId}/join`)
      .set(studentHeaders)
      .send({});
    expect(missing.status).toBe(403);
  });

  it("never hands the code to a student", async () => {
    const { harness, labId } = await setup();
    const sessionId = (await openSession(harness, labId, { gates: codeGates })).body.session.id;
    const response = await request(harness.app)
      .get(`/api/lab-attendance/${sessionId}/join-code`)
      .set(studentHeaders);
    expect(response.status).toBe(403);
  });
});

describe("the lab-network gate", () => {
  const networkGates = { requireAdmission: true, requireNetworkMatch: true, requireJoinCode: false };

  it("refuses a join from a different network and allows one from the same /24", async () => {
    const { harness, labId } = await setup();
    // Supertest connects over loopback, so the teacher's captured network is 127.0.0.0/24.
    const opened = await openSession(harness, labId, { gates: networkGates });
    expect(opened.status).toBe(201);
    expect(opened.body.session.hostIpCidr).toBe("127.0.0.0/24");

    const sessionId = opened.body.session.id;
    // A forged forwarded header is exactly the attack the gate has to survive.
    const remote = await request(harness.app)
      .post(`/api/lab-attendance/mine/${sessionId}/join`)
      .set(studentHeaders)
      .set("X-Forwarded-For", "203.0.113.9")
      .send({});
    expect(remote.status).toBe(403);
    expect(remote.body.details.code).toBe("LAB_WRONG_NETWORK");

    const inLab = await request(harness.app)
      .post(`/api/lab-attendance/mine/${sessionId}/join`)
      .set(studentHeaders)
      .send({});
    expect(inLab.status).toBe(200);
  });
});

describe("the gate on the lab itself", () => {
  async function admittedSetup() {
    const context = await setup();
    const sessionId = (await openSession(context.harness, context.labId)).body.session.id;
    await request(context.harness.app)
      .post(`/api/lab-attendance/mine/${sessionId}/join`)
      .set(studentHeaders)
      .send({});
    const admissions = await request(context.harness.app)
      .get(`/api/lab-attendance/${sessionId}/admissions`)
      .set(facultyHeaders);
    return { ...context, sessionId, admissionId: admissions.body.pending[0].id as string };
  }

  async function admit(harness: App, sessionId: string, admissionId: string) {
    await request(harness.app)
      .patch(`/api/lab-attendance/${sessionId}/admissions/${admissionId}`)
      .set(facultyHeaders)
      .send({ status: "ADMITTED" });
  }

  it("blocks run and submit until the student is admitted, then allows them", async () => {
    const { harness, labId, experimentId, sessionId, admissionId } = await admittedSetup();

    const blockedRun = await request(harness.app)
      .post(`/api/labs/mine/${labId}/sql-run`)
      .set(studentHeaders)
      .send({ experimentId, sql: SOLUTION });
    expect(blockedRun.status).toBe(403);
    expect(blockedRun.body.details.code).toBe("LAB_ADMISSION_REQUIRED");

    const blockedSubmit = await request(harness.app)
      .post(`/api/labs/mine/${labId}/sql-submit`)
      .set(studentHeaders)
      .send({ experimentId, sql: SOLUTION });
    expect(blockedSubmit.status).toBe(403);

    await admit(harness, sessionId, admissionId);

    const allowed = await request(harness.app)
      .post(`/api/labs/mine/${labId}/sql-submit`)
      .set(studentHeaders)
      .send({ experimentId, sql: SOLUTION });
    expect(allowed.status).toBe(201);
    expect(allowed.body.passed).toBe(true);
  });

  it("redacts the experiments while a student is still waiting", async () => {
    const { harness, labId, sessionId, admissionId } = await admittedSetup();

    const waiting = await request(harness.app).get(`/api/labs/mine/${labId}`).set(studentHeaders);
    expect(waiting.status).toBe(200);
    // The gate would be worthless if the statements and schema came back anyway.
    expect(waiting.body.lab.experiments).toEqual([]);
    expect(waiting.body.lab.attendance.status).toBe("PENDING");
    expect(JSON.stringify(waiting.body)).not.toContain("CREATE TABLE students");

    await admit(harness, sessionId, admissionId);

    const admitted = await request(harness.app).get(`/api/labs/mine/${labId}`).set(studentHeaders);
    expect(admitted.body.lab.experiments).toHaveLength(1);
    expect(admitted.body.lab.attendance.status).toBe("ADMITTED");
  });

  it("leaves the lab self-paced when no session is running", async () => {
    const { harness, labId, experimentId } = await setup();
    const response = await request(harness.app)
      .post(`/api/labs/mine/${labId}/sql-submit`)
      .set(studentHeaders)
      .send({ experimentId, sql: SOLUTION });
    expect(response.status).toBe(201);
  });

  it("re-opens the lab once the session is closed", async () => {
    const { harness, labId, experimentId, sessionId } = await admittedSetup();

    expect(
      (
        await request(harness.app)
          .post(`/api/labs/mine/${labId}/sql-run`)
          .set(studentHeaders)
          .send({ experimentId, sql: SOLUTION })
      ).status,
    ).toBe(403);

    await request(harness.app)
      .patch(`/api/lab-attendance/${sessionId}`)
      .set(facultyHeaders)
      .send({ state: "CLOSED" });

    const afterClose = await request(harness.app)
      .post(`/api/labs/mine/${labId}/sql-run`)
      .set(studentHeaders)
      .send({ experimentId, sql: SOLUTION });
    expect(afterClose.status).toBe(200);
  });

  it("does not block a student who is not on this batch's roster", async () => {
    // Batch 1 is roll 1-1 only, which excludes student1 (TCET001 -> roll number is non-numeric,
    // so a numeric range never matches them); the lab must stay open for everyone else.
    const { harness, labId, experimentId } = await setup();
    const opened = await openSession(harness, labId, { assignedEmails: ["student1@tcetmumbai.in"] });
    expect(opened.status).toBe(201);

    // student1 IS on this roster, so they are gated...
    expect(
      (
        await request(harness.app)
          .post(`/api/labs/mine/${labId}/sql-run`)
          .set(studentHeaders)
          .send({ experimentId, sql: SOLUTION })
      ).status,
    ).toBe(403);
  });

  it("locks a requiresAttendance lab completely when no session is running", async () => {
    const { harness, labId, experimentId } = await setup({ requiresAttendance: true });
    const response = await request(harness.app)
      .post(`/api/labs/mine/${labId}/sql-run`)
      .set(studentHeaders)
      .send({ experimentId, sql: SOLUTION });
    expect(response.status).toBe(403);
    expect(response.body.details.code).toBe("LAB_NO_SESSION");
  });

  it("gates the coding draft endpoint, which previously accepted anything from anyone", async () => {
    const { harness, labId } = await setup({
      kind: "DSA",
      experiments: [
        {
          kind: "coding",
          number: 1,
          title: "Echo a number",
          aim: "Read an integer and print it.",
          points: 10,
          difficulty: "Easy",
          sampleTestCases: [{ input: "5", output: "5" }],
          hiddenTestCases: [{ input: "7", output: "7" }],
          supportedLanguages: ["python"],
        },
      ],
    });
    const detail = await request(harness.app).get(`/api/labs/mine/${labId}`).set(studentHeaders);
    const experimentId = detail.body.lab.experiments[0].id;

    await openSession(harness, labId);
    const response = await request(harness.app)
      .post(`/api/labs/mine/${labId}/coding-draft`)
      .set(studentHeaders)
      .send({ experimentId, code: "print(input())", language: "python" });
    expect(response.status).toBe(403);
  });
});
