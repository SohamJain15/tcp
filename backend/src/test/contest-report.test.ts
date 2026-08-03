import request from "supertest";
import { describe, expect, it } from "vitest";

import type { ContestAttemptRecord, ContestRecord } from "../modules/contest/contest.model";
import type { SubmissionRecord } from "../modules/submission/submission.model";
import type { AiReportGenerator } from "../modules/report/ai/ollama-client";
import { PROMPT_VERSION } from "../modules/report/ai/prompt";
import {
  collectGroundedNumbers,
  findUngroundedNumbers,
  validateNarrativeNumbers,
} from "../modules/report/ai/grounding";
import {
  buildContestAnalytics,
  computeAttemptEfficiency,
  computeLanguageStats,
  hashMetrics,
  lowerIsBetterPercentile,
  quantile,
  resolveSolveTimeMs,
  selectScoredAttempts,
  type ContestAnalytics,
  type ContestReportNarrative,
} from "../modules/report/report.model";
import { createTestApp } from "./helpers/create-test-app";

const facultyHeaders = {
  "x-coe-role": "FACULTY",
  "x-coe-email": "faculty1@tcetmumbai.in",
  "x-coe-name": "Prof. Mehta",
};

// A real, profile-complete faculty account that does not own the seeded contest.
const otherFacultyHeaders = {
  "x-coe-role": "FACULTY",
  "x-coe-email": "hod1@tcetmumbai.in",
  "x-coe-name": "Prof. Rao",
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONTEST_START = new Date("2026-05-06T23:00:00.000Z");

function buildContestRecord(overrides: Partial<ContestRecord> = {}): ContestRecord {
  return {
    id: "contest_report_1",
    title: "Data Structures Sprint",
    startAt: CONTEST_START,
    endAt: new Date(CONTEST_START.getTime() + 60 * 60_000),
    durationMinutes: 60,
    registrationOpenAt: new Date(CONTEST_START.getTime() - 24 * 60 * 60_000),
    registrationCloseAt: new Date(CONTEST_START.getTime() + 60 * 60_000),
    type: "Rated",
    lifecycleState: "Published",
    resultsPublished: true,
    targetDepartment: null,
    maxViolations: 3,
    createdBy: "faculty1@tcetmumbai.in",
    createdByRole: "FACULTY",
    managerEmails: [],
    questions: [
      {
        id: "q_mcq_1",
        type: "MCQ",
        points: 10,
        statement: "Which structure is LIFO?",
        options: ["Queue", "Stack"],
        correctAnswer: "B",
      },
      {
        id: "q_code_1",
        type: "Coding",
        points: 100,
        problemTitle: "Sum Two Numbers",
        difficulty: "Easy",
        problemStatement: "Print the sum.",
        constraints: "",
        inputFormat: "",
        outputFormat: "",
        timeLimitSeconds: 1,
        memoryLimitMb: 256,
        sampleTestCases: [],
        hiddenTestCases: [],
        supportedLanguages: ["cpp", "python"],
      },
    ],
    createdAt: CONTEST_START,
    updatedAt: CONTEST_START,
    ...overrides,
  };
}

interface AttemptSpec {
  email: string;
  name: string;
  score: number;
  violationCount?: number;
  solvedCoding?: boolean;
  codingAttempts?: number;
  solvedMinutesIn?: number;
  status?: ContestAttemptRecord["status"];
}

function buildAttempt(spec: AttemptSpec): ContestAttemptRecord {
  const startedAt = CONTEST_START;
  const solvedAt =
    spec.solvedCoding !== false
      ? new Date(startedAt.getTime() + (spec.solvedMinutesIn ?? 20) * 60_000)
      : null;

  return {
    id: `attempt_${spec.email}`,
    contestId: "contest_report_1",
    contestTitleSnapshot: "Data Structures Sprint",
    userEmail: spec.email,
    userName: spec.name,
    userUid: null,
    userDepartment: "B.E. Computer Engineering",
    status: spec.status ?? "SUBMITTED",
    score: spec.score,
    violationCount: spec.violationCount ?? 0,
    violationPenaltyPoints: (spec.violationCount ?? 0) * 5,
    timeTakenMs: 40 * 60_000,
    questionStates: [
      {
        questionId: "q_mcq_1",
        questionType: "MCQ",
        status: "SOLVED",
        attemptsCount: 1,
        awardedPoints: 10,
        submittedAnswer: "B",
        isCorrect: true,
        lastSubmissionId: null,
        passedCount: 0,
        totalCount: 0,
        hasFinalCodingSubmission: false,
        draftCode: null,
        draftLanguage: null,
        finalSubmissionLanguage: null,
        finalSubmissionStatus: null,
        finalRuntimeMs: 0,
        finalMemoryKb: 0,
        solvedAt: startedAt,
      },
      {
        questionId: "q_code_1",
        questionType: "Coding",
        status: spec.solvedCoding === false ? "ATTEMPTED" : "SOLVED",
        attemptsCount: spec.codingAttempts ?? 1,
        awardedPoints: spec.solvedCoding === false ? 0 : 100,
        submittedAnswer: null,
        isCorrect: null,
        lastSubmissionId: `sub_${spec.email}`,
        passedCount: spec.solvedCoding === false ? 1 : 2,
        totalCount: 2,
        hasFinalCodingSubmission: true,
        draftCode: null,
        draftLanguage: null,
        finalSubmissionLanguage: "cpp",
        finalSubmissionStatus: spec.solvedCoding === false ? "WRONG_ANSWER" : "ACCEPTED",
        finalRuntimeMs: 10,
        finalMemoryKb: 1024,
        solvedAt: spec.solvedCoding === false ? null : solvedAt,
      },
    ],
    startedAt,
    deadlineAt: new Date(startedAt.getTime() + 60 * 60_000),
    updatedAt: startedAt,
    submittedAt: new Date(startedAt.getTime() + 40 * 60_000),
    autoSubmittedAt: null,
    lastSolvedAt: solvedAt,
  };
}

function buildSubmission(
  email: string,
  overrides: Partial<SubmissionRecord> = {},
): SubmissionRecord {
  return {
    id: `sub_${email}`,
    queueJobId: null,
    judge0Token: null,
    sourceType: "contest_coding",
    userEmail: email,
    userRole: "STUDENT",
    userDepartment: "B.E. Computer Engineering",
    resourceOwnerEmail: "faculty1@tcetmumbai.in",
    resourceTargetDepartment: null,
    problemId: "q_code_1",
    problemTitleSnapshot: "Sum Two Numbers",
    problemDifficultySnapshot: "Easy",
    contestId: "contest_report_1",
    contestTitleSnapshot: "Data Structures Sprint",
    contestQuestionId: "q_code_1",
    classTestId: null,
    classTestQuestionId: null,
    code: "int main(){}",
    language: "cpp",
    status: "ACCEPTED",
    runtimeMs: 20,
    memoryKb: 2048,
    passedCount: 2,
    totalCount: 2,
    executionProvider: "stub",
    ratingAwarded: 0,
    stdout: null,
    stderr: null,
    createdAt: CONTEST_START,
    updatedAt: CONTEST_START,
    judgedAt: CONTEST_START,
    finalizationAppliedAt: null,
    ...overrides,
  };
}

function buildAnalytics(): ContestAnalytics {
  const attempts = [
    buildAttempt({ email: "a@x.in", name: "A", score: 110, solvedMinutesIn: 10 }),
    buildAttempt({ email: "b@x.in", name: "B", score: 60, solvedCoding: false }),
    buildAttempt({ email: "c@x.in", name: "C", score: 105, violationCount: 1, solvedMinutesIn: 30 }),
  ];

  return buildContestAnalytics({
    contest: buildContestRecord(),
    attempts,
    submissions: [
      buildSubmission("a@x.in", { runtimeMs: 10, memoryKb: 1024 }),
      buildSubmission("c@x.in", { runtimeMs: 40, memoryKb: 4096 }),
      buildSubmission("b@x.in", { status: "WRONG_ANSWER", passedCount: 1, runtimeMs: 15 }),
    ],
    proctoringEvents: [],
    registeredCount: 5,
    now: new Date("2026-05-07T02:00:00.000Z"),
  });
}

// ---------------------------------------------------------------------------
// Pure metric functions
// ---------------------------------------------------------------------------

describe("report metrics", () => {
  it("computes quantiles with linear interpolation", () => {
    const sorted = [10, 20, 30, 40];
    expect(quantile(sorted, 0)).toBe(10);
    expect(quantile(sorted, 0.5)).toBe(25);
    expect(quantile(sorted, 1)).toBe(40);
    expect(quantile([], 0.5)).toBe(0);
    expect(quantile([7], 0.9)).toBe(7);
  });

  it("scores the fastest submission highest and the slowest lowest", () => {
    const runtimes = [10, 20, 30, 40, 50];
    expect(lowerIsBetterPercentile(runtimes, 10)).toBe(1);
    expect(lowerIsBetterPercentile(runtimes, 50)).toBe(0);
    expect(lowerIsBetterPercentile(runtimes, 30)).toBe(0.5);
  });

  it("gives every entry an equal share when all values tie", () => {
    // Nobody had an edge, so nobody should be crowned by read order.
    expect(lowerIsBetterPercentile([25, 25, 25, 25], 25)).toBe(0.5);
  });

  it("treats a lone submission as the best of its set", () => {
    expect(lowerIsBetterPercentile([42], 42)).toBe(1);
  });

  it("rewards solving in fewer attempts", () => {
    expect(computeAttemptEfficiency(1)).toBe(1);
    expect(computeAttemptEfficiency(2)).toBe(0.5);
    expect(computeAttemptEfficiency(4)).toBe(0.25);
    // Guards against a stored zero producing Infinity.
    expect(computeAttemptEfficiency(0)).toBe(1);
  });

  it("excludes unsubmitted attempts from the scored set", () => {
    const attempts = [
      buildAttempt({ email: "a@x.in", name: "A", score: 100 }),
      buildAttempt({ email: "b@x.in", name: "B", score: 0, status: "ACTIVE" }),
      buildAttempt({ email: "c@x.in", name: "C", score: 50, status: "AUTO_SUBMITTED" }),
    ];
    expect(selectScoredAttempts(attempts).map((attempt) => attempt.userEmail)).toEqual([
      "a@x.in",
      "c@x.in",
    ]);
  });

  it("flags languages with too few accepted submissions as low confidence", () => {
    const submissions = [
      ...Array.from({ length: 6 }, (_, index) =>
        buildSubmission(`cpp${index}@x.in`, { language: "cpp", runtimeMs: 10 + index }),
      ),
      buildSubmission("py1@x.in", { language: "python", runtimeMs: 300 }),
    ];

    const languages = computeLanguageStats(submissions);
    const cpp = languages.find((entry) => entry.language === "cpp");
    const python = languages.find((entry) => entry.language === "python");

    expect(cpp?.confidence).toBe("high");
    expect(python?.confidence).toBe("low");
  });

  it("builds a coherent analytics snapshot from contest records", () => {
    const metrics = buildAnalytics();

    expect(metrics.participation.registeredCount).toBe(5);
    expect(metrics.participation.attemptedCount).toBe(3);
    expect(metrics.scores.totalPoints).toBe(110);
    expect(metrics.scores.maxScore).toBe(110);

    // Everyone answered the MCQ correctly; one of three failed the coding question.
    const coding = metrics.questions.find((question) => question.questionId === "q_code_1");
    expect(coding?.solvedCount).toBe(2);
    expect(coding?.solveRate).toBeCloseTo(2 / 3, 3);

    expect(metrics.hardestQuestion?.questionId).toBe("q_code_1");
    expect(metrics.easiestQuestion?.questionId).toBe("q_mcq_1");
  });

  it("ranks the fastest accepted submission as optimal and shows why", () => {
    const metrics = buildAnalytics();
    const winner = metrics.optimalCode.perQuestion.find(
      (entry) => entry.questionId === "q_code_1",
    );

    expect(winner).toBeDefined();
    // A ran in 10ms and C in 40ms; the wrong-answer submission is not even a candidate.
    expect(winner?.studentEmail).toBe("a@x.in");
    expect(winner?.runtimeMs).toBe(10);

    // The breakdown must actually add up to the headline score, or the "why" is a lie.
    const summed = winner!.breakdown.reduce((total, entry) => total + entry.contribution, 0);
    expect(summed).toBeCloseTo(winner!.totalScore, 3);

    // Weights are declared, not implied.
    expect(winner!.breakdown.map((entry) => entry.weight)).toEqual([0.4, 0.25, 0.2, 0.15]);
  });

  it("picks a best submission for every language, ranked within that language", () => {
    const attempts = [
      buildAttempt({ email: "cpp1@x.in", name: "Cpp One", score: 110 }),
      buildAttempt({ email: "cpp2@x.in", name: "Cpp Two", score: 110 }),
      buildAttempt({ email: "py1@x.in", name: "Py One", score: 110 }),
      buildAttempt({ email: "py2@x.in", name: "Py Two", score: 110 }),
    ];

    const metrics = buildContestAnalytics({
      contest: buildContestRecord(),
      attempts,
      submissions: [
        buildSubmission("cpp1@x.in", { language: "cpp", runtimeMs: 5 }),
        buildSubmission("cpp2@x.in", { language: "cpp", runtimeMs: 50 }),
        // Python is slower than every C++ entry in absolute terms and would never win overall.
        buildSubmission("py1@x.in", { language: "python", runtimeMs: 400 }),
        buildSubmission("py2@x.in", { language: "python", runtimeMs: 900 }),
      ],
      proctoringEvents: [],
      registeredCount: 4,
      now: new Date("2026-05-07T02:00:00.000Z"),
    });

    const byLanguage = new Map(
      metrics.optimalCode.perLanguage.map((entry) => [entry.language, entry]),
    );

    expect([...byLanguage.keys()].sort()).toEqual(["cpp", "python"]);
    expect(byLanguage.get("cpp")?.studentEmail).toBe("cpp1@x.in");
    // The faster Python submission wins Python despite losing to both C++ entries on raw runtime.
    expect(byLanguage.get("python")?.studentEmail).toBe("py1@x.in");
    expect(byLanguage.get("python")?.runtimePercentile).toBe(1);
    expect(byLanguage.get("python")?.percentileBasis).toContain("python only");
  });

  it("names a per-language winner even from a single submission", () => {
    const metrics = buildAnalytics();
    const winners = metrics.optimalCode.perLanguage;
    expect(winners).toHaveLength(1);
    expect(winners[0].language).toBe("cpp");
    expect(winners[0].percentileBasis).toMatch(/cpp/);
  });

  it("keeps violations out of the optimal-code ranking", () => {
    // C has a violation but is otherwise the only other candidate. Violations are already deducted
    // from the contest score, so they must not also suppress an efficiency ranking.
    const metrics = buildAnalytics();
    const candidates = metrics.optimalCode.perQuestion;
    expect(candidates.every((entry) => typeof entry.violationCount === "number")).toBe(true);
    expect(candidates.every((entry) => !entry.breakdown.some((part) => /violation/i.test(part.component)))).toBe(
      true,
    );
  });

  it("discards solve timestamps recorded after the attempt closed", () => {
    // Reproduces the production bug: publish-time grading stamps solvedAt with `now`, so an attempt
    // that closed at 40 minutes ends up claiming an 11-hour solve.
    const attempt = buildAttempt({ email: "a@x.in", name: "A", score: 110 });
    const codingState = attempt.questionStates[1];
    codingState.solvedAt = new Date(CONTEST_START.getTime() + 673 * 60_000);

    expect(resolveSolveTimeMs(attempt, codingState)).toBeNull();
  });

  it("keeps solve timestamps that fall inside the attempt", () => {
    const attempt = buildAttempt({ email: "a@x.in", name: "A", score: 110, solvedMinutesIn: 25 });
    expect(resolveSolveTimeMs(attempt, attempt.questionStates[1])).toBe(25 * 60_000);
  });

  it("falls back to the deadline when an attempt has no close timestamp", () => {
    const attempt = buildAttempt({ email: "a@x.in", name: "A", score: 110, solvedMinutesIn: 25 });
    attempt.submittedAt = null;
    attempt.autoSubmittedAt = null;
    // deadlineAt is startedAt + 60 min, so a 25-minute solve is still valid...
    expect(resolveSolveTimeMs(attempt, attempt.questionStates[1])).toBe(25 * 60_000);
    // ...but one past the deadline is not.
    attempt.questionStates[1].solvedAt = new Date(CONTEST_START.getTime() + 90 * 60_000);
    expect(resolveSolveTimeMs(attempt, attempt.questionStates[1])).toBeNull();
  });

  it("excludes discarded solve times from question averages and flags them", () => {
    const good = buildAttempt({ email: "a@x.in", name: "A", score: 110, solvedMinutesIn: 20 });
    const artefact = buildAttempt({ email: "c@x.in", name: "C", score: 110 });
    artefact.questionStates[1].solvedAt = new Date(CONTEST_START.getTime() + 673 * 60_000);

    const metrics = buildContestAnalytics({
      contest: buildContestRecord(),
      attempts: [good, artefact],
      submissions: [buildSubmission("a@x.in"), buildSubmission("c@x.in")],
      proctoringEvents: [],
      registeredCount: 2,
      now: new Date("2026-05-07T12:00:00.000Z"),
    });

    const coding = metrics.questions.find((question) => question.questionId === "q_code_1");
    // Only the valid 20-minute solve contributes — the artefact would have doubled this.
    expect(coding?.averageTimeToSolveMs).toBe(20 * 60_000);
    expect(metrics.dataQuality.percentileBasisNotes.join(" ")).toMatch(/after the attempt closed/i);
  });

  it("hashes metrics independently of property order", () => {
    const metrics = buildAnalytics();
    const reordered = JSON.parse(
      JSON.stringify({ ...metrics, contest: { ...metrics.contest } }),
    ) as ContestAnalytics;
    expect(hashMetrics(reordered)).toBe(hashMetrics(metrics));
  });
});

// ---------------------------------------------------------------------------
// Grounding validator
// ---------------------------------------------------------------------------

describe("narrative grounding", () => {
  const baseNarrative = (): ContestReportNarrative => ({
    executiveSummary: "Three students attempted the contest.",
    contestInsights: ["The coding question was hardest."],
    efficiencyObservations: ["C++ dominated submissions."],
    studentPerformanceObservations: ["Most students solved the MCQ."],
    facultyRecommendations: ["Revisit the coding question wording."],
  });

  it("accepts numbers that appear in the metrics", () => {
    const metrics = buildAnalytics();
    const narrative = baseNarrative();
    narrative.executiveSummary = "3 of 5 registered students attempted, scoring up to 110 points.";

    const result = validateNarrativeNumbers(narrative, metrics);
    expect(result.rejectedSections).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.narrative.executiveSummary).toBe(narrative.executiveSummary);
  });

  it("replaces a section containing a fabricated statistic", () => {
    const metrics = buildAnalytics();
    const narrative = baseNarrative();
    narrative.executiveSummary = "A remarkable 847 students took part, averaging 93.7 points.";

    const result = validateNarrativeNumbers(narrative, metrics);

    expect(result.rejectedSections).toContain("executiveSummary");
    expect(result.narrative.executiveSummary).not.toContain("847");
    expect(result.warnings[0]).toMatch(/could not be traced/i);
    // Untouched sections survive: one bad section must not discard the whole report.
    expect(result.narrative.contestInsights).toEqual(narrative.contestInsights);
  });

  it("tolerates rounding drift but not invention", () => {
    const metrics = buildAnalytics();
    const grounded = collectGroundedNumbers(metrics);

    // 2/3 solve rate is legitimately written as 66.7% or 67%.
    expect(findUngroundedNumbers("A 66.7% solve rate", grounded)).toEqual([]);
    expect(findUngroundedNumbers("A 67% solve rate", grounded)).toEqual([]);
    // The mean score is 91.67, so a truncated "91" is a restatement, not an invention.
    expect(findUngroundedNumbers("An average of 91 points", grounded)).toEqual([]);
    // Nothing in the contest data is anywhere near this.
    expect(findUngroundedNumbers("Some 8421 submissions were judged", grounded)).toEqual([8421]);
  });

  it("rejects claims about code quality, which nothing in the report measures", () => {
    const metrics = buildAnalytics();
    const narrative = baseNarrative();
    // Observed from qwen2.5:3b: it explains a low acceptance rate by inventing a cause it cannot see.
    narrative.contestInsights = [
      "The low acceptance rate suggests issues with code readability and poor naming.",
    ];

    const result = validateNarrativeNumbers(narrative, metrics);

    expect(result.rejectedSections).toContain("contestInsights");
    expect(result.narrative.contestInsights.join(" ")).not.toMatch(/readability/i);
    expect(result.warnings.join(" ")).toMatch(/source code is never analysed/i);
  });

  it("still allows recommendations that mention teaching cleaner code", () => {
    const metrics = buildAnalytics();
    const narrative = baseNarrative();
    // Advice about teaching is not a claim about what the submissions contained.
    narrative.facultyRecommendations = ["Run a session on refactoring and clean code before the next contest."];

    const result = validateNarrativeNumbers(narrative, metrics);
    expect(result.rejectedSections).not.toContain("facultyRecommendations");
  });

  it("does not flag small ordinals used as prose", () => {
    const metrics = buildAnalytics();
    const grounded = collectGroundedNumbers(metrics);
    expect(findUngroundedNumbers("The top 3 questions covered 2 topics", grounded)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// HTTP surface
// ---------------------------------------------------------------------------

async function seedPublishedContest(repositories: ReturnType<typeof createTestApp>["repositories"]) {
  const contest = buildContestRecord();
  await repositories.contestRepository.save(contest);
  await repositories.contestAttemptRepository.save(
    buildAttempt({ email: "a@x.in", name: "A", score: 110, solvedMinutesIn: 10 }),
  );
  await repositories.contestAttemptRepository.save(
    buildAttempt({ email: "c@x.in", name: "C", score: 105, solvedMinutesIn: 30 }),
  );
  await repositories.submissionRepository.create(buildSubmission("a@x.in", { runtimeMs: 10 }));
  await repositories.submissionRepository.create(buildSubmission("c@x.in", { runtimeMs: 40 }));
  return contest;
}

async function pollUntilSettled(
  app: Parameters<typeof request>[0],
  contestId: string,
  attempts = 40,
) {
  for (let index = 0; index < attempts; index += 1) {
    const response = await request(app).get(`/api/contests/${contestId}/report`).set(facultyHeaders);
    if (response.body.report && response.body.report.status !== "GENERATING") {
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Report did not settle");
}

describe("contest report endpoints", () => {
  it("refuses to generate a report before results are published", async () => {
    const { app, repositories } = createTestApp();
    await repositories.contestRepository.save(buildContestRecord({ resultsPublished: false }));

    const response = await request(app)
      .post("/api/contests/contest_report_1/report")
      .set(facultyHeaders)
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/publish/i);
  });

  it("hides a report from faculty who do not manage the contest", async () => {
    const { app, repositories } = createTestApp();
    await seedPublishedContest(repositories);

    // 404 rather than 403, so faculty cannot probe for other departments' contests.
    const response = await request(app)
      .get("/api/contests/contest_report_1/report")
      .set(otherFacultyHeaders);
    expect(response.status).toBe(404);
  });

  it("refuses students outright", async () => {
    const { app, repositories } = createTestApp();
    await seedPublishedContest(repositories);

    const response = await request(app).get("/api/contests/contest_report_1/report");
    expect(response.status).toBe(403);
  });

  it("returns no report before one has been generated", async () => {
    const { app, repositories } = createTestApp();
    await seedPublishedContest(repositories);

    const response = await request(app)
      .get("/api/contests/contest_report_1/report")
      .set(facultyHeaders);

    expect(response.status).toBe(200);
    expect(response.body.report).toBeNull();
    expect(response.body.aiRuntime.available).toBe(false);

    const pdfResponse = await request(app)
      .get("/api/contests/contest_report_1/report/pdf")
      .set(facultyHeaders);
    expect(pdfResponse.status).toBe(404);
  });

  it("renders a ready report as an inline server-side PDF", async () => {
    const { app, repositories } = createTestApp();
    await seedPublishedContest(repositories);
    await request(app).post("/api/contests/contest_report_1/report").set(facultyHeaders).send({});
    await pollUntilSettled(app, "contest_report_1");

    const response = await request(app)
      .get("/api/contests/contest_report_1/report/pdf")
      .query({ subtitle: "Prepared for Review", narrative: "true", proctoring: "false" })
      .set(facultyHeaders);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/pdf/);
    expect(response.headers["content-disposition"]).toContain("inline");
    expect(response.headers["content-disposition"]).toContain("contest-contest_report_1-report.pdf");
    expect(response.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(response.body.length).toBeGreaterThan(10_000);
  }, 30_000);

  it("generates asynchronously and settles into a readable report", async () => {
    const { app, repositories } = createTestApp();
    await seedPublishedContest(repositories);

    const started = await request(app)
      .post("/api/contests/contest_report_1/report")
      .set(facultyHeaders)
      .send({});

    expect(started.status).toBe(202);
    expect(started.body.report.status).toBe("GENERATING");

    const settled = await pollUntilSettled(app, "contest_report_1");
    const report = settled.body.report;

    expect(report.status).toBe("READY");
    // No model is installed in tests, so the template path must carry the whole report.
    expect(report.source).toBe("TEMPLATE");
    expect(report.narrative.executiveSummary).toContain("Data Structures Sprint");
    expect(report.narrative.facultyRecommendations.length).toBeGreaterThan(0);
    expect(report.metrics.participation.attemptedCount).toBe(2);
    expect(report.metricsHash).toHaveLength(64);
    expect(report.promptVersion).toBe(PROMPT_VERSION);
  });

  it("does not start a second run while one is in flight", async () => {
    const { app, repositories } = createTestApp();
    await seedPublishedContest(repositories);

    const [first, second] = await Promise.all([
      request(app).post("/api/contests/contest_report_1/report").set(facultyHeaders).send({}),
      request(app).post("/api/contests/contest_report_1/report").set(facultyHeaders).send({}),
    ]);

    // Both callers get an answer; neither gets an error, and only one generation is running.
    expect([200, 202]).toContain(first.status);
    expect([200, 202]).toContain(second.status);

    const settled = await pollUntilSettled(app, "contest_report_1");
    expect(settled.body.report.status).toBe("READY");
  });

  it("returns the existing report unless regeneration is forced", async () => {
    const { app, repositories } = createTestApp();
    await seedPublishedContest(repositories);

    await request(app).post("/api/contests/contest_report_1/report").set(facultyHeaders).send({});
    const first = await pollUntilSettled(app, "contest_report_1");
    const firstGeneratedAt = first.body.report.generatedAt;

    const cached = await request(app)
      .post("/api/contests/contest_report_1/report")
      .set(facultyHeaders)
      .send({});
    expect(cached.status).toBe(200);
    expect(cached.body.report.generatedAt).toBe(firstGeneratedAt);

    const forced = await request(app)
      .post("/api/contests/contest_report_1/report")
      .set(facultyHeaders)
      .send({ force: true });
    expect(forced.status).toBe(202);

    const second = await pollUntilSettled(app, "contest_report_1");
    expect(second.body.report.generatedAt).not.toBe(firstGeneratedAt);
  });

  it("falls back to templates when the model throws", async () => {
    const brokenGenerator: AiReportGenerator = {
      async getStatus() {
        return { available: true, model: "qwen2.5:3b", baseUrl: "http://localhost:11434", reason: null };
      },
      async generate() {
        throw new Error("model exploded");
      },
    };

    const { app, repositories } = createTestApp({ aiReportGenerator: brokenGenerator });
    await seedPublishedContest(repositories);

    await request(app).post("/api/contests/contest_report_1/report").set(facultyHeaders).send({});
    const settled = await pollUntilSettled(app, "contest_report_1");

    // A model crash must not lose the metrics — they are computed without it.
    expect(settled.body.report.status).toBe("FAILED");
    expect(settled.body.report.failureReason).toContain("model exploded");
    expect(settled.body.report.metrics.participation.attemptedCount).toBe(2);

    const pdfResponse = await request(app)
      .get("/api/contests/contest_report_1/report/pdf")
      .set(facultyHeaders);
    expect(pdfResponse.status).toBe(409);
  });

  it("labels a report as AI-written only when the model's text survived grounding", async () => {
    const fabricatingGenerator: AiReportGenerator = {
      async getStatus() {
        return { available: true, model: "qwen2.5:3b", baseUrl: "http://localhost:11434", reason: null };
      },
      async generate() {
        return {
          narrative: {
            executiveSummary: "An extraordinary 9418 students competed for 7734 points.",
            contestInsights: ["Roughly 8123 submissions were judged."],
            efficiencyObservations: ["Median runtime was 6042 ms."],
            studentPerformanceObservations: ["The mean score reached 4471."],
            facultyRecommendations: ["Scale the venue for 9418 attendees."],
          },
          usedAi: true,
          modelId: "qwen2.5:3b",
          promptVersion: PROMPT_VERSION,
          warnings: [],
        };
      },
    };

    const { app, repositories } = createTestApp({ aiReportGenerator: fabricatingGenerator });
    await seedPublishedContest(repositories);

    await request(app).post("/api/contests/contest_report_1/report").set(facultyHeaders).send({});
    const settled = await pollUntilSettled(app, "contest_report_1");
    const report = settled.body.report;

    expect(report.status).toBe("READY");
    // Every section was fabricated, so nothing of the model's survived — it must not be credited.
    expect(report.source).toBe("TEMPLATE");
    expect(report.modelId).toBeNull();
    expect(JSON.stringify(report.narrative)).not.toContain("9418");
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it("serves live metrics without needing a generated report", async () => {
    const { app, repositories } = createTestApp();
    await seedPublishedContest(repositories);

    const response = await request(app)
      .get("/api/contests/contest_report_1/report/metrics")
      .set(facultyHeaders);

    expect(response.status).toBe(200);
    expect(response.body.metrics.contest.title).toBe("Data Structures Sprint");
    expect(response.body.metrics.optimalCode.perQuestion).toHaveLength(1);
    // Source code must never reach a reporting payload.
    expect(JSON.stringify(response.body)).not.toContain("int main");
  });
});
