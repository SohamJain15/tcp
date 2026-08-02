import { describe, expect, it } from "vitest";

import type { ContestAnalytics, ContestReport, OptimalSubmission } from "@/api/types";
import { DEFAULT_PRINT_SECTIONS, buildContestReportHtml } from "./contest-report-pdf";

function optimal(overrides: Partial<OptimalSubmission> = {}): OptimalSubmission {
  return {
    submissionId: "sub_1",
    attemptId: "att_1",
    questionId: "q1",
    questionNumber: 1,
    questionTitle: "Strings",
    studentEmail: "faahad@tcetmumbai.in",
    studentName: "Faahad Shaikh",
    language: "java",
    runtimeMs: 40,
    memoryKb: 37273,
    runtimePercentile: 0.98,
    memoryPercentile: 0.98,
    percentileBasis: "question 1 · java",
    percentileSampleSize: 26,
    attemptsCount: 3,
    attemptEfficiencyScore: 0.3333,
    timeToSolveMs: 2_520_000,
    solveSpeedPercentile: 0.72,
    violationCount: 1,
    totalScore: 0.8117,
    breakdown: [
      { component: "Runtime efficiency", weight: 0.4, rawValue: 40, normalized: 0.98, contribution: 0.392 },
      { component: "Memory efficiency", weight: 0.25, rawValue: 37273, normalized: 0.98, contribution: 0.245 },
      { component: "Attempt efficiency", weight: 0.2, rawValue: 3, normalized: 0.3333, contribution: 0.0667 },
      { component: "Solve speed", weight: 0.15, rawValue: 2520000, normalized: 0.72, contribution: 0.108 },
    ],
    ...overrides,
  };
}

function buildMetrics(overrides: Partial<ContestAnalytics> = {}): ContestAnalytics {
  return {
    schemaVersion: "1.0.0",
    contest: {
      id: "c1",
      title: "Coding Competition <Round 1>",
      type: "Rated",
      startAt: "2026-07-25T09:30:00.000Z",
      endAt: "2026-07-26T16:30:00.000Z",
      durationMinutes: 180,
      targetDepartment: "B.E. Computer Engineering",
      questionCount: 2,
      codingQuestionCount: 2,
      totalPoints: 100,
    },
    participation: {
      registeredCount: 40,
      attemptedCount: 28,
      completedCount: 28,
      activeCount: 0,
      disqualifiedCount: 0,
      registrationToAttemptRate: 0.7,
      completionRate: 1,
      departmentBreakdown: [],
    },
    scores: {
      totalPoints: 100,
      averageScore: 61.07,
      medianScore: 82.5,
      maxScore: 100,
      minScore: 0,
      stdDev: 38.4,
      averageScorePercent: 61.07,
      scoreDistribution: [],
      averageTimeTakenMs: 4_012_000,
      medianTimeTakenMs: 3_900_000,
    },
    questions: [
      {
        questionId: "q1", questionNumber: 1, type: "Coding", title: "Strings", points: 40,
        difficulty: "Medium", participantCount: 28, attemptedCount: 26, solvedCount: 21,
        solveRate: 0.75, attemptRate: 0.93, averageAttempts: 2.4, averageAwardedPoints: 31.2,
        averagePassRate: 0.82, averageTimeToSolveMs: 2_100_000,
      },
      {
        questionId: "q2", questionNumber: 2, type: "Coding", title: "Matrix Rotation", points: 60,
        difficulty: "Hard", participantCount: 28, attemptedCount: 19, solvedCount: 6,
        solveRate: 0.21, attemptRate: 0.68, averageAttempts: 3.8, averageAwardedPoints: 9.4,
        // A question whose every solve timestamp was a publish artefact.
        averagePassRate: 0.31, averageTimeToSolveMs: null,
      },
    ],
    hardestQuestion: { questionId: "q2", questionNumber: 2, title: "Matrix Rotation", solveRate: 0.21 },
    easiestQuestion: { questionId: "q1", questionNumber: 1, title: "Strings", solveRate: 0.75 },
    languages: [
      {
        language: "java", submissionCount: 44, acceptedCount: 26, acceptanceRate: 0.59, sampleSize: 26,
        confidence: "high", studentCount: 18,
        runtimeMs: { mean: 62, median: 49.5, p25: 38, p75: 80, p90: 120, min: 12, max: 210 },
        memoryKb: { mean: 39000, median: 38502, p25: 35000, p75: 42000, p90: 47000, min: 30000, max: 52000 },
      },
      {
        language: "python", submissionCount: 3, acceptedCount: 2, acceptanceRate: 0.67, sampleSize: 2,
        confidence: "low", studentCount: 2,
        runtimeMs: { mean: 320, median: 320, p25: 300, p75: 340, p90: 350, min: 300, max: 340 },
        memoryKb: { mean: 12000, median: 12000, p25: 11800, p75: 12200, p90: 12300, min: 11800, max: 12200 },
      },
    ],
    optimalCode: {
      overall: optimal(),
      perLanguage: [
        optimal({ submissionId: "L_java" }),
        optimal({
          submissionId: "L_py", language: "python", studentName: "Aditya Rao", runtimeMs: 300,
          percentileBasis: "python only (2 submissions)", percentileSampleSize: 2, timeToSolveMs: null,
        }),
      ],
      perQuestion: [
        optimal(),
        optimal({ submissionId: "Q2", questionNumber: 2, questionTitle: "Matrix Rotation" }),
      ],
      overallSelectionNote: "Selected from languages with enough submissions to form a reliable baseline.",
    },
    violations: {
      totalEvents: 54,
      averagePerAttempt: 1.93,
      attemptsWithViolations: 18,
      byType: [{ type: "TAB_SWITCH", count: 31 }],
      scoreByViolationBand: [
        { band: "0", attemptCount: 10, averageScore: 71.2 },
        { band: "3+", attemptCount: 10, averageScore: 49.1 },
      ],
    },
    teachingInsights: {
      lowSolveRateQuestions: [], highAttemptLowSolveQuestions: [],
      unattemptedQuestions: [], languageDisadvantageFlags: [],
    },
    dataQuality: {
      lowSampleLanguages: ["python (2 accepted submissions)"],
      percentileBasisNotes: ["4 solve timestamps were recorded after the attempt closed"],
      excludedFromRanking: [],
      generatedAt: "2026-08-02T08:19:18.000Z",
    },
    ...overrides,
  };
}

function buildReport(overrides: Partial<ContestReport> = {}): ContestReport {
  return {
    contestId: "c1",
    status: "READY",
    source: "AI",
    metrics: null,
    narrative: {
      executiveSummary: "28 of 40 registered students started and all 28 finished.",
      contestInsights: ["Hardest question: Q2 at 21% solved."],
      efficiencyObservations: ["java: median runtime 49.5 ms."],
      studentPerformanceObservations: ["Scores ranged from 0 to 100."],
      facultyRecommendations: ["Review the wording of Q2."],
    },
    warnings: [],
    modelId: "qwen2.5:3b",
    promptVersion: "1.0.0",
    metricsHash: "9f2c41ab77de0315c8b4e6a190fd2277c0e5b8a41d3f6e92aa0c17d4b8e5f301",
    generatedByEmail: "faculty1@tcetmumbai.in",
    generatedAt: "2026-08-02T08:19:18.000Z",
    failureReason: null,
    ...overrides,
  };
}

function render(overrides: Parameters<typeof buildContestReportHtml>[0] extends never ? never : Partial<{
  report: ContestReport;
  metrics: ContestAnalytics;
  subtitle: string;
  sections: typeof DEFAULT_PRINT_SECTIONS;
}> = {}) {
  return buildContestReportHtml({
    report: overrides.report ?? buildReport(),
    metrics: overrides.metrics ?? buildMetrics(),
    subtitle: overrides.subtitle,
    sections: overrides.sections,
    logoDataUri: "data:image/jpeg;base64,AAAA",
  });
}

describe("contest report print document", () => {
  it("brands every page with the logo and platform name", () => {
    const html = render();
    // The header is position:fixed, which is what makes Chrome repeat it on each printed page.
    expect(html).toContain("TCET Coding Platform");
    expect(html).toContain('src="data:image/jpeg;base64,AAAA"');
    expect(html).toMatch(/\.running-header[^{]*\{[^}]*position:\s*fixed/s);
    expect(html).toContain('class="running-footer"');
  });

  it("renders every section in reading order", () => {
    const html = render();
    const headings = [...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map((match) => match[1]);
    expect(headings).toEqual([
      "Executive summary",
      "Participation and scoring",
      "Contest insights",
      "Question breakdown",
      "Language efficiency",
      "Most optimal code",
      "Efficiency observations",
      "Student performance",
      "Proctoring",
      "Recommendations",
      "Methodology and limitations",
    ]);
  });

  it("shows overall, per-language and per-question winners", () => {
    const kickers = [...render().matchAll(/optimal-kicker">([^<]+)</g)].map((match) => match[1]);
    expect(kickers).toContain("Most optimal overall");
    expect(kickers).toContain("Best in java");
    expect(kickers).toContain("Best in python");
    // Q1's winner is also the overall winner; it must still appear under per-question, labelled,
    // otherwise the sequence skips Q1 and reads as "nobody solved it".
    expect(kickers).toContain("Best for Q1 (also best overall)");
    expect(kickers).toContain("Best for Q2");
  });

  it("escapes contest and student data", () => {
    const metrics = buildMetrics();
    metrics.contest.title = '<script>alert("xss")</script>';
    metrics.optimalCode.overall = optimal({ studentName: "<img src=x onerror=1>" });

    const html = render({ metrics });
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("omits sections the faculty deselected", () => {
    const html = render({
      sections: { ...DEFAULT_PRINT_SECTIONS, proctoring: false, optimalCode: false },
    });
    expect(html).not.toContain("<h2>Proctoring</h2>");
    expect(html).not.toContain("<h2>Most optimal code</h2>");
    // Participation and methodology are unconditional, so the document always stands alone.
    expect(html).toContain("<h2>Participation and scoring</h2>");
    expect(html).toContain("<h2>Methodology and limitations</h2>");
  });

  it("still produces a report when there is no narrative", () => {
    const html = render({ report: buildReport({ narrative: null, source: "TEMPLATE", modelId: null }) });
    expect(html).not.toContain("<h2>Executive summary</h2>");
    expect(html).toContain("<h2>Question breakdown</h2>");
    expect(html).toContain("no language model was involved");
  });

  it("renders unknown solve times as a dash rather than zero", () => {
    const html = render();
    // averageTimeToSolveMs is null for Q2 after the publish-artefact fix; printing "0s" would imply
    // an instant solve.
    expect(html).toContain("—");
    expect(html).not.toMatch(/<td class="num">0s<\/td>/);
  });

  it("states that the ranking is efficiency-only and separate from grading", () => {
    const html = render();
    expect(html).toMatch(/efficiency only/i);
    expect(html).toMatch(/violations do not affect the efficiency ranking/i);
    expect(html).toMatch(/compared only within a language/i);
  });

  it("renders a report persisted before perLanguage existed", () => {
    // Reports are stored, so a blob written by an earlier release has no `perLanguage`. Reading
    // `.length` off it threw, and the swallowed rejection left faculty on a blank about:blank tab.
    const metrics = buildMetrics();
    delete (metrics.optimalCode as Partial<ContestAnalytics["optimalCode"]>).perLanguage;

    const html = render({ metrics });
    expect(html).toContain("<h2>Most optimal code</h2>");
    expect(html).toContain("Most optimal overall");
    // The per-language group simply does not appear; everything else still renders.
    expect(html).not.toContain("Best in java");
    expect(html).toContain("Best for Q2");
  });

  it("survives a metrics blob missing its optional collections entirely", () => {
    const metrics = buildMetrics();
    delete (metrics as Partial<ContestAnalytics>).dataQuality;
    (metrics.violations as Partial<ContestAnalytics["violations"]>).byType = undefined;

    expect(() => render({ metrics })).not.toThrow();
  });

  it("carries the data fingerprint for traceability", () => {
    expect(render()).toContain("9f2c41ab77de0315");
  });

  it("repeats table headers across page breaks", () => {
    expect(render()).toMatch(/thead\s*\{\s*display:\s*table-header-group/);
  });
});
