import { describe, expect, it } from "vitest";

import {
  buildContestReportHtml,
  buildReportFooterTemplate,
  buildReportHeaderTemplate,
  renderContestReportPdf,
} from "./report-pdf";
import type { ContestReportResponse } from "./report.model";

function buildReport(): ContestReportResponse {
  return {
    contestId: "contest_pdf_1",
    status: "READY",
    source: "TEMPLATE",
    modelId: null,
    promptVersion: null,
    metricsHash: "a".repeat(64),
    generatedByEmail: "faculty@tcetmumbai.in",
    generatedAt: "2026-08-02T10:00:00.000Z",
    warnings: [],
    failureReason: null,
    narrative: {
      executiveSummary: "A report with <escaped> content.",
      contestInsights: ["Question 1 was the most accessible."],
      efficiencyObservations: ["Java submissions had the strongest baseline."],
      studentPerformanceObservations: ["Scores covered the full available range."],
      facultyRecommendations: ["Review the most difficult question."],
    },
    metrics: {
      schemaVersion: "1.0.0",
      contest: {
        id: "contest_pdf_1",
        title: "Algorithms <Round 1>",
        type: "Rated",
        startAt: "2026-08-01T09:00:00.000Z",
        endAt: "2026-08-01T12:00:00.000Z",
        durationMinutes: 180,
        targetDepartment: null,
        questionCount: 1,
        codingQuestionCount: 1,
        totalPoints: 100,
      },
      participation: {
        registeredCount: 10,
        attemptedCount: 8,
        completedCount: 8,
        activeCount: 0,
        disqualifiedCount: 0,
        registrationToAttemptRate: 0.8,
        completionRate: 1,
        departmentBreakdown: [],
      },
      scores: {
        totalPoints: 100,
        averageScore: 70,
        medianScore: 75,
        maxScore: 100,
        minScore: 0,
        stdDev: 20,
        averageScorePercent: 70,
        scoreDistribution: [],
        averageTimeTakenMs: 3600000,
        medianTimeTakenMs: 3300000,
      },
      questions: [
        {
          questionId: "q1",
          questionNumber: 1,
          type: "Coding",
          title: "Sort <values>",
          points: 100,
          difficulty: "Medium",
          participantCount: 8,
          attemptedCount: 8,
          solvedCount: 6,
          solveRate: 0.75,
          attemptRate: 1,
          averageAttempts: 2,
          averageAwardedPoints: 75,
          averagePassRate: 0.75,
          averageTimeToSolveMs: 1800000,
        },
      ],
      hardestQuestion: { questionId: "q1", questionNumber: 1, title: "Sort <values>", solveRate: 0.75 },
      easiestQuestion: { questionId: "q1", questionNumber: 1, title: "Sort <values>", solveRate: 0.75 },
      languages: [],
      optimalCode: { perQuestion: [], perLanguage: [], overall: null, overallSelectionNote: "No ranking available." },
      violations: { totalEvents: 0, averagePerAttempt: 0, attemptsWithViolations: 0, byType: [], scoreByViolationBand: [] },
      teachingInsights: { lowSolveRateQuestions: [], highAttemptLowSolveQuestions: [], unattemptedQuestions: [], languageDisadvantageFlags: [] },
      dataQuality: { lowSampleLanguages: [], percentileBasisNotes: [], excludedFromRanking: [], generatedAt: "2026-08-02T10:00:00.000Z" },
    },
  };
}

describe("server-side contest report PDF", () => {
  it("builds a self-contained, escaped HTML report with fixed print rules", () => {
    const html = buildContestReportHtml(buildReport(), { subtitle: "Prepared for <Committee>" });

    expect(html).toContain("@page { size: A4 portrait; }");
    expect(html).not.toContain("@page { size: A4 portrait; margin: 0; }");
    expect(html).toContain("Algorithms &lt;Round 1&gt;");
    expect(html).toContain("Prepared for &lt;Committee&gt;");
    expect(html).toContain("table-header-group");
    expect(html).not.toContain("page-break");
    expect(html).not.toContain("Preparing report");
    expect(html).not.toContain("Report could not be prepared");

    const header = buildReportHeaderTemplate("Algorithms <Round 1>", "data:image/png;base64,logo");
    expect(header).toContain("TCET Coding Platform");
    expect(header).toContain("data:image/png;base64,logo");
    expect(buildReportFooterTemplate()).toContain("pageNumber");
  });

  it("renders a non-empty PDF payload with Playwright", async () => {
    const pdf = await renderContestReportPdf(buildReport(), { subtitle: "PDF smoke test" });

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10_000);
  }, 30_000);
});
