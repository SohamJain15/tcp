import request from "supertest";
import { describe, expect, it } from "vitest";
import type { UserRecord } from "../modules/user/user.model";
import { createTestApp } from "./helpers/create-test-app";

/**
 * Class Test faculty authoring.
 *
 * The properties that matter most here are about *who* can sit a test: the filter must not
 * over-select, and the frozen assignment — not the filter — must decide access later.
 */

const COMP = "B.E. Computer Engineering";
const IT = "B.E. Information Technology";

const facultyHeaders = {
  "x-coe-role": "FACULTY",
  "x-coe-email": "faculty1@tcetmumbai.in",
  "x-coe-name": "Prof. Mehta",
};

const otherFacultyHeaders = {
  "x-coe-role": "FACULTY",
  "x-coe-email": "hod1@tcetmumbai.in",
  "x-coe-name": "Prof. HOD",
};

function classStudent(roll: number, division: string, department = COMP): UserRecord {
  const uid = `24-COMP${division}${roll}-28`;
  return {
    email: `ct${division.toLowerCase()}${roll}@tcetmumbai.in`,
    role: "STUDENT",
    name: `Student ${division}${roll}`,
    uid,
    rollNumber: String(roll),
    department,
    semester: 5,
    isProfileComplete: true,
    isHod: false,
    designation: null,
    linkedInUrl: null,
    githubUrl: null,
    skills: [],
    rating: 0,
    score: 0,
    problemsSolved: 0,
    submissionCount: 0,
    acceptedSubmissionCount: 0,
    accuracy: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    lastLoginAt: null,
    lastAcceptedAt: null,
  } as UserRecord;
}

/** Comp division A rolls 9-22, plus a division B student and an IT student as decoys. */
async function seedClass(repositories: ReturnType<typeof createTestApp>["repositories"]) {
  for (let roll = 9; roll <= 22; roll += 1) {
    await repositories.userRepository.save(classStudent(roll, "A"));
  }
  await repositories.userRepository.save(classStudent(15, "B"));
  await repositories.userRepository.save({
    ...classStudent(15, "A", IT),
    email: "ctit15@tcetmumbai.in",
    uid: "24-ITA15-28",
  });
}

const question = {
  type: "MCQ" as const,
  points: 5,
  statement: "Which scheduling algorithm can starve long jobs?",
  options: ["FCFS", "SJF", "Round Robin"],
  correctAnswer: "SJF",
};

function testPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "COOS Lecture 4 Quiz",
    subject: "COOS",
    startAt: "2026-05-07T10:00:00.000Z",
    durationMinutes: 5,
    audience: { department: COMP, division: "A", semester: null, rollFrom: 11, rollTo: 20 },
    questions: [question],
    ...overrides,
  };
}

describe("Class Test — audience", () => {
  it("previews exactly the students inside the department, division and roll range", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);

    const response = await request(app)
      .post("/api/class-tests/audience-preview")
      .set(facultyHeaders)
      .send({ department: COMP, division: "A", semester: null, rollFrom: 11, rollTo: 20 });

    expect(response.status).toBe(200);
    const rolls = response.body.students.map((student: { rollNumber: string }) => Number(student.rollNumber));
    expect(rolls).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    // Division B and the IT student must not leak in, even though one shares roll 15.
    const emails = response.body.students.map((student: { email: string }) => student.email);
    expect(emails).not.toContain("ctb15@tcetmumbai.in");
    expect(emails).not.toContain("ctit15@tcetmumbai.in");
  });

  it("returns the division alongside the roll so faculty can confirm the class", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);

    const response = await request(app)
      .post("/api/class-tests/audience-preview")
      .set(facultyHeaders)
      .send({ department: COMP, division: "A", semester: null, rollFrom: 11, rollTo: 11 });

    expect(response.status).toBe(200);
    expect(response.body.students).toHaveLength(1);
    expect(response.body.students[0]).toMatchObject({ rollNumber: "11", division: "A", uid: "24-COMPA11-28" });
  });

  it("refuses a roll range that starts after it ends", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);

    const response = await request(app)
      .post("/api/class-tests/audience-preview")
      .set(facultyHeaders)
      .send({ department: COMP, division: "A", semester: null, rollFrom: 20, rollTo: 11 });

    expect(response.status).toBe(400);
  });

  it("assigns the whole filtered class when faculty tick nobody explicitly", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);

    const response = await request(app).post("/api/class-tests").set(facultyHeaders).send(testPayload());

    expect(response.status).toBe(201);
    expect(response.body.classTest.assignedStudents).toHaveLength(10);
  });

  it("assigns only the students faculty ticked", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);

    const response = await request(app)
      .post("/api/class-tests")
      .set(facultyHeaders)
      .send(
        testPayload({
          assignedEmails: ["cta11@tcetmumbai.in", "cta12@tcetmumbai.in"],
        }),
      );

    expect(response.status).toBe(201);
    expect(response.body.classTest.assignedStudents.map((s: { email: string }) => s.email)).toEqual([
      "cta11@tcetmumbai.in",
      "cta12@tcetmumbai.in",
    ]);
  });

  it("ignores a ticked student who is outside the filter", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);

    // A crafted request naming a division-B student must not pull them into a division-A test.
    const response = await request(app)
      .post("/api/class-tests")
      .set(facultyHeaders)
      .send(testPayload({ assignedEmails: ["cta11@tcetmumbai.in", "ctb15@tcetmumbai.in"] }));

    expect(response.status).toBe(201);
    expect(response.body.classTest.assignedStudents.map((s: { email: string }) => s.email)).toEqual([
      "cta11@tcetmumbai.in",
    ]);
  });

  it("refuses to create a test that would reach nobody", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);

    const response = await request(app)
      .post("/api/class-tests")
      .set(facultyHeaders)
      .send(testPayload({ audience: { department: COMP, division: "H", semester: null, rollFrom: null, rollTo: null } }));

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/no students match/i);
  });
});

describe("Class Test — authoring", () => {
  it("stores the paper with stable question ids and no results published", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);

    const response = await request(app).post("/api/class-tests").set(facultyHeaders).send(testPayload());

    expect(response.status).toBe(201);
    const created = response.body.classTest;
    expect(created.questions[0].id).toMatch(/^q_/);
    expect(created.resultsPublished).toBe(false);
    expect(created.subject).toBe("COOS");
    // Everyone shares one deadline, so the test locks 5 minutes after the scheduled start.
    expect(created.durationMinutes).toBe(5);
  });

  it("requires a coding question to allow at least one language", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);

    const response = await request(app)
      .post("/api/class-tests")
      .set(facultyHeaders)
      .send(
        testPayload({
          questions: [
            {
              type: "Coding",
              points: 10,
              problemTitle: "Reverse a list",
              difficulty: "Easy",
              problemStatement: "Reverse it.",
              supportedLanguages: [],
            },
          ],
        }),
      );

    // A coding question nobody can pick a language for is a question nobody can answer.
    expect(response.status).toBe(400);
  });

  it("accepts a coding question restricted to a single language", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);

    const response = await request(app)
      .post("/api/class-tests")
      .set(facultyHeaders)
      .send(
        testPayload({
          questions: [
            {
              type: "Coding",
              points: 10,
              problemTitle: "Reverse a list",
              difficulty: "Easy",
              problemStatement: "Reverse it.",
              supportedLanguages: ["java"],
            },
          ],
        }),
      );

    expect(response.status).toBe(201);
    expect(response.body.classTest.questions[0].supportedLanguages).toEqual(["java"]);
  });

  it("accepts a short-answer question with a model answer for the grader", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);

    const response = await request(app)
      .post("/api/class-tests")
      .set(facultyHeaders)
      .send(
        testPayload({
          questions: [
            {
              type: "ShortAnswer",
              points: 8,
              statement: "Explain deadlock in 3-4 sentences.",
              expectedSentences: 4,
              modelAnswer: "Four conditions must hold simultaneously...",
            },
          ],
        }),
      );

    expect(response.status).toBe(201);
    expect(response.body.classTest.questions[0].type).toBe("ShortAnswer");
    expect(response.body.classTest.questions[0].expectedSentences).toBe(4);
  });

  it("hides another faculty's test behind a 404 rather than a 403", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);

    const created = await request(app).post("/api/class-tests").set(facultyHeaders).send(testPayload());
    const classTestId = created.body.classTest.id;

    const readByOther = await request(app).get(`/api/class-tests/${classTestId}`).set(otherFacultyHeaders);
    expect(readByOther.status).toBe(404);

    const listForOther = await request(app).get("/api/class-tests").set(otherFacultyHeaders);
    expect(listForOther.body.items).toHaveLength(0);
  });

  it("refuses students access to the faculty authoring routes", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);

    const response = await request(app)
      .get("/api/class-tests")
      .set({ "x-coe-role": "STUDENT", "x-coe-email": "cta11@tcetmumbai.in", "x-coe-name": "Student A11" });

    expect(response.status).toBe(403);
  });
});

const studentHeaders = (email: string) => ({
  "x-coe-role": "STUDENT",
  "x-coe-email": email,
  "x-coe-name": "Class Student",
});

/** A live test: the fixed clock sits at 2026-05-07T00:00:0Xz, so this window is open. */
function livePayload(overrides: Record<string, unknown> = {}) {
  return testPayload({
    startAt: "2026-05-06T23:59:00.000Z",
    durationMinutes: 60,
    lifecycleState: "Published",
    ...overrides,
  });
}

async function createLiveTest(
  app: Parameters<typeof request>[0],
  overrides: Record<string, unknown> = {},
) {
  const response = await request(app).post("/api/class-tests").set(facultyHeaders).send(livePayload(overrides));
  expect(response.status).toBe(201);
  return response.body.classTest;
}

describe("Class Test — student access", () => {
  it("lists a published test only for assigned students", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);
    await createLiveTest(app, { assignedEmails: ["cta11@tcetmumbai.in"] });

    const assigned = await request(app).get("/api/class-tests/assigned").set(studentHeaders("cta11@tcetmumbai.in"));
    expect(assigned.status).toBe(200);
    expect(assigned.body.items).toHaveLength(1);
    expect(assigned.body.items[0].attemptStatus).toBe("NOT_STARTED");

    // Same division and inside the roll range, but not ticked — must see nothing.
    const notAssigned = await request(app).get("/api/class-tests/assigned").set(studentHeaders("cta12@tcetmumbai.in"));
    expect(notAssigned.body.items).toHaveLength(0);
  });

  it("hides the test behind a 404 from a student who was not assigned", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);
    const test = await createLiveTest(app, { assignedEmails: ["cta11@tcetmumbai.in"] });

    const response = await request(app)
      .post(`/api/class-tests/mine/${test.id}/attempts`)
      .set(studentHeaders("cta12@tcetmumbai.in"));
    expect(response.status).toBe(404);
  });

  it("never sends correct answers or model answers to a student", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);
    const test = await createLiveTest(app, {
      questions: [
        question,
        { type: "ShortAnswer", points: 8, statement: "Explain deadlock.", modelAnswer: "Four conditions..." },
      ],
    });

    const started = await request(app)
      .post(`/api/class-tests/mine/${test.id}/attempts`)
      .set(studentHeaders("cta11@tcetmumbai.in"));

    expect(started.status).toBe(201);
    const serialized = JSON.stringify(started.body);
    expect(serialized).not.toContain("correctAnswer");
    expect(serialized).not.toContain("Four conditions");
    expect(started.body.classTest.questions).toHaveLength(2);
  });

  it("prefills the identity confirmation from the verified profile", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);
    const test = await createLiveTest(app);

    const started = await request(app)
      .post(`/api/class-tests/mine/${test.id}/attempts`)
      .set(studentHeaders("cta11@tcetmumbai.in"));

    expect(started.body.classTest.identity).toMatchObject({
      uid: "24-COMPA11-28",
      rollNumber: "11",
      division: "A",
      department: COMP,
    });
  });

  it("gives every student the same deadline no matter when they start", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);
    const test = await createLiveTest(app);

    const first = await request(app)
      .post(`/api/class-tests/mine/${test.id}/attempts`)
      .set(studentHeaders("cta11@tcetmumbai.in"));
    const second = await request(app)
      .post(`/api/class-tests/mine/${test.id}/attempts`)
      .set(studentHeaders("cta12@tcetmumbai.in"));

    // Starting later must not buy extra time — that is the whole point of a synchronised test.
    expect(first.body.classTest.deadlineAt).toBe(second.body.classTest.deadlineAt);
    // startAt 23:59 + 60 minutes, for everyone, regardless of when they opened the paper.
    expect(first.body.classTest.deadlineAt).toBe("2026-05-07T00:59:00.000Z");
  });

  it("resumes rather than restarts when a student reloads", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);
    const test = await createLiveTest(app);
    const headers = studentHeaders("cta11@tcetmumbai.in");

    await request(app).post(`/api/class-tests/mine/${test.id}/attempts`).set(headers);
    await request(app)
      .post(`/api/class-tests/mine/${test.id}/answers`)
      .set(headers)
      .send({ questionId: test.questions[0].id, answer: "SJF" });

    const again = await request(app).post(`/api/class-tests/mine/${test.id}/attempts`).set(headers);
    expect(again.status).toBe(201);
    expect(again.body.classTest.answers[0].submittedAnswer).toBe("SJF");
  });

  it("refuses to start a test that has not begun", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);
    const test = await createLiveTest(app, {
      startAt: "2026-05-08T10:00:00.000Z",
      durationMinutes: 5,
    });

    const response = await request(app)
      .post(`/api/class-tests/mine/${test.id}/attempts`)
      .set(studentHeaders("cta11@tcetmumbai.in"));
    expect(response.status).toBe(409);
  });
});

describe("Class Test — proctoring", () => {
  it("auto-submits and flags malpractice on the first scored violation", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);
    const test = await createLiveTest(app);
    const headers = studentHeaders("cta11@tcetmumbai.in");
    await request(app).post(`/api/class-tests/mine/${test.id}/attempts`).set(headers);

    const response = await request(app)
      .post(`/api/class-tests/mine/${test.id}/proctor-events`)
      .set(headers)
      .send({ type: "FULLSCREEN_EXIT" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ autoSubmitted: true, violationCount: 1 });

    const [attempt] = await repositories.classTestAttemptRepository.listByTest(test.id);
    expect(attempt.status).toBe("AUTO_SUBMITTED");
    expect(attempt.suspectedMalpractice).toBe(true);
  });

  it("logs a blocked clipboard action without ending the test", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);
    const test = await createLiveTest(app);
    const headers = studentHeaders("cta11@tcetmumbai.in");
    await request(app).post(`/api/class-tests/mine/${test.id}/attempts`).set(headers);

    const response = await request(app)
      .post(`/api/class-tests/mine/${test.id}/proctor-events`)
      .set(headers)
      .send({ type: "PASTE" });

    // The browser already blocked the paste, so the student gained nothing by trying.
    expect(response.body).toEqual({ autoSubmitted: false, violationCount: 0 });
  });
});

/** An ended test: startAt well before the fixed clock, so grading is open. */
async function createEndedTest(
  app: Parameters<typeof request>[0],
  overrides: Record<string, unknown> = {},
) {
  const response = await request(app)
    .post("/api/class-tests")
    .set(facultyHeaders)
    .send(testPayload({ startAt: "2026-05-06T22:00:00.000Z", durationMinutes: 30, lifecycleState: "Published", ...overrides }));
  expect(response.status).toBe(201);
  return response.body.classTest;
}

describe("Class Test — scoring and visibility", () => {
  it("withholds scores from faculty while the test is still running", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);
    const test = await createLiveTest(app);
    const headers = studentHeaders("cta11@tcetmumbai.in");
    await request(app).post(`/api/class-tests/mine/${test.id}/attempts`).set(headers);
    await request(app)
      .post(`/api/class-tests/mine/${test.id}/answers`)
      .set(headers)
      .send({ questionId: test.questions[0].id, answer: "SJF" });

    const attempts = await request(app).get(`/api/class-tests/${test.id}/attempts`).set(facultyHeaders);
    expect(attempts.status).toBe(200);
    // Violations are visible for live proctoring; marks are not, so a running test can never
    // be read as a scoreboard.
    expect(attempts.body.items[0].violationCount).toBe(0);
    expect(attempts.body.items[0].autoScore).toBeNull();
    expect(attempts.body.items[0].finalScore).toBeNull();
  });

  it("auto-scores objective answers once the test has ended", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);
    const test = await createEndedTest(app);

    // Seed a finished attempt directly: the window has already closed.
    const [assigned] = test.assignedStudents;
    await repositories.classTestAttemptRepository.save({
      id: "ct_attempt_seed1",
      classTestId: test.id,
      userEmail: assigned.email,
      userName: assigned.name,
      userUid: assigned.uid,
      userRollNumber: assigned.rollNumber,
      userDivision: assigned.division,
      userDepartment: COMP,
      status: "SUBMITTED",
      questionStates: [
        {
          questionId: test.questions[0].id,
          questionType: "MCQ",
          submittedAnswer: "SJF",
          awardedPoints: 0,
          maxPoints: 5,
          lastSubmissionId: null,
          finalSubmissionLanguage: null,
          finalSubmissionStatus: null,
          passedCount: 0,
          totalCount: 0,
          draftCode: null,
          draftLanguage: null,
          gradedBy: null,
          gradedAt: null,
          graderNote: null,
        },
      ],
      autoScore: 0,
      manualScore: 0,
      finalScore: 0,
      gradingStatus: "PENDING",
      violationCount: 0,
      suspectedMalpractice: false,
      startedAt: new Date("2026-05-06T22:01:00.000Z"),
      deadlineAt: new Date("2026-05-06T22:30:00.000Z"),
      submittedAt: new Date("2026-05-06T22:10:00.000Z"),
      autoSubmittedAt: null,
      timeTakenMs: 540000,
      createdAt: new Date("2026-05-06T22:01:00.000Z"),
      updatedAt: new Date("2026-05-06T22:10:00.000Z"),
    });

    const attempt = await request(app)
      .get(`/api/class-tests/${test.id}/attempts/ct_attempt_seed1`)
      .set(facultyHeaders);

    expect(attempt.status).toBe(200);
    // The MCQ was correct and is worth 5; no written answers, so grading is already complete.
    expect(attempt.body.attempt.autoScore).toBe(5);
    expect(attempt.body.attempt.finalScore).toBe(5);
    expect(attempt.body.attempt.gradingStatus).toBe("COMPLETE");
  });

  it("blocks publishing while a written answer is still ungraded, then allows it", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);
    const test = await createEndedTest(app, {
      questions: [
        question,
        { type: "ShortAnswer", points: 8, statement: "Explain deadlock.", modelAnswer: "Four conditions..." },
      ],
    });
    const [assigned] = test.assignedStudents;
    const shortAnswerId = test.questions[1].id;

    await repositories.classTestAttemptRepository.save({
      id: "ct_attempt_seed2",
      classTestId: test.id,
      userEmail: assigned.email,
      userName: assigned.name,
      userUid: assigned.uid,
      userRollNumber: assigned.rollNumber,
      userDivision: assigned.division,
      userDepartment: COMP,
      status: "SUBMITTED",
      questionStates: [
        {
          questionId: test.questions[0].id,
          questionType: "MCQ",
          submittedAnswer: "SJF",
          awardedPoints: 0,
          maxPoints: 5,
          lastSubmissionId: null,
          finalSubmissionLanguage: null,
          finalSubmissionStatus: null,
          passedCount: 0,
          totalCount: 0,
          draftCode: null,
          draftLanguage: null,
          gradedBy: null,
          gradedAt: null,
          graderNote: null,
        },
        {
          questionId: shortAnswerId,
          questionType: "ShortAnswer",
          submittedAnswer: "Mutual exclusion, hold and wait, no preemption, circular wait.",
          awardedPoints: 0,
          maxPoints: 8,
          lastSubmissionId: null,
          finalSubmissionLanguage: null,
          finalSubmissionStatus: null,
          passedCount: 0,
          totalCount: 0,
          draftCode: null,
          draftLanguage: null,
          gradedBy: null,
          gradedAt: null,
          graderNote: null,
        },
      ],
      autoScore: 0,
      manualScore: 0,
      finalScore: 0,
      gradingStatus: "PENDING",
      violationCount: 0,
      suspectedMalpractice: false,
      startedAt: new Date("2026-05-06T22:01:00.000Z"),
      deadlineAt: new Date("2026-05-06T22:30:00.000Z"),
      submittedAt: new Date("2026-05-06T22:10:00.000Z"),
      autoSubmittedAt: null,
      timeTakenMs: 540000,
      createdAt: new Date("2026-05-06T22:01:00.000Z"),
      updatedAt: new Date("2026-05-06T22:10:00.000Z"),
    });

    const blocked = await request(app)
      .patch(`/api/class-tests/${test.id}/results`)
      .set(facultyHeaders)
      .send({ resultsPublished: true });
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toMatch(/grade every written answer/i);

    // The grader sees the model answer alongside the student's writing.
    const forGrading = await request(app)
      .get(`/api/class-tests/${test.id}/attempts/ct_attempt_seed2`)
      .set(facultyHeaders);
    const written = forGrading.body.attempt.answers.find(
      (a: { questionId: string }) => a.questionId === shortAnswerId,
    );
    expect(written.requiresManualGrading).toBe(true);
    expect(written.modelAnswer).toContain("Four conditions");

    const graded = await request(app)
      .patch(`/api/class-tests/${test.id}/attempts/ct_attempt_seed2/grade`)
      .set(facultyHeaders)
      .send({ questionId: shortAnswerId, awardedPoints: 6, graderNote: "Missed circular wait detail" });
    expect(graded.status).toBe(200);
    expect(graded.body.attempt.manualScore).toBe(6);
    expect(graded.body.attempt.finalScore).toBe(11);
    expect(graded.body.attempt.gradingStatus).toBe("COMPLETE");

    const published = await request(app)
      .patch(`/api/class-tests/${test.id}/results`)
      .set(facultyHeaders)
      .send({ resultsPublished: true });
    expect(published.status).toBe(200);
  });

  it("refuses to award more than a question is worth", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);
    const test = await createEndedTest(app, {
      questions: [{ type: "ShortAnswer", points: 8, statement: "Explain deadlock." }],
    });
    const [assigned] = test.assignedStudents;

    await repositories.classTestAttemptRepository.save({
      id: "ct_attempt_seed3",
      classTestId: test.id,
      userEmail: assigned.email,
      userName: assigned.name,
      userUid: assigned.uid,
      userRollNumber: assigned.rollNumber,
      userDivision: assigned.division,
      userDepartment: COMP,
      status: "SUBMITTED",
      questionStates: [
        {
          questionId: test.questions[0].id,
          questionType: "ShortAnswer",
          submittedAnswer: "An answer.",
          awardedPoints: 0,
          maxPoints: 8,
          lastSubmissionId: null,
          finalSubmissionLanguage: null,
          finalSubmissionStatus: null,
          passedCount: 0,
          totalCount: 0,
          draftCode: null,
          draftLanguage: null,
          gradedBy: null,
          gradedAt: null,
          graderNote: null,
        },
      ],
      autoScore: 0,
      manualScore: 0,
      finalScore: 0,
      gradingStatus: "PENDING",
      violationCount: 0,
      suspectedMalpractice: false,
      startedAt: new Date("2026-05-06T22:01:00.000Z"),
      deadlineAt: new Date("2026-05-06T22:30:00.000Z"),
      submittedAt: new Date("2026-05-06T22:10:00.000Z"),
      autoSubmittedAt: null,
      timeTakenMs: 1000,
      createdAt: new Date("2026-05-06T22:01:00.000Z"),
      updatedAt: new Date("2026-05-06T22:10:00.000Z"),
    });

    const response = await request(app)
      .patch(`/api/class-tests/${test.id}/attempts/ct_attempt_seed3/grade`)
      .set(facultyHeaders)
      .send({ questionId: test.questions[0].id, awardedPoints: 99 });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/maximum for this question is 8/i);
  });

  it("keeps a student's result sealed until publish", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);
    const test = await createEndedTest(app);
    const headers = studentHeaders(test.assignedStudents[0].email);

    const early = await request(app).get(`/api/class-tests/mine/${test.id}/result`).set(headers);
    expect(early.status).toBe(409);
    expect(early.body.message).toMatch(/not published/i);
  });
});

describe("Class Test — no ranking exists", () => {
  it("exposes no standings or leaderboard route", async () => {
    const { app, repositories } = createTestApp();
    await seedClass(repositories);
    const test = await createEndedTest(app);

    // A class test assesses individuals; there is deliberately nothing that orders them.
    for (const path of [`/api/class-tests/${test.id}/standings`, `/api/class-tests/${test.id}/leaderboard`]) {
      const response = await request(app).get(path).set(facultyHeaders);
      expect(response.status).toBe(404);
    }
  });
});
