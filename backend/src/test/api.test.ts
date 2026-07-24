import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers/create-test-app";

const facultyHeaders = {
  "x-coe-role": "FACULTY",
  "x-coe-email": "faculty1@tcetmumbai.in",
  "x-coe-name": "Prof. Mehta",
};

async function createProblem(app: Parameters<typeof request>[0], overrides: Record<string, unknown> = {}) {
  const response = await request(app)
    .post("/api/problems")
    .set(facultyHeaders)
    .send({
      title: "Two Sum Variant",
      statement: "Return the indices of the pair that adds to the target.",
      inputFormat: "Array and target",
      outputFormat: "Two indices",
      constraints: ["2 <= n <= 10^5"],
      difficulty: "Easy",
      tags: ["Array", "Hash Map"],
      timeLimitSeconds: 1,
      memoryLimitMb: 256,
      lifecycleState: "Published",
      sampleTestCases: [{ input: "2 7 11 15\n9", output: "0 1" }],
      hiddenTestCases: [{ input: "1 5 1 5\n10", output: "1 3" }],
      ...overrides,
    });

  expect(response.status).toBe(201);
  return response.body.problem;
}

async function createContest(app: Parameters<typeof request>[0], overrides: Record<string, unknown> = {}) {
  const payload: Record<string, unknown> = {
      title: "T&P Test",
      startTime: "2026-05-07T00:00:00.000Z",
      duration: 60,
      type: "Rated",
      lifecycleState: "Published",
      targetDepartment: null,
      maxViolations: 3,
      questions: [
        {
          id: "q_mcq_1",
          type: "MCQ",
          points: 10,
          statement: "Which data structure follows the LIFO principle?",
          options: ["Queue", "Stack", "Heap", "Tree"],
          correctAnswer: "B",
        },
        {
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
          supportedLanguages: ["cpp", "java", "python"],
        },
      ],
      ...overrides,
  };

  // Unless a test says otherwise the window is exactly one duration long and registration stays
  // open for the whole of it, so any test can register at the moment it needs to.
  const startAtMs = new Date(String(payload.startTime)).getTime();
  payload.endTime ??= new Date(startAtMs + Number(payload.duration) * 60_000).toISOString();
  payload.registrationOpenAt ??= new Date(startAtMs - 24 * 60 * 60_000).toISOString();
  payload.registrationCloseAt ??= payload.endTime;

  const response = await request(app).post("/api/contests").set(facultyHeaders).send(payload);

  expect(response.status).toBe(201);
  return response.body.contest;
}

async function registerForContest(app: Parameters<typeof request>[0], contestId: string) {
  const response = await request(app).post(`/api/contests/${contestId}/registration`);
  expect(response.status).toBe(201);
  return response.body.registration;
}

describe("TCET Code Studio backend APIs", () => {
  it("auto-provisions users through CoE auth and preserves the legacy profile route", async () => {
    const { app } = createTestApp();

    const currentUserResponse = await request(app).get("/api/users/me");
    expect(currentUserResponse.status).toBe(200);
    expect(currentUserResponse.body.user.email).toBe("student1@tcetmumbai.in");
    expect(currentUserResponse.body.user.role).toBe("STUDENT");
    expect(currentUserResponse.body.user.rating).toBe(0);
    expect(currentUserResponse.body.user.rank).toBe(1);

    const legacyProfileResponse = await request(app)
      .get("/api/user/profile")
      .set({
        "x-coe-role": "FACULTY",
        "x-coe-email": "faculty@tcetmumbai.in",
      });

    expect(legacyProfileResponse.status).toBe(200);
    expect(legacyProfileResponse.body.email).toBe("faculty@tcetmumbai.in");
    expect(legacyProfileResponse.body.role).toBe("FACULTY");

    const facultyStudentLookup = await request(app)
      .get("/api/users/student1%40tcetmumbai.in")
      .set(facultyHeaders);

    expect(facultyStudentLookup.status).toBe(200);
    expect(facultyStudentLookup.body.user.email).toBe("student1@tcetmumbai.in");

    const forbiddenStudentLookup = await request(app)
      .get("/api/users/student2%40tcetmumbai.in");

    expect(forbiddenStudentLookup.status).toBe(403);
  });

  it("requires a student UID during profile completion and persists UID separately from roll number", async () => {
    const { app, repositories } = createTestApp();
    const incompleteStudentHeaders = {
      "x-coe-email": "newstudent@tcetmumbai.in",
      "x-coe-role": "STUDENT",
      "x-coe-name": "New Student",
      "x-coe-uid": "",
    };

    const missingUidResponse = await request(app)
      .patch("/api/users/me")
      .set(incompleteStudentHeaders)
      .send({
        name: "New Student",
        rollNumber: "ROLL-2026-001",
        department: "B.E. Computer Engineering",
        semester: 4,
        linkedInUrl: null,
        githubUrl: null,
      });

    expect(missingUidResponse.status).toBe(400);
    expect(missingUidResponse.body.message).toBe("Validation failed");

    const completedProfileResponse = await request(app)
      .patch("/api/users/me")
      .set(incompleteStudentHeaders)
      .send({
        name: "New Student",
        uid: "24-COMPA35-28",
        rollNumber: "ROLL-2026-001",
        department: "B.E. Computer Engineering",
        semester: 4,
        linkedInUrl: null,
        githubUrl: null,
      });

    expect(completedProfileResponse.status).toBe(200);
    expect(completedProfileResponse.body.user.uid).toBe("24-COMPA35-28");
    // Roll number is always derived from the UID, never taken from the client payload.
    expect(completedProfileResponse.body.user.rollNumber).toBe("35");
    expect(completedProfileResponse.body.user.isProfileComplete).toBe(true);

    const savedUser = await repositories.userRepository.getByEmail("newstudent@tcetmumbai.in");
    expect(savedUser?.uid).toBe("24-COMPA35-28");
    expect(savedUser?.rollNumber).toBe("35");
    expect(savedUser?.isProfileComplete).toBe(true);
  });

  it("supports faculty problem workflows and redacts hidden cases from student detail responses", async () => {
    const { app } = createTestApp();

    const createdProblem = await createProblem(app, { lifecycleState: "Draft" });

    const initialStudentList = await request(app).get("/api/problems");
    expect(initialStudentList.status).toBe(200);
    expect(initialStudentList.body.items).toHaveLength(0);

    const publishResponse = await request(app)
      .patch(`/api/problems/${createdProblem.id}/state`)
      .set(facultyHeaders)
      .send({ lifecycleState: "Published" });

    expect(publishResponse.status).toBe(200);
    expect(publishResponse.body.problem.lifecycleState).toBe("Published");

    const studentList = await request(app).get("/api/problems");
    expect(studentList.status).toBe(200);
    expect(studentList.body.items).toHaveLength(1);
    expect(studentList.body.items[0].id).toBe(createdProblem.id);

    const studentDetail = await request(app).get(`/api/problems/${createdProblem.id}`);
    expect(studentDetail.status).toBe(200);
    expect(studentDetail.body.problem.sampleTestCases).toHaveLength(1);
    expect(studentDetail.body.problem.hiddenTestCases).toBeUndefined();
    expect(studentDetail.body.problem.examples).toHaveLength(1);

    const facultyDetail = await request(app)
      .get(`/api/problems/manage/${createdProblem.id}`)
      .set(facultyHeaders);

    expect(facultyDetail.status).toBe(200);
    expect(facultyDetail.body.problem.hiddenTestCases).toHaveLength(1);
  });

  it("keeps sample runs non-persistent and awards rating only for the first accepted unique solve", async () => {
    const { app, services } = createTestApp();
    const createdProblem = await createProblem(app);

    const runResponse = await request(app).post("/api/submissions/run").send({
      problemId: createdProblem.id,
      code: "print('accepted')",
      language: "python",
    });

    expect(runResponse.status).toBe(200);
    expect(runResponse.body.result.status).toBe("ACCEPTED");

    const initialSubmissionList = await request(app).get("/api/submissions");
    expect(initialSubmissionList.status).toBe(200);
    expect(initialSubmissionList.body.items).toHaveLength(0);

    const wrongAnswerResponse = await request(app).post("/api/submissions").send({
      problemId: createdProblem.id,
      code: "wrong_answer",
      language: "python",
    });

    expect(wrongAnswerResponse.status).toBe(202);
    const wrongAnswerSubmission = await services.submissionService.processQueuedSubmission(
      wrongAnswerResponse.body.submission_id,
      "test-job-1",
    );
    expect(wrongAnswerSubmission.status).toBe("WRONG_ANSWER");
    expect(wrongAnswerSubmission.ratingAwarded).toBe(0);

    const acceptedResponse = await request(app).post("/api/submissions").send({
      problemId: createdProblem.id,
      code: "accepted",
      language: "python",
    });

    expect(acceptedResponse.status).toBe(202);
    const acceptedSubmission = await services.submissionService.processQueuedSubmission(
      acceptedResponse.body.submission_id,
      "test-job-2",
    );
    expect(acceptedSubmission.status).toBe("ACCEPTED");
    expect(acceptedSubmission.ratingAwarded).toBe(100);

    const repeatedAcceptedResponse = await request(app).post("/api/submissions").send({
      problemId: createdProblem.id,
      code: "accepted again",
      language: "python",
    });

    expect(repeatedAcceptedResponse.status).toBe(202);
    const repeatedAcceptedSubmission = await services.submissionService.processQueuedSubmission(
      repeatedAcceptedResponse.body.submission_id,
      "test-job-3",
    );
    expect(repeatedAcceptedSubmission.ratingAwarded).toBe(0);

    const currentUserResponse = await request(app).get("/api/users/me");
    expect(currentUserResponse.status).toBe(200);
    expect(currentUserResponse.body.user.rating).toBe(100);
    expect(currentUserResponse.body.user.problemsSolved).toBe(1);
    expect(currentUserResponse.body.user.submissionCount).toBe(3);
    expect(currentUserResponse.body.user.acceptedSubmissionCount).toBe(2);
    expect(currentUserResponse.body.user.accuracy).toBeCloseTo(66.67, 2);

    const manageDetail = await request(app)
      .get(`/api/problems/manage/${createdProblem.id}`)
      .set(facultyHeaders);

    expect(manageDetail.status).toBe(200);
    expect(manageDetail.body.problem.totalSubmissions).toBe(3);
    expect(manageDetail.body.problem.acceptanceRate).toBeCloseTo(66.67, 2);
  });

  it("normalizes execution language aliases and rejects editor-only submission languages", async () => {
    const { app } = createTestApp();
    const createdProblem = await createProblem(app);

    const aliasRunResponse = await request(app).post("/api/submissions/run").send({
      problemId: createdProblem.id,
      code: "accepted",
      language: "py",
    });

    expect(aliasRunResponse.status).toBe(200);
    expect(aliasRunResponse.body.result.language).toBe("python");

    const editorOnlyRunResponse = await request(app).post("/api/submissions/run").send({
      problemId: createdProblem.id,
      code: "accepted",
      language: "react",
    });

    expect(editorOnlyRunResponse.status).toBe(400);
    expect(editorOnlyRunResponse.body.message).toBe("Validation failed");
  });

  it("excludes faculty from the leaderboard, breaks rating ties by accuracy, and scopes submissions correctly", async () => {
    const { app, services } = createTestApp();
    const facultyProfileResponse = await request(app).get("/api/users/me").set(facultyHeaders);
    expect(facultyProfileResponse.status).toBe(200);
    expect(facultyProfileResponse.body.user.rank).toBeNull();

    const easyProblemOne = await createProblem(app, { title: "Easy Rating Problem A", difficulty: "Easy" });
    const easyProblemTwo = await createProblem(app, { title: "Easy Rating Problem B", difficulty: "Easy" });
    const mediumProblem = await createProblem(app, { title: "Medium Rating Problem", difficulty: "Medium" });

    const firstStudentAcceptedOne = await request(app).post("/api/submissions").send({
      problemId: easyProblemOne.id,
      code: "accepted",
      language: "python",
    });
    expect(firstStudentAcceptedOne.status).toBe(202);
    await services.submissionService.processQueuedSubmission(firstStudentAcceptedOne.body.submission_id, "test-job-4");

    const firstStudentAcceptedTwo = await request(app).post("/api/submissions").send({
      problemId: easyProblemTwo.id,
      code: "accepted",
      language: "python",
    });
    expect(firstStudentAcceptedTwo.status).toBe(202);
    await services.submissionService.processQueuedSubmission(firstStudentAcceptedTwo.body.submission_id, "test-job-5");

    const firstStudentWrongAnswer = await request(app).post("/api/submissions").send({
      problemId: easyProblemOne.id,
      code: "wrong_answer",
      language: "python",
    });
    expect(firstStudentWrongAnswer.status).toBe(202);
    await services.submissionService.processQueuedSubmission(firstStudentWrongAnswer.body.submission_id, "test-job-6");

    const secondStudentHeaders = {
      "x-coe-email": "student2@tcetmumbai.in",
      "x-coe-role": "STUDENT",
      "x-coe-name": "Student Two",
    };

    const secondStudentSubmission = await request(app)
      .post("/api/submissions")
      .set(secondStudentHeaders)
      .send({
        problemId: mediumProblem.id,
        code: "accepted",
        language: "python",
      });

    expect(secondStudentSubmission.status).toBe(202);
    const processedSecondStudentSubmission = await services.submissionService.processQueuedSubmission(
      secondStudentSubmission.body.submission_id,
      "test-job-7",
    );

    const leaderboardResponse = await request(app).get("/api/leaderboard");
    expect(leaderboardResponse.status).toBe(200);
    expect(leaderboardResponse.body.items.map((item: { email: string }) => item.email)).not.toContain(
      "faculty1@tcetmumbai.in",
    );
    expect(leaderboardResponse.body.items[0].email).toBe("student2@tcetmumbai.in");
    expect(leaderboardResponse.body.items[0].rating).toBe(200);
    expect(leaderboardResponse.body.items[0].accuracy).toBe(100);
    expect(leaderboardResponse.body.items[1].email).toBe("student1@tcetmumbai.in");
    expect(leaderboardResponse.body.items[1].rating).toBe(200);
    expect(leaderboardResponse.body.items[1].accuracy).toBeCloseTo(66.67, 2);
    expect(leaderboardResponse.body.items[1].problemsSolved).toBe(2);

    const studentSubmissionList = await request(app).get("/api/submissions");
    expect(studentSubmissionList.status).toBe(200);
    expect(studentSubmissionList.body.items).toHaveLength(3);
    expect(studentSubmissionList.body.items[0].userEmail).toBe("student1@tcetmumbai.in");

    const facultySubmissionList = await request(app)
      .get("/api/submissions")
      .set(facultyHeaders)
      .query({ userEmail: "student2@tcetmumbai.in" });

    expect(facultySubmissionList.status).toBe(200);
    expect(facultySubmissionList.body.items).toHaveLength(1);
    expect(facultySubmissionList.body.items[0].userEmail).toBe("student2@tcetmumbai.in");

    const forbiddenSubmissionDetail = await request(app).get(
      `/api/submissions/${processedSecondStudentSubmission.id}`,
    );
    expect(forbiddenSubmissionDetail.status).toBe(403);

    const csvExportResponse = await request(app).get("/api/leaderboard/export").set(facultyHeaders);
    expect(csvExportResponse.status).toBe(200);
    expect(csvExportResponse.text).toContain("student2@tcetmumbai.in");
    expect(csvExportResponse.text).not.toContain("faculty1@tcetmumbai.in");
    expect(csvExportResponse.text).toContain("rating");
  });

  it("hides questions, correct answers and the report once a contest ends, until faculty publishes results", async () => {
    const { app } = createTestApp();
    const contest = await createContest(app, {
      startTime: "2026-05-06T23:00:00.000Z",
      duration: 30,
      lifecycleState: "Published",
    });

    const contestListResponse = await request(app).get("/api/contests");
    expect(contestListResponse.status).toBe(200);
    expect(contestListResponse.body.items[0].computedStatus).toBe("Ended");

    // Ended but unpublished: no questions, no correct answers, no report — a strict blackout.
    const endedContestDetailResponse = await request(app).get(`/api/contests/${contest.id}`);
    expect(endedContestDetailResponse.status).toBe(200);
    expect(endedContestDetailResponse.body.contest.questions).toEqual([]);
    expect(endedContestDetailResponse.body.contest.report).toBeNull();

    // The per-question and code endpoints are closed once the contest is over (no practice mode).
    const studentQuestionResponse = await request(app).get(`/api/contests/${contest.id}/questions/q_mcq_1`);
    expect(studentQuestionResponse.status).toBe(409);

    const runResponse = await request(app)
      .post(`/api/contests/${contest.id}/coding-run`)
      .send({ questionId: "q_code_1", code: "accepted", language: "python" });
    expect(runResponse.status).toBe(409);

    const submitResponse = await request(app)
      .post(`/api/contests/${contest.id}/coding-submissions`)
      .send({ questionId: "q_code_1", code: "accepted", language: "python" });
    expect(submitResponse.status).toBe(409);

    const hiddenStandingsResponse = await request(app).get(`/api/contests/${contest.id}/standings`);
    expect(hiddenStandingsResponse.status).toBe(403);

    const publishResultsResponse = await request(app)
      .patch(`/api/contests/${contest.id}/results`)
      .set(facultyHeaders)
      .send({ resultsPublished: true });
    expect(publishResultsResponse.status).toBe(200);
    expect(publishResultsResponse.body.contest.resultsPublished).toBe(true);

    // Only after publishing do the questions, correct answers and standings become visible.
    const publishedDetailResponse = await request(app).get(`/api/contests/${contest.id}`);
    expect(publishedDetailResponse.body.contest.questions).toHaveLength(2);
    expect(publishedDetailResponse.body.contest.questions[0].correctAnswer).toBe("B");

    const visibleStandingsResponse = await request(app).get(`/api/contests/${contest.id}/standings`);
    expect(visibleStandingsResponse.status).toBe(200);
  });

  it("blocks faculty from publishing contest results before the deadline", async () => {
    const { app } = createTestApp();
    const contest = await createContest(app, {
      startTime: "2026-05-07T00:00:00.000Z",
      duration: 60,
      lifecycleState: "Published",
    });

    const publishResultsResponse = await request(app)
      .patch(`/api/contests/${contest.id}/results`)
      .set(facultyHeaders)
      .send({ resultsPublished: true });

    expect(publishResultsResponse.status).toBe(409);
  });

  it("hides upcoming contest questions from students until the contest goes live", async () => {
    const { app } = createTestApp();
    const contest = await createContest(app, {
      startTime: "2026-05-07T01:00:00.000Z",
      duration: 60,
      lifecycleState: "Published",
    });

    const detailResponse = await request(app).get(`/api/contests/${contest.id}`);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.contest.computedStatus).toBe("Upcoming");
    expect(detailResponse.body.contest.questions).toEqual([]);

    const questionResponse = await request(app).get(`/api/contests/${contest.id}/questions/q_mcq_1`);
    expect(questionResponse.status).toBe(409);

    const attemptResponse = await request(app).post(`/api/contests/${contest.id}/attempts`);
    expect(attemptResponse.status).toBe(409);
  });

  it("gates live contest questions until start, ignores clipboard proctor events, and auto-submits once scored violations hit the threshold", async () => {
    const { app, repositories, services } = createTestApp();
    const contest = await createContest(app, {
      startTime: "2026-05-07T00:00:00.000Z",
      duration: 60,
      maxViolations: 4,
    });

    const detailBeforeStartResponse = await request(app).get(`/api/contests/${contest.id}`);
    expect(detailBeforeStartResponse.status).toBe(200);
    expect(detailBeforeStartResponse.body.contest.computedStatus).toBe("Live");
    expect(detailBeforeStartResponse.body.contest.questions).toEqual([]);

    const questionBeforeStartResponse = await request(app).get(`/api/contests/${contest.id}/questions/q_mcq_1`);
    expect(questionBeforeStartResponse.status).toBe(409);

    await registerForContest(app, contest.id);

    const startAttemptResponse = await request(app).post(`/api/contests/${contest.id}/attempts`);
    expect(startAttemptResponse.status).toBe(201);
    expect(startAttemptResponse.body.attempt.status).toBe("ACTIVE");

    const detailAfterStartResponse = await request(app).get(`/api/contests/${contest.id}`);
    expect(detailAfterStartResponse.status).toBe(200);
    expect(detailAfterStartResponse.body.contest.questions).toHaveLength(2);

    const questionAfterStartResponse = await request(app).get(`/api/contests/${contest.id}/questions/q_mcq_1`);
    expect(questionAfterStartResponse.status).toBe(200);
    expect(questionAfterStartResponse.body.question.questionNumber).toBe(1);
    expect(questionAfterStartResponse.body.question.correctAnswer).toBeUndefined();

    // Answering never scores or reveals correctness during the live contest — it only saves the
    // choice, and the answer stays freely changeable.
    const answerResponse = await request(app)
      .post(`/api/contests/${contest.id}/answers`)
      .send({ questionId: "q_mcq_1", answer: "B" });
    expect(answerResponse.status).toBe(200);
    expect(answerResponse.body.attempt.score).toBe(0);
    const answeredState = answerResponse.body.attempt.questionStates.find(
      (state: { questionId: string }) => state.questionId === "q_mcq_1",
    );
    expect(answeredState.status).toBe("ATTEMPTED");
    expect(answeredState.isCorrect).toBeNull();
    expect(answeredState.awardedPoints).toBe(0);
    expect(answeredState.submittedAnswer).toBe("B");

    // The student can change a correct answer to a wrong one — nothing is locked.
    const changedAnswerResponse = await request(app)
      .post(`/api/contests/${contest.id}/answers`)
      .send({ questionId: "q_mcq_1", answer: "A" });
    expect(changedAnswerResponse.status).toBe(200);
    const changedState = changedAnswerResponse.body.attempt.questionStates.find(
      (state: { questionId: string }) => state.questionId === "q_mcq_1",
    );
    expect(changedState.submittedAnswer).toBe("A");
    expect(changedState.status).toBe("ATTEMPTED");
    // Restore the correct answer for the finalization assertions below.
    await request(app).post(`/api/contests/${contest.id}/answers`).send({ questionId: "q_mcq_1", answer: "B" });

    const runResponse = await request(app)
      .post(`/api/contests/${contest.id}/coding-run`)
      .send({ questionId: "q_code_1", code: "accepted", language: "python" });
    expect(runResponse.status).toBe(200);
    expect(runResponse.body.result.status).toBe("ACCEPTED");
    expect(runResponse.body.result.totalCount).toBe(1);

    // Coding is resubmittable — the first submission never locks the question.
    const firstSubmissionResponse = await request(app)
      .post(`/api/contests/${contest.id}/coding-submissions`)
      .send({ questionId: "q_code_1", code: "wrong", language: "python" });
    expect(firstSubmissionResponse.status).toBe(201);

    const submissionResponse = await request(app)
      .post(`/api/contests/${contest.id}/coding-submissions`)
      .send({ questionId: "q_code_1", code: "accepted", language: "python" });
    expect(submissionResponse.status).toBe(201);
    expect(submissionResponse.body.status).toBe("QUEUED");

    const persistedSubmission = await repositories.submissionRepository.getById(submissionResponse.body.submissionId);
    expect(persistedSubmission?.sourceType).toBe("contest_coding");
    expect(persistedSubmission?.contestId).toBe(contest.id);
    expect(persistedSubmission?.status).toBe("QUEUED");

    const processedContestSubmission = await services.submissionService.processQueuedSubmission(
      submissionResponse.body.submissionId,
      "contest-job-1",
    );
    expect(processedContestSubmission.status).toBe("ACCEPTED");

    // Judging records the verdict but does not award points during the contest.
    const detailDuringContest = await request(app).get(`/api/contests/${contest.id}`);
    expect(detailDuringContest.body.contest.attempt.score).toBe(0);
    const codingStateLive = detailDuringContest.body.contest.attempt.questionStates.find(
      (state: { questionId: string }) => state.questionId === "q_code_1",
    );
    expect(codingStateLive.awardedPoints).toBe(0);
    expect(codingStateLive.status).toBe("ATTEMPTED");

    for (const type of ["COPY", "CUT", "PASTE", "CONTEXT_MENU"]) {
      const clipboardResponse = await request(app).post(`/api/contests/${contest.id}/proctor-events`).send({ type });
      expect(clipboardResponse.status).toBe(200);
      expect(clipboardResponse.body.attempt.status).toBe("ACTIVE");
      expect(clipboardResponse.body.attempt.violationCount).toBe(0);
    }

    // Leaving the tab, leaving fullscreen and screenshots are all scored. maxViolations is 4 for
    // this contest, so the first three tick the counter without ending the attempt.
    const scoredEvents = ["TAB_SWITCH", "VISIBILITY_LOSS", "FULLSCREEN_EXIT"];
    for (const [index, type] of scoredEvents.entries()) {
      const scoredEventResponse = await request(app)
        .post(`/api/contests/${contest.id}/proctor-events`)
        .send({ type });
      expect(scoredEventResponse.status).toBe(200);
      expect(scoredEventResponse.body.attempt.status).toBe("ACTIVE");
      expect(scoredEventResponse.body.attempt.violationCount).toBe(index + 1);
    }

    // The fourth scored event hits maxViolations and auto-submits.
    const autoSubmitResponse = await request(app)
      .post(`/api/contests/${contest.id}/proctor-events`)
      .send({ type: "PRINT_SCREEN" });
    expect(autoSubmitResponse.status).toBe(200);
    expect(autoSubmitResponse.body.attempt.status).toBe("AUTO_SUBMITTED");
    expect(autoSubmitResponse.body.attempt.violationCount).toBe(4);
    expect(autoSubmitResponse.body.attempt.violationPenaltyPoints).toBe(20);

    const blockedAnswerResponse = await request(app)
      .post(`/api/contests/${contest.id}/answers`)
      .send({ questionId: "q_mcq_1", answer: "B" });
    expect(blockedAnswerResponse.status).toBe(409);

    const attemptsResponse = await request(app)
      .get(`/api/contests/${contest.id}/attempts`)
      .set(facultyHeaders);
    expect(attemptsResponse.status).toBe(200);
    expect(attemptsResponse.body.items[0].violationCount).toBe(4);
    // Auto-submit finalised the attempt: MCQ "B" (10) + coding accepted (100) − 20 violation penalty.
    expect(attemptsResponse.body.items[0].score).toBe(90);
  });

  it("shows faculty the student's latest coding submission, not their first", async () => {
    const { app, services } = createTestApp();
    const contest = await createContest(app, { startTime: "2026-05-07T00:00:00.000Z", duration: 60 });
    await registerForContest(app, contest.id);
    await request(app).post(`/api/contests/${contest.id}/attempts`);

    const firstCode = "wrong_answer // first attempt";
    const secondCode = "accepted // second attempt";

    const firstSubmission = await request(app)
      .post(`/api/contests/${contest.id}/coding-submissions`)
      .send({ questionId: "q_code_1", code: firstCode, language: "python" });
    expect(firstSubmission.status).toBe(201);
    await services.submissionService.processQueuedSubmission(firstSubmission.body.submissionId, "job-first");

    const secondSubmission = await request(app)
      .post(`/api/contests/${contest.id}/coding-submissions`)
      .send({ questionId: "q_code_1", code: secondCode, language: "python" });
    expect(secondSubmission.status).toBe(201);
    await services.submissionService.processQueuedSubmission(secondSubmission.body.submissionId, "job-second");

    const attemptsResponse = await request(app)
      .get(`/api/contests/${contest.id}/attempts`)
      .set(facultyHeaders);
    expect(attemptsResponse.status).toBe(200);
    const attemptId = attemptsResponse.body.items[0].id;

    const reviewResponse = await request(app)
      .get(`/api/contests/${contest.id}/attempts/${attemptId}`)
      .set(facultyHeaders);
    expect(reviewResponse.status).toBe(200);

    const codingReview = reviewResponse.body.review.questionReviews.find(
      (item: { questionId: string }) => item.questionId === "q_code_1",
    );
    // The review must follow lastSubmissionId to the newest submission, not the oldest row returned
    // by the newest-first submission list.
    expect(codingReview.finalCode).toBe(secondCode);
    expect(codingReview.finalCode).not.toBe(firstCode);
    expect(codingReview.finalSubmissionStatus).toBe("ACCEPTED");
  });

  it("shows a department-targeted contest to matching students using their saved profile department", async () => {
    const { app } = createTestApp();
    // student1 is seeded into Computer Engineering, student2 into Information Technology.
    const targetedContest = await createContest(app, {
      title: "Computer Engineering Only",
      targetDepartment: "B.E. Computer Engineering",
    });

    const studentTwoHeaders = {
      "x-coe-role": "STUDENT",
      "x-coe-email": "student2@tcetmumbai.in",
      "x-coe-name": "Student Two",
    };

    // Matching department: visible in the list and openable.
    const matchingListResponse = await request(app).get("/api/contests");
    expect(matchingListResponse.status).toBe(200);
    expect(matchingListResponse.body.items.map((item: { id: string }) => item.id)).toContain(targetedContest.id);

    const matchingDetailResponse = await request(app).get(`/api/contests/${targetedContest.id}`);
    expect(matchingDetailResponse.status).toBe(200);

    const matchingRegistrationResponse = await request(app).post(`/api/contests/${targetedContest.id}/registration`);
    expect(matchingRegistrationResponse.status).toBe(201);

    // Different department: filtered out of the list and blocked on direct access.
    const otherListResponse = await request(app).get("/api/contests").set(studentTwoHeaders);
    expect(otherListResponse.status).toBe(200);
    expect(otherListResponse.body.items.map((item: { id: string }) => item.id)).not.toContain(targetedContest.id);

    const otherDetailResponse = await request(app)
      .get(`/api/contests/${targetedContest.id}`)
      .set(studentTwoHeaders);
    expect(otherDetailResponse.status).toBe(403);

    const otherRegistrationResponse = await request(app)
      .post(`/api/contests/${targetedContest.id}/registration`)
      .set(studentTwoHeaders);
    expect(otherRegistrationResponse.status).toBe(403);
  });

  it("requires registration before a student can start a live contest", async () => {
    const { app } = createTestApp();
    const contest = await createContest(app, { startTime: "2026-05-07T00:00:00.000Z", duration: 60 });

    const unregisteredAttemptResponse = await request(app).post(`/api/contests/${contest.id}/attempts`);
    expect(unregisteredAttemptResponse.status).toBe(403);

    const detailBeforeRegistration = await request(app).get(`/api/contests/${contest.id}`);
    expect(detailBeforeRegistration.body.contest.isRegistered).toBe(false);
    expect(detailBeforeRegistration.body.contest.registrationStatus).toBe("OPEN");

    await registerForContest(app, contest.id);

    // Registration is idempotent — a double submit must not create a second row.
    const duplicateRegistrationResponse = await request(app).post(`/api/contests/${contest.id}/registration`);
    expect(duplicateRegistrationResponse.status).toBe(201);

    const detailAfterRegistration = await request(app).get(`/api/contests/${contest.id}`);
    expect(detailAfterRegistration.body.contest.isRegistered).toBe(true);
    expect(detailAfterRegistration.body.contest.registeredCount).toBe(1);

    const registeredAttemptResponse = await request(app).post(`/api/contests/${contest.id}/attempts`);
    expect(registeredAttemptResponse.status).toBe(201);

    const registrationsResponse = await request(app)
      .get(`/api/contests/${contest.id}/registrations`)
      .set(facultyHeaders);
    expect(registrationsResponse.status).toBe(200);
    expect(registrationsResponse.body.items).toHaveLength(1);
    expect(registrationsResponse.body.items[0].userEmail).toBe("student1@tcetmumbai.in");
    expect(registrationsResponse.body.items[0].hasAttempted).toBe(true);

    // Withdrawing is no longer possible once the attempt exists.
    const withdrawResponse = await request(app).delete(`/api/contests/${contest.id}/registration`);
    expect(withdrawResponse.status).toBe(409);
  });

  it("rejects registration outside the faculty-configured window", async () => {
    const { app } = createTestApp();
    const contest = await createContest(app, {
      startTime: "2026-05-07T00:00:00.000Z",
      duration: 60,
      registrationOpenAt: "2026-05-06T00:00:00.000Z",
      registrationCloseAt: "2026-05-06T12:00:00.000Z",
    });

    const registrationResponse = await request(app).post(`/api/contests/${contest.id}/registration`);
    expect(registrationResponse.status).toBe(409);

    const detailResponse = await request(app).get(`/api/contests/${contest.id}`);
    expect(detailResponse.body.contest.registrationStatus).toBe("CLOSED");
  });

  it("caps a late-started attempt at the end of the contest window", async () => {
    const { app } = createTestApp();
    // "Now" is 2026-05-07T00:00, so only 20 minutes of the window are left when the student
    // starts — well short of the 40-minute attempt duration.
    const contest = await createContest(app, {
      startTime: "2026-05-06T23:30:00.000Z",
      endTime: "2026-05-07T00:20:00.000Z",
      duration: 40,
    });

    await registerForContest(app, contest.id);
    const attemptResponse = await request(app).post(`/api/contests/${contest.id}/attempts`);

    expect(attemptResponse.status).toBe(201);
    expect(new Date(attemptResponse.body.attempt.deadlineAt).toISOString()).toBe("2026-05-07T00:20:00.000Z");
  });

  it("accepts coding questions with blank input/output formats and reports field-level errors", async () => {
    const { app } = createTestApp();

    // The builder always sends trimmed strings, so blank format fields arrive as "" — these are
    // optional and get sensible defaults rather than failing validation.
    const contest = await createContest(app, {
      questions: [
        {
          id: "q_code_blank_formats",
          type: "Coding",
          points: 100,
          problemTitle: "Sum of Array",
          difficulty: "Easy",
          problemStatement: "Read N integers and print their sum.",
          constraints: "1 <= N <= 10^5",
          inputFormat: "",
          outputFormat: "",
          sampleTestCases: [{ input: "3\n1 2 3", output: "6" }],
          hiddenTestCases: [{ input: "6\n10 15 20 25 30 35", output: "135" }],
        },
      ],
    });

    expect(contest.questions[0].inputFormat).toBe("Read input from standard input.");
    expect(contest.questions[0].outputFormat).toBe("Print output to standard output.");

    // A genuinely invalid question reports only its own fields, not every union branch.
    const invalidResponse = await request(app)
      .post("/api/contests")
      .set(facultyHeaders)
      .send({
        title: "Broken Question Contest",
        startTime: "2026-05-07T00:00:00.000Z",
        endTime: "2026-05-07T02:00:00.000Z",
        duration: 60,
        type: "Rated",
        targetDepartment: null,
        questions: [
          {
            id: "q_code_missing_constraints",
            type: "Coding",
            points: 100,
            problemTitle: "No Constraints",
            difficulty: "Easy",
            problemStatement: "Do something useful.",
            constraints: "",
            sampleTestCases: [{ input: "1", output: "1" }],
            hiddenTestCases: [{ input: "2", output: "2" }],
          },
        ],
      });

    expect(invalidResponse.status).toBe(400);
    const issuePaths = invalidResponse.body.details.fieldIssues.map(
      (issue: { path: string }) => issue.path,
    );
    expect(issuePaths).toContain("questions.0.constraints");
    expect(issuePaths).not.toContain("questions.0.type");
  });

  it("rejects a contest whose duration does not fit inside its window", async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .post("/api/contests")
      .set(facultyHeaders)
      .send({
        title: "Impossible Window",
        startTime: "2026-05-07T00:00:00.000Z",
        endTime: "2026-05-07T00:30:00.000Z",
        duration: 60,
        type: "Rated",
        targetDepartment: null,
        questions: [
          {
            id: "q_mcq_1",
            type: "MCQ",
            points: 10,
            statement: "Which data structure follows the LIFO principle?",
            options: ["Queue", "Stack", "Heap", "Tree"],
            correctAnswer: "B",
          },
        ],
      });

    expect(response.status).toBe(400);
  });
});
