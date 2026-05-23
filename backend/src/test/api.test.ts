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
  const response = await request(app)
    .post("/api/contests")
    .set(facultyHeaders)
    .send({
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
    });

  expect(response.status).toBe(201);
  return response.body.contest;
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
        uid: "TCET1234",
        rollNumber: "ROLL-2026-001",
        department: "B.E. Computer Engineering",
        semester: 4,
        linkedInUrl: null,
        githubUrl: null,
      });

    expect(completedProfileResponse.status).toBe(200);
    expect(completedProfileResponse.body.user.uid).toBe("TCET1234");
    expect(completedProfileResponse.body.user.rollNumber).toBe("ROLL-2026-001");
    expect(completedProfileResponse.body.user.isProfileComplete).toBe(true);

    const savedUser = await repositories.userRepository.getByEmail("newstudent@tcetmumbai.in");
    expect(savedUser?.uid).toBe("TCET1234");
    expect(savedUser?.rollNumber).toBe("ROLL-2026-001");
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

  it("reveals ended contest questions and practice coding without exposing standings until results are published", async () => {
    const { app } = createTestApp();
    const contest = await createContest(app, {
      startTime: "2026-05-06T23:00:00.000Z",
      duration: 30,
      lifecycleState: "Published",
    });
    expect(contest.lifecycleState).toBe("Published");

    const stateUpdateResponse = await request(app)
      .patch(`/api/contests/${contest.id}/state`)
      .set(facultyHeaders)
      .send({ lifecycleState: "Archived" });
    expect(stateUpdateResponse.status).toBe(404);

    const contestListResponse = await request(app).get("/api/contests");
    expect(contestListResponse.status).toBe(200);
    expect(contestListResponse.body.items).toHaveLength(1);
    expect(contestListResponse.body.items[0].computedStatus).toBe("Ended");

    const endedContestDetailResponse = await request(app).get(`/api/contests/${contest.id}`);
    expect(endedContestDetailResponse.status).toBe(200);
    expect(endedContestDetailResponse.body.contest.questions).toHaveLength(2);
    expect(endedContestDetailResponse.body.contest.questions[0].correctAnswer).toBe("B");

    const studentQuestionResponse = await request(app).get(`/api/contests/${contest.id}/questions/q_mcq_1`);
    expect(studentQuestionResponse.status).toBe(200);
    expect(studentQuestionResponse.body.question.correctAnswer).toBe("B");

    const practiceRunResponse = await request(app)
      .post(`/api/contests/${contest.id}/coding-run`)
      .send({ questionId: "q_code_1", code: "accepted", language: "python" });
    expect(practiceRunResponse.status).toBe(200);
    expect(practiceRunResponse.body.result.status).toBe("ACCEPTED");

    const practiceSubmitResponse = await request(app)
      .post(`/api/contests/${contest.id}/coding-submissions`)
      .send({ questionId: "q_code_1", code: "accepted", language: "python" });
    expect(practiceSubmitResponse.status).toBe(201);
    expect(practiceSubmitResponse.body.practiceMode).toBe(true);
    expect(practiceSubmitResponse.body.status).toBe("ACCEPTED");
    expect(practiceSubmitResponse.body.passedCount).toBe(practiceSubmitResponse.body.totalCount);

    const hiddenStandingsResponse = await request(app).get(`/api/contests/${contest.id}/standings`);
    expect(hiddenStandingsResponse.status).toBe(403);

    const facultyStandingsResponse = await request(app)
      .get(`/api/contests/${contest.id}/standings`)
      .set(facultyHeaders);
    expect(facultyStandingsResponse.status).toBe(200);

    const publishResultsResponse = await request(app)
      .patch(`/api/contests/${contest.id}/results`)
      .set(facultyHeaders)
      .send({ resultsPublished: true });
    expect(publishResultsResponse.status).toBe(200);
    expect(publishResultsResponse.body.contest.resultsPublished).toBe(true);

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

  it("gates live contest questions until start, ignores clipboard proctor events, and auto-submits on configured violations", async () => {
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

    const answerResponse = await request(app)
      .post(`/api/contests/${contest.id}/answers`)
      .send({ questionId: "q_mcq_1", answer: "B" });
    expect(answerResponse.status).toBe(200);
    expect(answerResponse.body.attempt.score).toBe(10);

    const runResponse = await request(app)
      .post(`/api/contests/${contest.id}/coding-run`)
      .send({ questionId: "q_code_1", code: "accepted", language: "python" });
    expect(runResponse.status).toBe(200);
    expect(runResponse.body.result.status).toBe("ACCEPTED");
    expect(runResponse.body.result.totalCount).toBe(1);

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

    for (const type of ["COPY", "CUT", "PASTE", "CONTEXT_MENU"]) {
      const clipboardResponse = await request(app).post(`/api/contests/${contest.id}/proctor-events`).send({ type });
      expect(clipboardResponse.status).toBe(200);
      expect(clipboardResponse.body.attempt.status).toBe("ACTIVE");
      expect(clipboardResponse.body.attempt.violationCount).toBe(0);
    }

    await request(app).post(`/api/contests/${contest.id}/proctor-events`).send({ type: "TAB_SWITCH" });
    await request(app).post(`/api/contests/${contest.id}/proctor-events`).send({ type: "VISIBILITY_LOSS" });
    await request(app).post(`/api/contests/${contest.id}/proctor-events`).send({ type: "FULLSCREEN_EXIT" });
    const autoSubmitResponse = await request(app)
      .post(`/api/contests/${contest.id}/proctor-events`)
      .send({ type: "PRINT_SCREEN" });
    expect(autoSubmitResponse.status).toBe(200);
    expect(autoSubmitResponse.body.attempt.status).toBe("AUTO_SUBMITTED");

    const blockedAnswerResponse = await request(app)
      .post(`/api/contests/${contest.id}/answers`)
      .send({ questionId: "q_mcq_1", answer: "B" });
    expect(blockedAnswerResponse.status).toBe(409);

    const attemptsResponse = await request(app)
      .get(`/api/contests/${contest.id}/attempts`)
      .set(facultyHeaders);
    expect(attemptsResponse.status).toBe(200);
    expect(attemptsResponse.body.items[0].violationCount).toBe(4);
  });
});
