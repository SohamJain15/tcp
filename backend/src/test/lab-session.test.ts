import request from "supertest";
import { describe, expect, it } from "vitest";

import { createTestApp } from "./helpers/create-test-app";

/**
 * Lab Session — the assignable, scheduled, proctored assessment surface. Exercised over HTTP with
 * the stub executors. A session is built from a lab, sat within its window, and auto-graded once the
 * window closes.
 */

const facultyHeaders = {
  "x-coe-role": "FACULTY",
  "x-coe-email": "faculty1@tcetmumbai.in",
  "x-coe-name": "Prof. Mehta",
};

// student1: B.E. Computer Engineering, semester 4.
const studentHeaders = {
  "x-coe-role": "STUDENT",
  "x-coe-email": "student1@tcetmumbai.in",
  "x-coe-name": "Student One",
};

const SOLUTION = "SELECT id FROM t ORDER BY id";

async function createLab(app: ReturnType<typeof createTestApp>["app"]) {
  const response = await request(app).post("/api/labs").set(facultyHeaders).send({
    title: "DBMS Lab",
    subject: "DBMS Lab",
    kind: "DBMS",
    department: "B.E. Computer Engineering",
    semester: 4,
    lifecycleState: "Published",
    experiments: [
      {
        kind: "sql",
        number: 1,
        title: "List ids",
        aim: "Select all ids.",
        points: 10,
        schemaSql: "CREATE TABLE t (id INT); INSERT INTO t VALUES (1);",
        solutionSql: SOLUTION,
        ordered: true,
      },
    ],
  });
  return response.body.lab;
}

/** A session live "now" — the test clock starts at 2026-05-07T00:00 UTC. */
function sessionPayload(labId: string, experimentIds: string[], overrides: Record<string, unknown> = {}) {
  return {
    labId,
    experimentIds,
    startAt: "2026-05-06T23:00:00.000Z",
    durationMinutes: 120,
    audience: { department: "B.E. Computer Engineering", division: null, semester: null, rollFrom: null, rollTo: null },
    assignedEmails: [],
    maxViolations: 2,
    lifecycleState: "Published",
    ...overrides,
  };
}

describe("lab session authoring & assignment", () => {
  it("creates a session snapshotting the chosen experiments and assigning the class", async () => {
    const { app } = createTestApp();
    const lab = await createLab(app);
    const response = await request(app)
      .post("/api/lab-sessions")
      .set(facultyHeaders)
      .send(sessionPayload(lab.id, [lab.experiments[0].id]));
    expect(response.status).toBe(201);
    expect(response.body.session.experiments).toHaveLength(1);
    expect(response.body.session.assignedStudents.length).toBeGreaterThan(0);
  });

  it("rejects a session whose experiments do not belong to the lab", async () => {
    const { app } = createTestApp();
    const lab = await createLab(app);
    const response = await request(app)
      .post("/api/lab-sessions")
      .set(facultyHeaders)
      .send(sessionPayload(lab.id, ["exp_does_not_exist"]));
    expect(response.status).toBe(400);
  });
});

describe("lab session attempt", () => {
  async function seedLiveSession(app: ReturnType<typeof createTestApp>["app"]) {
    const lab = await createLab(app);
    const created = await request(app)
      .post("/api/lab-sessions")
      .set(facultyHeaders)
      .send(sessionPayload(lab.id, [lab.experiments[0].id]));
    return { sessionId: created.body.session.id, experimentId: lab.experiments[0].id };
  }

  it("lets an assigned student start, save an answer, and hides the reference query", async () => {
    const { app } = createTestApp();
    const { sessionId, experimentId } = await seedLiveSession(app);

    const list = await request(app).get("/api/lab-sessions/mine").set(studentHeaders);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].computedStatus).toBe("Live");

    const start = await request(app).post(`/api/lab-sessions/mine/${sessionId}/attempts`).set(studentHeaders);
    expect(start.status).toBe(201);
    expect(start.body.session.experiments[0]).not.toHaveProperty("solutionSql");

    const save = await request(app)
      .post(`/api/lab-sessions/mine/${sessionId}/sql-save`)
      .set(studentHeaders)
      .send({ experimentId, sql: SOLUTION });
    expect(save.status).toBe(200);

    // The saved query round-trips (resume after a refresh).
    const detail = await request(app).get(`/api/lab-sessions/mine/${sessionId}`).set(studentHeaders);
    expect(detail.body.session.answers[0].submittedSql).toBe(SOLUTION);
  });

  it("auto-submits after the violation limit is reached", async () => {
    const { app } = createTestApp();
    const { sessionId } = await seedLiveSession(app);
    await request(app).post(`/api/lab-sessions/mine/${sessionId}/attempts`).set(studentHeaders);

    await request(app).post(`/api/lab-sessions/mine/${sessionId}/proctor-events`).set(studentHeaders).send({ type: "TAB_SWITCH" });
    const second = await request(app)
      .post(`/api/lab-sessions/mine/${sessionId}/proctor-events`)
      .set(studentHeaders)
      .send({ type: "TAB_SWITCH" });
    expect(second.body.autoSubmitted).toBe(true);
  });

  it("seals the paper for a student in another department", async () => {
    const { app } = createTestApp();
    const { sessionId } = await seedLiveSession(app);
    const start = await request(app)
      .post(`/api/lab-sessions/mine/${sessionId}/attempts`)
      .set({ "x-coe-role": "STUDENT", "x-coe-email": "student2@tcetmumbai.in", "x-coe-name": "Student Two" });
    // student2 is IT, not assigned → the session is not found for them.
    expect(start.status).toBe(404);
  });
});

describe("lab session grading", () => {
  it("auto-grades a correct SQL answer once the window has closed and results are published", async () => {
    const { app } = createTestApp();
    const lab = await createLab(app);
    // Live now, so the student can start and answer (the test clock is ~2026-05-07T00:00 UTC).
    const created = await request(app)
      .post("/api/lab-sessions")
      .set(facultyHeaders)
      .send(sessionPayload(lab.id, [lab.experiments[0].id]));
    const sessionId = created.body.session.id;

    await request(app).post(`/api/lab-sessions/mine/${sessionId}/attempts`).set(studentHeaders);
    await request(app)
      .post(`/api/lab-sessions/mine/${sessionId}/sql-save`)
      .set(studentHeaders)
      .send({ experimentId: lab.experiments[0].id, sql: SOLUTION });
    await request(app).post(`/api/lab-sessions/mine/${sessionId}/submit`).set(studentHeaders);

    // Move the window into the past by updating the session's start, then publish + read results.
    await request(app)
      .patch(`/api/lab-sessions/${sessionId}`)
      .set(facultyHeaders)
      .send({ startAt: "2026-05-06T20:00:00.000Z", durationMinutes: 30 });
    await request(app).patch(`/api/lab-sessions/${sessionId}/results`).set(facultyHeaders).send({ resultsPublished: true });

    const result = await request(app).get(`/api/lab-sessions/mine/${sessionId}/result`).set(studentHeaders);
    expect(result.status).toBe(200);
    expect(result.body.result.finalScore).toBe(10);
    expect(result.body.result.experiments[0].awardedPoints).toBe(10);
  });
});
