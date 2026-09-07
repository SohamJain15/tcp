import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createTestApp } from "./helpers/create-test-app";
import { InMemoryClassrooms } from "./helpers/in-memory-classrooms";
import {
  createClassroomService,
  classroomNetwork,
} from "../modules/classroom/classroom.service";
import { StubExecutionProvider } from "../execution/stub-execution-provider";
import { StubSqlExecutor } from "../execution/sql/stub-sql-executor";
import {
  classroomHistoryHtml,
  classroomHistoryPdf,
  gradebookCsv,
} from "../modules/classroom/classroom-report";
import { gradeAverage } from "../modules/classroom/classroom.model";
import { resolveClientIpFromChain } from "../shared/utils/client-ip";
import type { AuthenticatedUser } from "../shared/types/auth";

const faculty: AuthenticatedUser = {
  role: "FACULTY",
  email: "faculty1@tcetmumbai.in",
  name: "Teacher",
};
const student: AuthenticatedUser = {
  role: "STUDENT",
  email: "student1@tcetmumbai.in",
  name: "Student",
};
const other: AuthenticatedUser = {
  ...student,
  email: "student2@tcetmumbai.in",
};
const start = "2026-09-08T04:30:00.000Z";
const sessionId = "ba4e7c78-89c5-4c70-bf2d-805749b6978c";
function payload() {
  return {
    requestKey: randomUUID(),
    title: "Database Lab",
    subject: "DBMS",
    kind: "DBMS",
    department: "B.E. Computer Engineering",
    semester: 4,
    batch: "A1",
    lifecycleState: "Published",
    experiments: [
      {
        id: "exp1",
        number: 1,
        title: "Read students",
        aim: "Select rows",
        points: 100,
        kind: "sql",
        schemaSql: "CREATE TABLE students (id INT)",
        solutionSql: "SELECT * FROM students",
        ordered: false,
      },
    ],
    sessions: [
      {
        id: sessionId,
        title: "Practical 1",
        startAt: start,
        durationMinutes: 60,
        experimentIds: ["exp1"],
        language: "sql",
      },
    ],
  };
}
function setup() {
  const harness = createTestApp();
  const repository = new InMemoryClassrooms();
  const sqlExecutor = new StubSqlExecutor();
  const executionProvider = new StubExecutionProvider();
  let time = Date.parse(start) - 3600000;
  const service = createClassroomService({
    repository,
    userRepository: harness.repositories.userRepository,
    sqlExecutor,
    executionProvider,
    now: () => new Date(time),
  });
  return {
    ...harness,
    service,
    repository,
    sqlExecutor,
    executionProvider,
    setTime: (value: number) => {
      time = value;
    },
  };
}
async function active() {
  const h = setup();
  const room = await h.service.create(faculty, payload());
  await h.service.join(student, room.joinCode!);
  h.setTime(Date.parse(start));
  await h.service.activate(faculty, room.id, sessionId, "10.20.30.4");
  await h.service.enter(student, room.id, sessionId, "10.20.30.8");
  return { ...h, room };
}
function work(overrides: Record<string, unknown> = {}) {
  return {
    requestKey: randomUUID(),
    experimentId: "exp1",
    mode: "official",
    action: "submit",
    language: "sql",
    code: "SELECT * FROM students",
    ...overrides,
  };
}

describe("classroom enrollment and scheduling", () => {
  it("creates classroom and schedule atomically and makes retried creation/join idempotent", async () => {
    const h = setup();
    const input = payload();
    const [one, two] = await Promise.all([
      h.service.create(faculty, input),
      h.service.create(faculty, input),
    ]);
    expect(one.id).toBe(two.id);
    expect(h.repository.rooms.size).toBe(1);
    await Promise.all([
      h.service.join(student, one.joinCode!),
      h.service.join(student, one.joinCode!.toLowerCase()),
    ]);
    expect((await h.repository.get(one.id))!.members).toHaveLength(1);
    const detail = await h.service.detail(student, one.id);
    expect(JSON.stringify(detail)).not.toContain("solutionSql");
    expect(JSON.stringify(detail)).not.toContain("network");
    expect(detail.classroom.sessions).toHaveLength(1);
  });
  it("rejects mismatched cohorts, owners, unknown members, SQL/coding mixtures, and overlapping schedules", async () => {
    const h = setup();
    const room = await h.service.create(faculty, payload());
    await h.repositories.userRepository.update(student.email, { semester: 3 });
    await expect(h.service.join(student, room.joinCode!)).rejects.toThrow(
      "department and semester",
    );
    await expect(h.service.detail(other, room.id)).rejects.toThrow("Join");
    await expect(
      h.service.detail({ ...faculty, email: "another@tcetmumbai.in" }, room.id),
    ).rejects.toThrow("manage");
    const mixed = { ...payload(), kind: "DSA" };
    await expect(h.service.create(faculty, mixed)).rejects.toThrow(
      "Experiment type",
    );
    const input = payload();
    input.sessions.push({ ...input.sessions[0], id: randomUUID() });
    await expect(h.service.create(faculty, input)).rejects.toThrow("overlap");
    expect(h.repository.rooms.size).toBe(1);
  });
  it("snapshots experiments, locks started sessions, and prevents replacing one through the create endpoint", async () => {
    const h = await active();
    const input = payload();
    input.experiments[0].title = "Updated source";
    await h.service.update(faculty, h.room.id, input);
    expect(
      (await h.repository.get(h.room.id))!.sessions[0].experiments[0].title,
    ).toBe("Read students");
    await expect(
      h.service.schedule(
        faculty,
        h.room.id,
        { ...input.sessions[0], startAt: "2026-09-10T04:30:00Z" },
        sessionId,
      ),
    ).rejects.toThrow("Started");
    await expect(
      h.service.schedule(faculty, h.room.id, {
        ...input.sessions[0],
        startAt: "2026-09-10T04:30:00Z",
      }),
    ).rejects.toThrow("already exists");
  });
});
describe("attendance and session-scoped work", () => {
  it("enforces coding language selection and keeps hidden evaluation output out of saved work", async () => {
    const h = setup();
    const input = {
      ...payload(),
      kind: "DSA",
      experiments: [
        {
          id: "exp1",
          kind: "coding",
          number: 1,
          title: "Echo",
          aim: "Echo a number",
          points: 100,
          supportedLanguages: ["python", "java"],
          sampleTestCases: [{ input: "1", output: "1" }],
          hiddenTestCases: [{ input: "secret-input", output: "secret-answer" }],
        },
      ],
      sessions: payload().sessions.map((s) => ({ ...s, language: "python" })),
    };
    const room = await h.service.create(faculty, input);
    await h.service.join(student, room.joinCode!);
    h.setTime(Date.parse(start));
    await h.service.activate(faculty, room.id, sessionId, "10.20.30.4");
    await h.service.enter(student, room.id, sessionId, "10.20.30.8");
    vi.spyOn(h.executionProvider, "executeRun").mockResolvedValue({
      status: "ACCEPTED",
      stdout: "1",
      runtimeMs: 2,
      memoryKb: 10,
      passedCount: 1,
      totalCount: 1,
      provider: "test",
    });
    vi.spyOn(h.executionProvider, "executeSubmission").mockResolvedValue({
      status: "WRONG_ANSWER",
      stdout: "secret-answer",
      runtimeMs: 2,
      memoryKb: 10,
      passedCount: 1,
      totalCount: 2,
      provider: "test",
      failedTest: {
        index: 1,
        input: "secret-input",
        expectedOutput: "secret-answer",
        actualOutput: "secret-output",
        isHidden: true,
        status: "WRONG_ANSWER",
      },
    });
    await expect(
      h.service.work(
        student,
        room.id,
        sessionId,
        work({ language: "java", code: "class Main {}" }),
        "10.20.30.8",
      ),
    ).rejects.toThrow("teacher-selected");
    await h.service.work(
      student,
      room.id,
      sessionId,
      work({ language: "python", code: "print(input())" }),
      "10.20.30.8",
    );
    const detail = await h.service.detail(student, room.id);
    expect(detail.work[0].output?.stdout).toBe("1");
    expect(detail.work[0].output?.evaluationStatus).toBe("WRONG_ANSWER");
    expect(JSON.stringify(detail)).not.toContain("secret-");
    expect(detail.classroom.grades).toHaveLength(0);
  });
  it("requires activation, exact public IPs or private subnet, and the scheduled window", async () => {
    const h = setup();
    const room = await h.service.create(faculty, payload());
    await h.service.join(student, room.joinCode!);
    await expect(
      h.service.activate(faculty, room.id, sessionId, "203.0.113.8"),
    ).rejects.toThrow("scheduled window");
    h.setTime(Date.parse(start));
    await expect(
      h.service.enter(student, room.id, sessionId, "203.0.113.8"),
    ).rejects.toThrow("not active");
    await expect(
      h.service.activate(faculty, room.id, sessionId, null),
    ).rejects.toThrow("network");
    await h.service.activate(faculty, room.id, sessionId, "203.0.113.8");
    await expect(
      h.service.enter(student, room.id, sessionId, "203.0.113.9"),
    ).rejects.toThrow("network");
    await Promise.all([
      h.service.enter(student, room.id, sessionId, "203.0.113.8"),
      h.service.enter(student, room.id, sessionId, "::ffff:203.0.113.8"),
    ]);
    expect(
      (await h.repository.get(room.id))!.sessions[0].attendance,
    ).toHaveLength(1);
    h.setTime(Date.parse(start) + 3600000);
    await expect(
      h.service.work(student, room.id, sessionId, work(), "203.0.113.8"),
    ).rejects.toThrow("not active");
    expect(
      (await h.service.detail(student, room.id)).classroom.sessions[0]
        .attendance[0].year,
    ).toBe(2);
    expect(classroomNetwork("10.20.30.4")).toBe("10.20.30.0/24");
    expect(classroomNetwork("2001:db8::1")).toBe("2001:db8::1/128");
  });
  it("does not trust forged forwarded headers from a direct peer or a forged left prefix", () => {
    expect(
      resolveClientIpFromChain(["10.20.30.4"], "198.51.100.8", ["127.0.0.1"]),
    ).toBe("198.51.100.8");
    expect(
      resolveClientIpFromChain(["10.20.30.4", "198.51.100.8"], "127.0.0.1", [
        "127.0.0.1",
      ]),
    ).toBe("198.51.100.8");
    expect(
      resolveClientIpFromChain(["10.20.30.4", "malformed"], "127.0.0.1", [
        "127.0.0.1",
      ]),
    ).toBeNull();
  });
  it("preserves roster absences and adds eligible late joins on entry", async () => {
    const h = setup();
    const room = await h.service.create(faculty, payload());
    await h.repositories.userRepository.update(other.email, {
      department: "B.E. Computer Engineering",
      semester: 4,
    });
    await h.service.join(student, room.joinCode!);
    h.setTime(Date.parse(start));
    await h.service.activate(faculty, room.id, sessionId, "10.20.30.4");
    await h.service.join(other, room.joinCode!);
    await h.service.enter(other, room.id, sessionId, "10.20.30.8");
    const session = (await h.repository.get(room.id))!.sessions[0];
    expect(session.roster).toHaveLength(2);
    expect(session.attendance.map((a) => a.email)).toEqual([other.email]);
    await h.service.remove(faculty, room.id, other.email);
    await expect(
      h.service.work(other, room.id, sessionId, work(), "10.20.30.8"),
    ).rejects.toThrow("Join");
    expect(
      (await h.repository.get(room.id))!.sessions[0].attendance,
    ).toHaveLength(1);
  });
  it("counts failed explicit submissions only; preserves drafts, versions, and separate later practice", async () => {
    const h = await active();
    await h.service.work(
      student,
      h.room.id,
      sessionId,
      work({ action: "draft", code: "draft" }),
      "10.20.30.8",
    );
    await h.service.work(
      student,
      h.room.id,
      sessionId,
      work({ action: "run" }),
      "10.20.30.8",
    );
    expect(
      (await h.repository.work(h.room.id)).filter((w) => w.action === "submit"),
    ).toHaveLength(0);
    const bad = work({ code: "runtime_error" });
    await Promise.all([
      h.service.work(student, h.room.id, sessionId, bad, "10.20.30.8"),
      h.service.work(student, h.room.id, sessionId, bad, "10.20.30.8"),
    ]);
    expect(
      (await h.repository.work(h.room.id)).filter((w) => w.action === "submit"),
    ).toHaveLength(1);
    await h.service.work(student, h.room.id, sessionId, work(), "10.20.30.8");
    await expect(
      h.service.work(
        student,
        h.room.id,
        sessionId,
        work({ mode: "practice" }),
        null,
      ),
    ).rejects.toThrow("Practice opens");
    await h.service.close(faculty, h.room.id, sessionId);
    await h.service.work(
      student,
      h.room.id,
      sessionId,
      work({ mode: "practice", code: "SELECT 2" }),
      null,
    );
    const detail = await h.service.detail(student, h.room.id);
    expect(
      detail.work.filter((w) => w.mode === "official" && w.action === "submit"),
    ).toHaveLength(2);
    expect(
      detail.work.find((w) => w.code === "runtime_error")!.output!.status,
    ).toBe("RUNTIME_ERROR");
    expect(detail.drafts[0].code).toBe("draft");
    expect(detail.classroom.grades).toHaveLength(0);
  });
  it("rejects off-network requests, foreign experiments, wrong languages, empty submissions and unknown sessions", async () => {
    const h = await active();
    for (const action of ["run", "draft", "submit"])
      await expect(
        h.service.work(
          student,
          h.room.id,
          sessionId,
          work({ action }),
          "8.8.8.8",
        ),
      ).rejects.toThrow("network");
    await expect(
      h.service.work(
        student,
        h.room.id,
        sessionId,
        work({ language: "python" }),
        "10.20.30.8",
      ),
    ).rejects.toThrow("teacher-selected");
    await expect(
      h.service.work(
        student,
        h.room.id,
        sessionId,
        work({ experimentId: "other" }),
        "10.20.30.8",
      ),
    ).rejects.toThrow("not selected");
    await expect(
      h.service.work(
        student,
        h.room.id,
        sessionId,
        work({ code: " " }),
        "10.20.30.8",
      ),
    ).rejects.toThrow("Write code");
    await expect(
      h.service.work(student, h.room.id, randomUUID(), work(), "10.20.30.8"),
    ).rejects.toThrow("not found");
  });
  it("persists code before execution and attaches delayed results to their exact submission", async () => {
    const h = await active();
    let release!: () => void;
    vi.spyOn(h.sqlExecutor, "run").mockImplementation(
      async ({ studentSql }) => {
        if (studentSql === "first")
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        return {
          ok: true,
          timedOut: false,
          runtimeMs: 1,
          result: {
            columns: ["value"],
            rows: [[studentSql]],
            truncated: false,
          },
        };
      },
    );
    const first = h.service.work(
      student,
      h.room.id,
      sessionId,
      work({ code: "first" }),
      "10.20.30.8",
    );
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    expect((await h.repository.work(h.room.id))[0].output).toBeNull();
    await h.service.work(
      student,
      h.room.id,
      sessionId,
      work({ code: "second" }),
      "10.20.30.8",
    );
    h.setTime(Date.parse(start) + 3600000);
    release();
    await first;
    const records = await h.repository.work(h.room.id);
    expect(records.map((w) => [w.code, w.output?.table?.rows[0][0]])).toEqual([
      ["first", "first"],
      ["second", "second"],
    ]);
  });
});
describe("gradebook and reports", () => {
  it("validates manual marks, handles zero vs blank, publishes immediately, audits edits and exports safely", async () => {
    const h = await active();
    await h.service.grade(faculty, h.room.id, {
      email: student.email,
      experimentId: "exp1",
      mark: 0,
    });
    expect((await h.service.detail(student, h.room.id)).classroom.average).toBe(
      0,
    );
    await expect(
      h.service.grade(faculty, h.room.id, {
        email: student.email,
        experimentId: "exp1",
        mark: 101,
      }),
    ).rejects.toThrow();
    await expect(
      h.service.grade(student, h.room.id, {
        email: student.email,
        experimentId: "exp1",
        mark: 100,
      }),
    ).rejects.toThrow("manage");
    await h.service.grade(faculty, h.room.id, {
      email: student.email,
      experimentId: "exp1",
      mark: null,
    });
    expect(
      (await h.service.detail(student, h.room.id)).classroom.average,
    ).toBeNull();
    expect((await h.repository.get(h.room.id))!.gradeAudit).toHaveLength(2);
    expect(gradeAverage([{ mark: 0 }, { mark: 100 }, { mark: null }])).toBe(50);
    const detail = await h.service.detail(faculty, h.room.id);
    detail.classroom.members![0].name = '=HYPERLINK("evil")';
    expect(gradebookCsv(detail)).toContain('"\'=HYPERLINK(""evil"")"');
  });
  it("keeps one grade per experiment when that experiment is scheduled again", async () => {
    const h = await active();
    await h.service.grade(faculty, h.room.id, {
      email: student.email,
      experimentId: "exp1",
      mark: 85,
    });
    await h.service.schedule(faculty, h.room.id, {
      ...payload().sessions[0],
      id: randomUUID(),
      startAt: "2026-09-09T04:30:00Z",
    });
    const detail = await h.service.detail(student, h.room.id);
    expect(detail.classroom.sessions).toHaveLength(2);
    expect(detail.classroom.grades).toHaveLength(1);
    expect(detail.classroom.average).toBe(85);
  });
  it("escapes code and identity data, retains matching SQL tables and selects attended sessions for PDF", async () => {
    const h = await active();
    await h.service.work(
      student,
      h.room.id,
      sessionId,
      work({ code: "SELECT '<script>alert(1)</script>'" }),
      "10.20.30.8",
    );
    const detail = await h.service.detail(student, h.room.id);
    const html = classroomHistoryHtml(detail, student.email, [sessionId]);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Roll no: TCET001");
    expect(html).toContain("Batch: A1");
    expect(html).toContain("Year: 2");
    expect(html).toContain("<table>");
    expect(
      classroomHistoryHtml(detail, student.email, [randomUUID()]),
    ).not.toContain("SELECT");
  });
  it("renders a real PDF with long code, SQL tables and errors", async () => {
    const h = await active();
    await h.service.work(
      student,
      h.room.id,
      sessionId,
      work({ code: "SELECT 1;\n".repeat(500) }),
      "10.20.30.8",
    );
    const detail = await h.service.detail(student, h.room.id);
    detail.work[0].output!.table = {
      columns: ["id", "text"],
      rows: Array.from({ length: 100 }, (_, i) => [i, "row ".repeat(40)]),
      truncated: true,
    };
    detail.work[0].output!.stderr = "Example error";
    const pdf = await classroomHistoryPdf(
      classroomHistoryHtml(detail, student.email, []),
    );
    if (process.env.CLASSROOM_REPORT_ARTIFACT)
      await writeFile(process.env.CLASSROOM_REPORT_ARTIFACT, pdf);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(10000);
  }, 30000);
});
describe("HTTP contracts", () => {
  it("exposes classroom creation and enrollment, hides old routes and denies student grading", async () => {
    const h = createTestApp({
      classroomNow: () => new Date(Date.parse(start) - 3600000),
    });
    const headers = (user: AuthenticatedUser) => ({
      "x-coe-role": user.role,
      "x-coe-email": user.email,
      "x-coe-name": user.name,
    });
    const created = await request(h.app)
      .post("/api/classrooms")
      .set(headers(faculty))
      .send(payload());
    expect(created.status).toBe(201);
    const id = created.body.classroom.id;
    expect(
      (
        await request(h.app)
          .post("/api/classrooms/join")
          .set(headers(student))
          .send({ code: created.body.classroom.joinCode })
      ).status,
    ).toBe(200);
    expect(
      (await request(h.app).get(`/api/classrooms/${id}`).set(headers(student)))
        .status,
    ).toBe(200);
    expect(
      (
        await request(h.app)
          .patch(`/api/classrooms/${id}/grades`)
          .set(headers(student))
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (await request(h.app).get("/api/lab-sessions/mine").set(headers(student)))
        .status,
    ).toBe(404);
    expect(
      (
        await request(h.app)
          .post("/api/labs")
          .set(headers(faculty))
          .send(payload())
      ).status,
    ).toBe(404);
  });
});
