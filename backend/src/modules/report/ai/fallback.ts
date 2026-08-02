import type { ContestAnalytics, ContestReportNarrative, NarrativeSection } from "../report.model";

/**
 * Deterministic, template-generated narrative.
 *
 * This is not a degraded mode to be embarrassed about — it is the floor the whole feature stands on.
 * It runs when no local model is installed, when Ollama is down, when generation times out, and
 * per-section when the grounding validator rejects what the model wrote. Every sentence here is
 * assembled from the metrics, so it is correct by construction.
 */

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function minutes(ms: number | null): string {
  if (ms === null) {
    return "not recorded";
  }
  const value = ms / 60000;
  return value >= 1 ? `${Math.round(value)} min` : `${Math.round(ms / 1000)} sec`;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function buildExecutiveSummary(metrics: ContestAnalytics): string {
  const { contest, participation, scores } = metrics;

  const parts = [
    `${contest.title} ran for ${contest.durationMinutes} minutes with ${plural(
      contest.questionCount,
      "question",
    )} worth ${contest.totalPoints} points.`,
    `${plural(participation.attemptedCount, "student")} of ${participation.registeredCount} registered started the contest, and ${participation.completedCount} finished (${percent(
      participation.completionRate,
    )} completion).`,
  ];

  if (participation.completedCount > 0) {
    parts.push(
      `The average score was ${scores.averageScore} of ${scores.totalPoints} (${scores.averageScorePercent}%), with a median of ${scores.medianScore} and a spread from ${scores.minScore} to ${scores.maxScore}.`,
    );
    parts.push(`Completed attempts took ${minutes(scores.averageTimeTakenMs)} on average.`);
  } else {
    parts.push("No attempt was completed, so score statistics are not available for this contest.");
  }

  return parts.join(" ");
}

export function buildContestInsights(metrics: ContestAnalytics): string[] {
  const insights: string[] = [];
  const { hardestQuestion, easiestQuestion, scores, participation, questions } = metrics;

  if (hardestQuestion) {
    insights.push(
      `Hardest question: Q${hardestQuestion.questionNumber} "${hardestQuestion.title}" with a ${percent(
        hardestQuestion.solveRate,
      )} solve rate.`,
    );
  }
  if (easiestQuestion && easiestQuestion.questionId !== hardestQuestion?.questionId) {
    insights.push(
      `Easiest question: Q${easiestQuestion.questionNumber} "${easiestQuestion.title}" with a ${percent(
        easiestQuestion.solveRate,
      )} solve rate.`,
    );
  }

  const spread = questions.length > 1 && hardestQuestion && easiestQuestion
    ? easiestQuestion.solveRate - hardestQuestion.solveRate
    : 0;
  if (spread > 0.5) {
    insights.push(
      `Solve rates ranged widely across questions (${percent(spread)} between the easiest and hardest), suggesting an uneven difficulty curve.`,
    );
  }

  if (scores.stdDev > 0) {
    insights.push(
      `Scores had a standard deviation of ${scores.stdDev} points around a mean of ${scores.averageScore}.`,
    );
  }

  if (participation.registeredCount > participation.attemptedCount) {
    insights.push(
      `${plural(
        participation.registeredCount - participation.attemptedCount,
        "registered student",
      )} never started the contest (${percent(participation.registrationToAttemptRate)} of registrations converted to attempts).`,
    );
  }

  if (participation.activeCount > 0) {
    insights.push(
      `${plural(participation.activeCount, "attempt")} was never submitted and is excluded from all score statistics.`,
    );
  }

  return insights.length > 0 ? insights : ["Not enough activity was recorded to draw contest-level insights."];
}

export function buildEfficiencyObservations(metrics: ContestAnalytics): string[] {
  const observations: string[] = [];
  const { languages, optimalCode, dataQuality } = metrics;

  if (languages.length === 0) {
    return ["No coding submissions were recorded, so there is no efficiency data to compare."];
  }

  const ranked = [...languages].sort((a, b) => b.submissionCount - a.submissionCount);
  observations.push(
    `${plural(languages.length, "language was", "languages were")} used. Most submissions came from ${
      ranked[0].language
    } (${plural(ranked[0].submissionCount, "submission")}, ${percent(ranked[0].acceptanceRate)} accepted).`,
  );

  for (const entry of ranked.filter((item) => item.confidence === "high").slice(0, 4)) {
    observations.push(
      `${entry.language}: median runtime ${entry.runtimeMs.median} ms and median memory ${Math.round(
        entry.memoryKb.median / 1024,
      )} MB across ${plural(entry.sampleSize, "accepted submission")}.`,
    );
  }

  if (optimalCode.overall) {
    const best = optimalCode.overall;
    observations.push(
      `The most efficient submission overall was Q${best.questionNumber} in ${best.language} at ${best.runtimeMs} ms and ${Math.round(
        best.memoryKb / 1024,
      )} MB, ranked against ${best.percentileBasis}.`,
    );
  }

  if (dataQuality.lowSampleLanguages.length > 0) {
    observations.push(
      `Runtime and memory figures for ${dataQuality.lowSampleLanguages.join(
        ", ",
      )} rest on too few submissions to form a reliable baseline and should not be compared against other languages.`,
    );
  }

  return observations;
}

export function buildStudentPerformanceObservations(metrics: ContestAnalytics): string[] {
  const observations: string[] = [];
  const { scores, participation, questions, violations } = metrics;

  if (participation.completedCount === 0) {
    return ["No attempt was completed, so student performance cannot be assessed."];
  }

  observations.push(
    `Scores ranged from ${scores.minScore} to ${scores.maxScore} out of ${scores.totalPoints}, with a median of ${scores.medianScore}.`,
  );

  const solidQuestions = questions.filter((question) => question.solveRate >= 0.7);
  if (solidQuestions.length > 0) {
    observations.push(
      `${plural(solidQuestions.length, "question")} had a solve rate of 70% or higher, indicating the underlying concepts landed.`,
    );
  }

  const struggled = questions.filter((question) => question.solveRate < 0.3 && question.attemptRate > 0);
  if (struggled.length > 0) {
    observations.push(
      `${plural(struggled.length, "question")} was solved by fewer than 30% of participants: ${struggled
        .map((question) => `Q${question.questionNumber}`)
        .join(", ")}.`,
    );
  }

  const retried = questions.filter((question) => question.averageAttempts >= 3);
  if (retried.length > 0) {
    observations.push(
      `Students averaged three or more submissions on ${retried
        .map((question) => `Q${question.questionNumber}`)
        .join(", ")}, which points to trial-and-error rather than a first-pass solution.`,
    );
  }

  if (violations.attemptsWithViolations > 0) {
    observations.push(
      `${plural(violations.attemptsWithViolations, "attempt")} recorded at least one proctoring event, averaging ${violations.averagePerAttempt} per attempt.`,
    );
  }

  return observations;
}

export function buildFacultyRecommendations(metrics: ContestAnalytics): string[] {
  const recommendations: string[] = [];
  const { teachingInsights, participation, hardestQuestion, questions, scores } = metrics;

  if (teachingInsights.highAttemptLowSolveQuestions.length > 0) {
    recommendations.push(
      `Review the wording of ${teachingInsights.highAttemptLowSolveQuestions.join(
        "; ",
      )} — students engaged heavily but rarely succeeded, which more often signals an unclear specification than genuine difficulty.`,
    );
  }

  if (teachingInsights.unattemptedQuestions.length > 0) {
    recommendations.push(
      `${teachingInsights.unattemptedQuestions.join(
        "; ",
      )} went largely unattempted. Consider whether the time limit or question order left students unable to reach them.`,
    );
  }

  if (teachingInsights.lowSolveRateQuestions.length > 0 && hardestQuestion) {
    recommendations.push(
      `Re-teach the concepts behind Q${hardestQuestion.questionNumber} before the next assessment, and consider adding a guided example.`,
    );
  }

  if (teachingInsights.languageDisadvantageFlags.length > 0) {
    recommendations.push(
      `Acceptance rates differ notably by language (${teachingInsights.languageDisadvantageFlags.join(
        "; ",
      )}). Check that time limits and starter templates are workable in every language you allow.`,
    );
  }

  if (participation.registrationToAttemptRate < 0.7 && participation.registeredCount > 0) {
    recommendations.push(
      `Only ${percent(
        participation.registrationToAttemptRate,
      )} of registered students started the contest. A reminder before the window opens may lift turnout.`,
    );
  }

  if (scores.averageScorePercent < 40 && questions.length > 0) {
    recommendations.push(
      `The cohort averaged ${scores.averageScorePercent}% of available points, so the paper was likely pitched above the current level. Consider adding an easier entry question next time.`,
    );
  } else if (scores.averageScorePercent > 85) {
    recommendations.push(
      `The cohort averaged ${scores.averageScorePercent}% of available points, leaving little room to distinguish stronger students. Consider adding a harder question next time.`,
    );
  }

  return recommendations.length > 0
    ? recommendations
    : ["No corrective action stands out from this contest's data; the difficulty and turnout look balanced."];
}

export function buildTemplateNarrative(metrics: ContestAnalytics): ContestReportNarrative {
  return {
    executiveSummary: buildExecutiveSummary(metrics),
    contestInsights: buildContestInsights(metrics),
    efficiencyObservations: buildEfficiencyObservations(metrics),
    studentPerformanceObservations: buildStudentPerformanceObservations(metrics),
    facultyRecommendations: buildFacultyRecommendations(metrics),
  };
}

/** Rebuild a single section from templates — used when the grounding validator rejects the model's. */
export function buildTemplateSection(
  metrics: ContestAnalytics,
  section: NarrativeSection,
): string | string[] {
  switch (section) {
    case "executiveSummary":
      return buildExecutiveSummary(metrics);
    case "contestInsights":
      return buildContestInsights(metrics);
    case "efficiencyObservations":
      return buildEfficiencyObservations(metrics);
    case "studentPerformanceObservations":
      return buildStudentPerformanceObservations(metrics);
    case "facultyRecommendations":
      return buildFacultyRecommendations(metrics);
  }
}
