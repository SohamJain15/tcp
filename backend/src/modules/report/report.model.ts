import { createHash } from "node:crypto";
import { lowerIsBetterPercentile } from "../../shared/utils/percentile";

import type { Department, Difficulty, ExecutableLanguage } from "../../shared/types/domain";
import type {
  ContestAttemptRecord,
  ContestProctoringEventRecord,
  ContestProctoringEventType,
  ContestQuestion,
  ContestQuestionAttemptState,
  ContestQuestionType,
  ContestRecord,
  ContestType,
} from "../contest/contest.model";
import { buildStudentQuestionTitle, computeAttemptTimeTakenMs } from "../contest/contest.model";
import type { SubmissionAnalyticsRecord } from "../submission/submission.repository";

/**
 * Deterministic contest analytics.
 *
 * Everything in this file is pure: it takes already-loaded records and returns plain data. No I/O, no
 * clock reads beyond an explicit `now` argument, no randomness. That is what makes the report
 * reproducible — the same contest data always yields byte-identical metrics, which is in turn what
 * lets `hashMetrics` be meaningful.
 *
 * The AI layer never computes anything; it only paraphrases the output of this file.
 */

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/**
 * Below this many submissions a per-language distribution is noise, not a baseline. Such languages are
 * still reported (faculty should see that someone used Rust) but are flagged `low` and kept out of
 * cross-language comparisons and the "most optimal overall" pick.
 */
export const MIN_LANGUAGE_SAMPLE = 5;

// Re-exported from its new shared home so existing importers and tests are unaffected.
export { lowerIsBetterPercentile };

/**
 * Weights for the "most optimal code" ranking.
 *
 * This ranking deliberately does NOT re-express the contest grade. The platform already grades on test
 * cases passed minus the violation penalty (see `calculateAttemptScore`). This answers a different
 * question: among submissions that fully solved the problem, which one did it most efficiently?
 * Violations are therefore absent here — applying them again would double-count the same conduct.
 *
 * Runtime + memory carry 65%, so the ranking is primarily the language-normalized efficiency
 * comparison; attempts and solve speed break ties between near-identical runtime profiles.
 */
export const OPTIMAL_CODE_WEIGHTS = {
  runtime: 0.4,
  memory: 0.25,
  attemptEfficiency: 0.2,
  solveSpeed: 0.15,
} as const;

export const REPORT_SCHEMA_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReportStatus = "GENERATING" | "READY" | "FAILED";
export type ReportSource = "AI" | "TEMPLATE";
export type MetricConfidence = "high" | "low";

export interface DistributionStats {
  mean: number;
  median: number;
  p25: number;
  p75: number;
  p90: number;
  min: number;
  max: number;
}

export interface ContestAnalyticsContest {
  id: string;
  title: string;
  type: ContestType;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  targetDepartment: Department | null;
  questionCount: number;
  codingQuestionCount: number;
  totalPoints: number;
}

export interface ParticipationMetrics {
  registeredCount: number;
  attemptedCount: number;
  completedCount: number;
  activeCount: number;
  disqualifiedCount: number;
  registrationToAttemptRate: number;
  completionRate: number;
  departmentBreakdown: { department: string; count: number }[];
}

export interface ScoreMetrics {
  totalPoints: number;
  averageScore: number;
  medianScore: number;
  maxScore: number;
  minScore: number;
  stdDev: number;
  averageScorePercent: number;
  scoreDistribution: { bucket: string; count: number }[];
  averageTimeTakenMs: number | null;
  medianTimeTakenMs: number | null;
}

export interface QuestionMetrics {
  questionId: string;
  questionNumber: number;
  type: ContestQuestionType;
  title: string;
  points: number;
  difficulty: Difficulty | null;
  participantCount: number;
  attemptedCount: number;
  solvedCount: number;
  solveRate: number;
  attemptRate: number;
  averageAttempts: number;
  averageAwardedPoints: number;
  /** Coding only: mean of passedCount/totalCount across attempts that submitted. */
  averagePassRate: number | null;
  averageTimeToSolveMs: number | null;
}

export interface LanguageMetrics {
  language: ExecutableLanguage;
  submissionCount: number;
  acceptedCount: number;
  acceptanceRate: number;
  sampleSize: number;
  confidence: MetricConfidence;
  studentCount: number;
  runtimeMs: DistributionStats;
  memoryKb: DistributionStats;
}

export interface OptimalScoreComponent {
  component: string;
  weight: number;
  rawValue: number;
  normalized: number;
  contribution: number;
}

export interface OptimalSubmission {
  submissionId: string;
  attemptId: string;
  questionId: string;
  questionNumber: number;
  questionTitle: string;
  studentEmail: string;
  studentName: string | null;
  language: ExecutableLanguage;
  /** Raw measurements, always surfaced alongside percentiles for transparency. */
  runtimeMs: number;
  memoryKb: number;
  runtimePercentile: number;
  memoryPercentile: number;
  percentileBasis: string;
  percentileSampleSize: number;
  attemptsCount: number;
  attemptEfficiencyScore: number;
  timeToSolveMs: number | null;
  solveSpeedPercentile: number;
  /** Context only. Never contributes to `totalScore` — see OPTIMAL_CODE_WEIGHTS. */
  violationCount: number;
  totalScore: number;
  breakdown: OptimalScoreComponent[];
}

export interface OptimalCodeMetrics {
  perQuestion: OptimalSubmission[];
  /** Best submission written in each language, ranked only against that language's own submissions. */
  perLanguage: OptimalSubmission[];
  overall: OptimalSubmission | null;
  overallSelectionNote: string;
}

export interface ViolationMetrics {
  totalEvents: number;
  averagePerAttempt: number;
  attemptsWithViolations: number;
  byType: { type: ContestProctoringEventType; count: number }[];
  scoreByViolationBand: { band: string; attemptCount: number; averageScore: number }[];
}

export interface TeachingInsights {
  lowSolveRateQuestions: string[];
  highAttemptLowSolveQuestions: string[];
  unattemptedQuestions: string[];
  languageDisadvantageFlags: string[];
}

export interface DataQualityNotes {
  lowSampleLanguages: string[];
  percentileBasisNotes: string[];
  excludedFromRanking: string[];
  generatedAt: string;
}

export interface ContestAnalytics {
  schemaVersion: string;
  contest: ContestAnalyticsContest;
  participation: ParticipationMetrics;
  scores: ScoreMetrics;
  questions: QuestionMetrics[];
  hardestQuestion: { questionId: string; questionNumber: number; title: string; solveRate: number } | null;
  easiestQuestion: { questionId: string; questionNumber: number; title: string; solveRate: number } | null;
  languages: LanguageMetrics[];
  optimalCode: OptimalCodeMetrics;
  violations: ViolationMetrics;
  teachingInsights: TeachingInsights;
  dataQuality: DataQualityNotes;
}

export interface ContestReportNarrative {
  executiveSummary: string;
  contestInsights: string[];
  /** Runtime / memory / language patterns. Never code review — no source code is read anywhere. */
  efficiencyObservations: string[];
  studentPerformanceObservations: string[];
  facultyRecommendations: string[];
}

export const NARRATIVE_SECTIONS = [
  "executiveSummary",
  "contestInsights",
  "efficiencyObservations",
  "studentPerformanceObservations",
  "facultyRecommendations",
] as const;

export type NarrativeSection = (typeof NARRATIVE_SECTIONS)[number];

/**
 * Type-safe write into a narrative section, coercing to the section's own shape.
 *
 * `executiveSummary` is a paragraph and the rest are bullet lists, so a generic string-keyed write
 * would need a cast. Coercing here also absorbs a model that returns bullets where a paragraph was
 * asked for, or vice versa.
 */
export function assignNarrativeSection(
  narrative: ContestReportNarrative,
  section: NarrativeSection,
  value: string | string[],
): void {
  if (section === "executiveSummary") {
    narrative.executiveSummary = Array.isArray(value) ? value.join(" ") : value;
    return;
  }
  narrative[section] = Array.isArray(value) ? value : [value];
}

export interface ContestReportRecord {
  id: string;
  contestId: string;
  status: ReportStatus;
  source: ReportSource;
  metrics: ContestAnalytics | null;
  narrative: ContestReportNarrative | null;
  warnings: string[];
  modelId: string | null;
  promptVersion: string | null;
  metricsHash: string | null;
  generatedByEmail: string;
  generationStartedAt: Date;
  generatedAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContestReportResponse {
  contestId: string;
  status: ReportStatus;
  source: ReportSource;
  metrics: ContestAnalytics | null;
  narrative: ContestReportNarrative | null;
  warnings: string[];
  modelId: string | null;
  promptVersion: string | null;
  metricsHash: string | null;
  generatedByEmail: string;
  generatedAt: string | null;
  failureReason: string | null;
}

export function toContestReportResponse(record: ContestReportRecord): ContestReportResponse {
  return {
    contestId: record.contestId,
    status: record.status,
    source: record.source,
    metrics: record.metrics,
    narrative: record.narrative,
    warnings: record.warnings,
    modelId: record.modelId,
    promptVersion: record.promptVersion,
    metricsHash: record.metricsHash,
    generatedByEmail: record.generatedByEmail,
    generatedAt: record.generatedAt ? record.generatedAt.toISOString() : null,
    failureReason: record.failureReason,
  };
}

// ---------------------------------------------------------------------------
// Numeric primitives
// ---------------------------------------------------------------------------

function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return round(values.reduce((total, value) => total + value, 0) / values.length);
}

/** Linear-interpolated quantile over an ascending-sorted array. */
export function quantile(sortedValues: readonly number[], q: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }
  if (sortedValues.length === 1) {
    return round(sortedValues[0]);
  }

  const position = (sortedValues.length - 1) * Math.min(Math.max(q, 0), 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) {
    return round(sortedValues[lower]);
  }
  return round(sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower));
}

export function median(values: readonly number[]): number {
  return quantile([...values].sort((a, b) => a - b), 0.5);
}

export function stdDev(values: readonly number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const average = values.reduce((total, value) => total + value, 0) / values.length;
  const variance =
    values.reduce((total, value) => total + (value - average) ** 2, 0) / (values.length - 1);
  return round(Math.sqrt(variance));
}

export function computeDistribution(values: readonly number[]): DistributionStats {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    mean: mean(sorted),
    median: quantile(sorted, 0.5),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    min: sorted.length > 0 ? round(sorted[0]) : 0,
    max: sorted.length > 0 ? round(sorted[sorted.length - 1]) : 0,
  };
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return round(numerator / denominator, 4);
}

// ---------------------------------------------------------------------------
// Attempt filtering
// ---------------------------------------------------------------------------

/**
 * Attempts that count towards the report. ACTIVE attempts are excluded: they were never finalised, so
 * their score is not comparable with a submitted attempt's and including them would drag every average
 * down for a reason that has nothing to do with the contest.
 */
export function selectScoredAttempts(attempts: readonly ContestAttemptRecord[]): ContestAttemptRecord[] {
  return attempts.filter(
    (attempt) => attempt.status === "SUBMITTED" || attempt.status === "AUTO_SUBMITTED",
  );
}

function findState(
  attempt: ContestAttemptRecord,
  questionId: string,
): ContestQuestionAttemptState | undefined {
  return attempt.questionStates.find((state) => state.questionId === questionId);
}

/**
 * How long the student took to solve a question, or `null` when that cannot be known.
 *
 * `solvedAt` is not always a solve time. `scoreCodingQuestionState` stamps `state.solvedAt ?? now`,
 * and the grading pass that calls it runs at **publish**, so any question whose solve was never
 * timestamped during the contest — an auto-submitted draft, or a submission judged after the attempt
 * closed — ends up carrying the moment faculty clicked Publish. Subtracting `startedAt` from that
 * measures the gap between the contest and the publish click; in production it produced a 673-minute
 * "solve time" on a contest with a 180-minute attempt limit.
 *
 * A solve cannot happen after the attempt closed, so a later timestamp is discarded rather than
 * trusted. `null` already means "unknown" downstream: excluded from averages, and scored as a neutral
 * 0.5 percentile rather than punished as if it were the slowest solve in the contest.
 */
export function resolveSolveTimeMs(
  attempt: ContestAttemptRecord,
  state: ContestQuestionAttemptState,
): number | null {
  if (!state.solvedAt) {
    return null;
  }

  const attemptEndedAt = attempt.submittedAt ?? attempt.autoSubmittedAt ?? attempt.deadlineAt;
  if (state.solvedAt.getTime() > attemptEndedAt.getTime()) {
    return null;
  }

  return Math.max(0, state.solvedAt.getTime() - attempt.startedAt.getTime());
}

/** Counts solved questions whose timestamp had to be discarded, so the UI can explain the gaps. */
export function countDiscardedSolveTimes(attempts: readonly ContestAttemptRecord[]): number {
  let discarded = 0;
  for (const attempt of attempts) {
    for (const state of attempt.questionStates) {
      if (state.solvedAt && resolveSolveTimeMs(attempt, state) === null) {
        discarded += 1;
      }
    }
  }
  return discarded;
}

// ---------------------------------------------------------------------------
// Participation
// ---------------------------------------------------------------------------

export function computeParticipation(
  attempts: readonly ContestAttemptRecord[],
  registeredCount: number,
): ParticipationMetrics {
  const completed = attempts.filter(
    (attempt) => attempt.status === "SUBMITTED" || attempt.status === "AUTO_SUBMITTED",
  ).length;
  const active = attempts.filter((attempt) => attempt.status === "ACTIVE").length;
  const disqualified = attempts.filter((attempt) => attempt.status === "DISQUALIFIED").length;

  const departmentCounts = new Map<string, number>();
  for (const attempt of attempts) {
    const key = attempt.userDepartment ?? "Unspecified";
    departmentCounts.set(key, (departmentCounts.get(key) ?? 0) + 1);
  }

  return {
    registeredCount,
    attemptedCount: attempts.length,
    completedCount: completed,
    activeCount: active,
    disqualifiedCount: disqualified,
    registrationToAttemptRate: rate(attempts.length, registeredCount),
    completionRate: rate(completed, attempts.length),
    departmentBreakdown: [...departmentCounts.entries()]
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count || a.department.localeCompare(b.department)),
  };
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

export function computeScoreStats(
  attempts: readonly ContestAttemptRecord[],
  totalPoints: number,
): ScoreMetrics {
  const scores = attempts.map((attempt) => attempt.score);
  const times = attempts
    .map((attempt) => attempt.timeTakenMs ?? computeAttemptTimeTakenMs(attempt))
    .filter((value): value is number => value !== null);

  // Ten fixed buckets over the available points, so histograms are comparable between contests.
  const bucketCount = 10;
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const lower = totalPoints > 0 ? Math.round((totalPoints * index) / bucketCount) : index;
    const upper = totalPoints > 0 ? Math.round((totalPoints * (index + 1)) / bucketCount) : index + 1;
    return { bucket: `${lower}-${upper}`, lower, upper, count: 0 };
  });

  for (const score of scores) {
    const ratio = totalPoints > 0 ? score / totalPoints : 0;
    const index = Math.min(bucketCount - 1, Math.max(0, Math.floor(ratio * bucketCount)));
    buckets[index].count += 1;
  }

  return {
    totalPoints,
    averageScore: mean(scores),
    medianScore: median(scores),
    maxScore: scores.length > 0 ? Math.max(...scores) : 0,
    minScore: scores.length > 0 ? Math.min(...scores) : 0,
    stdDev: stdDev(scores),
    averageScorePercent: totalPoints > 0 ? round((mean(scores) / totalPoints) * 100) : 0,
    scoreDistribution: buckets.map(({ bucket, count }) => ({ bucket, count })),
    averageTimeTakenMs: times.length > 0 ? Math.round(mean(times)) : null,
    medianTimeTakenMs: times.length > 0 ? Math.round(median(times)) : null,
  };
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export function computeQuestionStats(
  contest: ContestRecord,
  attempts: readonly ContestAttemptRecord[],
): QuestionMetrics[] {
  return contest.questions.map((question, index) => {
    const states = attempts
      .map((attempt) => ({ attempt, state: findState(attempt, question.id) }))
      .filter((entry): entry is { attempt: ContestAttemptRecord; state: ContestQuestionAttemptState } =>
        Boolean(entry.state),
      );

    const attemptedStates = states.filter((entry) => entry.state.status !== "UNATTEMPTED");
    const solvedStates = states.filter((entry) => entry.state.status === "SOLVED");

    const passRates = question.type === "Coding"
      ? states
          .filter((entry) => entry.state.totalCount > 0)
          .map((entry) => entry.state.passedCount / entry.state.totalCount)
      : [];

    const solveTimes = solvedStates
      .map((entry) => resolveSolveTimeMs(entry.attempt, entry.state))
      .filter((value): value is number => value !== null);

    return {
      questionId: question.id,
      questionNumber: index + 1,
      type: question.type,
      title: buildStudentQuestionTitle(question),
      points: question.points,
      difficulty: question.type === "Coding" ? question.difficulty : null,
      participantCount: attempts.length,
      attemptedCount: attemptedStates.length,
      solvedCount: solvedStates.length,
      solveRate: rate(solvedStates.length, attempts.length),
      attemptRate: rate(attemptedStates.length, attempts.length),
      averageAttempts: mean(attemptedStates.map((entry) => entry.state.attemptsCount)),
      averageAwardedPoints: mean(states.map((entry) => entry.state.awardedPoints)),
      averagePassRate: passRates.length > 0 ? round(mean(passRates), 4) : null,
      averageTimeToSolveMs: solveTimes.length > 0 ? Math.round(mean(solveTimes)) : null,
    };
  });
}

function toQuestionRef(question: QuestionMetrics) {
  return {
    questionId: question.questionId,
    questionNumber: question.questionNumber,
    title: question.title,
    solveRate: question.solveRate,
  };
}

export function pickHardestQuestion(questions: readonly QuestionMetrics[]) {
  const ranked = [...questions].sort(
    (a, b) => a.solveRate - b.solveRate || a.questionNumber - b.questionNumber,
  );
  return ranked.length > 0 ? toQuestionRef(ranked[0]) : null;
}

export function pickEasiestQuestion(questions: readonly QuestionMetrics[]) {
  const ranked = [...questions].sort(
    (a, b) => b.solveRate - a.solveRate || a.questionNumber - b.questionNumber,
  );
  return ranked.length > 0 ? toQuestionRef(ranked[0]) : null;
}

// ---------------------------------------------------------------------------
// Languages
// ---------------------------------------------------------------------------

export function computeLanguageStats(
  submissions: readonly SubmissionAnalyticsRecord[],
): LanguageMetrics[] {
  const byLanguage = new Map<ExecutableLanguage, SubmissionAnalyticsRecord[]>();
  for (const submission of submissions) {
    const bucket = byLanguage.get(submission.language) ?? [];
    bucket.push(submission);
    byLanguage.set(submission.language, bucket);
  }

  return [...byLanguage.entries()]
    .map(([language, records]) => {
      const accepted = records.filter((record) => record.status === "ACCEPTED");
      // Runtime/memory are only meaningful for runs that actually completed. A compile error reports
      // 0ms, which would otherwise make a language with many failures look blazingly fast.
      const measured = accepted;
      return {
        language,
        submissionCount: records.length,
        acceptedCount: accepted.length,
        acceptanceRate: rate(accepted.length, records.length),
        sampleSize: measured.length,
        confidence: (measured.length >= MIN_LANGUAGE_SAMPLE ? "high" : "low") as MetricConfidence,
        studentCount: new Set(records.map((record) => record.userEmail)).size,
        runtimeMs: computeDistribution(measured.map((record) => record.runtimeMs)),
        memoryKb: computeDistribution(measured.map((record) => record.memoryKb)),
      };
    })
    .sort((a, b) => b.submissionCount - a.submissionCount || a.language.localeCompare(b.language));
}

// ---------------------------------------------------------------------------
// Optimal code
// ---------------------------------------------------------------------------

interface OptimalCandidate {
  submission: SubmissionAnalyticsRecord;
  attempt: ContestAttemptRecord;
  state: ContestQuestionAttemptState;
  questionId: string;
  questionNumber: number;
  questionTitle: string;
}

/**
 * Only fully-correct submissions compete. Correctness is a gate here rather than a weighted component:
 * the contest grade already encodes partial correctness, so re-weighting it would just restate the
 * score under a different name.
 */
function isEligibleCandidate(submission: SubmissionAnalyticsRecord): boolean {
  return (
    submission.status === "ACCEPTED" &&
    submission.totalCount > 0 &&
    submission.passedCount >= submission.totalCount
  );
}

/**
 * Picks the comparison set for a candidate's percentiles, preferring language-pure buckets.
 *
 * Cross-language pooling is the last resort precisely because it is what the whole normalization layer
 * exists to avoid — a Python submission compared against C++ runtimes always looks terrible.
 */
export function resolvePercentileBasis(
  candidates: readonly OptimalCandidate[],
  candidate: OptimalCandidate,
): { bucket: OptimalCandidate[]; basis: string } {
  const { questionId } = candidate;
  const language = candidate.submission.language;

  const questionAndLanguage = candidates.filter(
    (entry) => entry.questionId === questionId && entry.submission.language === language,
  );
  if (questionAndLanguage.length >= MIN_LANGUAGE_SAMPLE) {
    return { bucket: questionAndLanguage, basis: `question ${candidate.questionNumber} · ${language}` };
  }

  const contestAndLanguage = candidates.filter((entry) => entry.submission.language === language);
  if (contestAndLanguage.length >= MIN_LANGUAGE_SAMPLE) {
    return { bucket: contestAndLanguage, basis: `all questions · ${language}` };
  }

  if (questionAndLanguage.length >= 2) {
    return { bucket: questionAndLanguage, basis: `question ${candidate.questionNumber} · ${language} (small sample)` };
  }

  const questionAllLanguages = candidates.filter((entry) => entry.questionId === questionId);
  if (questionAllLanguages.length >= 2) {
    return {
      bucket: questionAllLanguages,
      basis: `question ${candidate.questionNumber} · all languages (too few ${language} submissions)`,
    };
  }

  return { bucket: [candidate], basis: `sole ${language} submission` };
}

/** 1 attempt = 1.0, 2 = 0.5, 3 = 0.33 … an explainable curve rather than an arbitrary linear scale. */
export function computeAttemptEfficiency(attemptsCount: number): number {
  return round(1 / Math.max(1, attemptsCount), 4);
}

function buildOptimalSubmission(
  candidate: OptimalCandidate,
  allCandidates: readonly OptimalCandidate[],
  /**
   * Forces the comparison set. Used by the per-language ranking, where two submissions in the same
   * language must be scored against each other rather than against whatever bucket the fallback
   * chain happened to pick for each of them individually.
   */
  basisOverride?: { bucket: readonly OptimalCandidate[]; basis: string },
): OptimalSubmission {
  const { bucket, basis } = basisOverride ?? resolvePercentileBasis(allCandidates, candidate);

  const runtimePercentile = lowerIsBetterPercentile(
    bucket.map((entry) => entry.submission.runtimeMs),
    candidate.submission.runtimeMs,
  );
  const memoryPercentile = lowerIsBetterPercentile(
    bucket.map((entry) => entry.submission.memoryKb),
    candidate.submission.memoryKb,
  );

  const attemptsCount = Math.max(1, candidate.state.attemptsCount);
  const attemptEfficiencyScore = computeAttemptEfficiency(attemptsCount);

  const timeToSolveMs = resolveSolveTimeMs(candidate.attempt, candidate.state);

  // Solve speed is compared within the question across all languages: thinking time is not a property
  // of the language the student happened to pick.
  const questionSolveTimes = allCandidates
    .filter((entry) => entry.questionId === candidate.questionId)
    .map((entry) => resolveSolveTimeMs(entry.attempt, entry.state))
    .filter((value): value is number => value !== null);
  const solveSpeedPercentile =
    timeToSolveMs === null ? 0.5 : lowerIsBetterPercentile(questionSolveTimes, timeToSolveMs);

  const breakdown: OptimalScoreComponent[] = [
    {
      component: "Runtime efficiency",
      weight: OPTIMAL_CODE_WEIGHTS.runtime,
      rawValue: candidate.submission.runtimeMs,
      normalized: runtimePercentile,
      contribution: round(runtimePercentile * OPTIMAL_CODE_WEIGHTS.runtime, 4),
    },
    {
      component: "Memory efficiency",
      weight: OPTIMAL_CODE_WEIGHTS.memory,
      rawValue: candidate.submission.memoryKb,
      normalized: memoryPercentile,
      contribution: round(memoryPercentile * OPTIMAL_CODE_WEIGHTS.memory, 4),
    },
    {
      component: "Attempt efficiency",
      weight: OPTIMAL_CODE_WEIGHTS.attemptEfficiency,
      rawValue: attemptsCount,
      normalized: attemptEfficiencyScore,
      contribution: round(attemptEfficiencyScore * OPTIMAL_CODE_WEIGHTS.attemptEfficiency, 4),
    },
    {
      component: "Solve speed",
      weight: OPTIMAL_CODE_WEIGHTS.solveSpeed,
      rawValue: timeToSolveMs ?? 0,
      normalized: solveSpeedPercentile,
      contribution: round(solveSpeedPercentile * OPTIMAL_CODE_WEIGHTS.solveSpeed, 4),
    },
  ];

  return {
    submissionId: candidate.submission.id,
    attemptId: candidate.attempt.id,
    questionId: candidate.questionId,
    questionNumber: candidate.questionNumber,
    questionTitle: candidate.questionTitle,
    studentEmail: candidate.attempt.userEmail,
    studentName: candidate.attempt.userName,
    language: candidate.submission.language,
    runtimeMs: candidate.submission.runtimeMs,
    memoryKb: candidate.submission.memoryKb,
    runtimePercentile,
    memoryPercentile,
    percentileBasis: basis,
    percentileSampleSize: bucket.length,
    attemptsCount,
    attemptEfficiencyScore,
    timeToSolveMs,
    solveSpeedPercentile,
    violationCount: candidate.attempt.violationCount,
    totalScore: round(
      breakdown.reduce((total, entry) => total + entry.contribution, 0),
      4,
    ),
    breakdown,
  };
}

export function computeOptimalCode(
  contest: ContestRecord,
  attempts: readonly ContestAttemptRecord[],
  submissions: readonly SubmissionAnalyticsRecord[],
  languages: readonly LanguageMetrics[],
): OptimalCodeMetrics {
  const questionIndex = new Map<string, { question: ContestQuestion; number: number }>();
  contest.questions.forEach((question, index) => {
    questionIndex.set(question.id, { question, number: index + 1 });
  });

  // One attempt per (contest, student), so email is a safe join key back from a submission.
  const attemptByEmail = new Map(attempts.map((attempt) => [attempt.userEmail, attempt]));

  const candidates: OptimalCandidate[] = [];
  for (const submission of submissions) {
    if (!isEligibleCandidate(submission) || !submission.contestQuestionId) {
      continue;
    }
    const entry = questionIndex.get(submission.contestQuestionId);
    if (!entry || entry.question.type !== "Coding") {
      continue;
    }

    const attempt = attemptByEmail.get(submission.userEmail);
    if (!attempt) {
      continue;
    }
    const state = findState(attempt, submission.contestQuestionId);
    if (!state) {
      continue;
    }

    candidates.push({
      submission,
      attempt,
      state,
      questionId: submission.contestQuestionId,
      questionNumber: entry.number,
      questionTitle: buildStudentQuestionTitle(entry.question),
    });
  }

  const scored = candidates.map((candidate) => buildOptimalSubmission(candidate, candidates));

  const perQuestion: OptimalSubmission[] = [];
  for (const { question } of questionIndex.values()) {
    if (question.type !== "Coding") {
      continue;
    }
    // Deterministic tie-break all the way down to submission id, so the winner never depends on
    // read order.
    const forQuestion = scored
      .filter((entry) => entry.questionId === question.id)
      .sort(
        (a, b) =>
          b.totalScore - a.totalScore ||
          a.runtimeMs - b.runtimeMs ||
          a.memoryKb - b.memoryKb ||
          a.submissionId.localeCompare(b.submissionId),
      );
    if (forQuestion.length > 0) {
      perQuestion.push(forQuestion[0]);
    }
  }
  perQuestion.sort((a, b) => a.questionNumber - b.questionNumber);

  const perLanguage = pickOptimalPerLanguage(candidates);

  const highConfidenceLanguages = new Set(
    languages.filter((entry) => entry.confidence === "high").map((entry) => entry.language),
  );

  const eligibleForOverall = perQuestion.filter((entry) =>
    highConfidenceLanguages.has(entry.language),
  );

  const rank = (entries: readonly OptimalSubmission[]) =>
    [...entries].sort(
      (a, b) => b.totalScore - a.totalScore || a.questionNumber - b.questionNumber,
    )[0] ?? null;

  if (eligibleForOverall.length > 0) {
    return {
      perQuestion,
      perLanguage,
      overall: rank(eligibleForOverall),
      overallSelectionNote:
        "Selected from languages with enough submissions to form a reliable baseline.",
    };
  }

  return {
    perQuestion,
    perLanguage,
    overall: rank(perQuestion),
    overallSelectionNote:
      perQuestion.length > 0
        ? `No language reached ${MIN_LANGUAGE_SAMPLE} accepted submissions, so this pick rests on a small sample and should be read as indicative only.`
        : "No fully-correct coding submission was recorded, so no optimal submission could be selected.",
  };
}

/**
 * The best submission written in each language.
 *
 * Percentiles are recomputed against that language's own candidates rather than reusing the scores
 * from `resolvePercentileBasis`. That fallback chain can land two same-language submissions in
 * different buckets — one compared against its question, another against all questions — and ranking
 * scores derived from different denominators against each other is meaningless. Restricting the
 * bucket to the language also makes the question this section answers literally true: *of the Java
 * submissions, which is the best Java?*
 *
 * Low-confidence languages are included here, unlike the overall pick. The comparison is entirely
 * within the language, so a small sample weakens how much the numbers mean without making the winner
 * unfair; the UI keeps its "too few" badge to say so.
 */
export function pickOptimalPerLanguage(
  candidates: readonly OptimalCandidate[],
): OptimalSubmission[] {
  const byLanguage = new Map<ExecutableLanguage, OptimalCandidate[]>();
  for (const candidate of candidates) {
    const bucket = byLanguage.get(candidate.submission.language) ?? [];
    bucket.push(candidate);
    byLanguage.set(candidate.submission.language, bucket);
  }

  const winners: OptimalSubmission[] = [];
  for (const [language, bucket] of byLanguage.entries()) {
    const basis =
      bucket.length === 1
        ? `sole ${language} submission`
        : `${language} only (${bucket.length} submissions)`;

    const scored = bucket
      .map((candidate) => buildOptimalSubmission(candidate, candidates, { bucket, basis }))
      .sort(
        (a, b) =>
          b.totalScore - a.totalScore ||
          a.runtimeMs - b.runtimeMs ||
          a.memoryKb - b.memoryKb ||
          a.submissionId.localeCompare(b.submissionId),
      );

    winners.push(scored[0]);
  }

  return winners.sort(
    (a, b) => b.totalScore - a.totalScore || a.language.localeCompare(b.language),
  );
}

// ---------------------------------------------------------------------------
// Violations
// ---------------------------------------------------------------------------

export function computeViolationStats(
  attempts: readonly ContestAttemptRecord[],
  events: readonly ContestProctoringEventRecord[],
): ViolationMetrics {
  const byType = new Map<ContestProctoringEventType, number>();
  for (const event of events) {
    byType.set(event.type, (byType.get(event.type) ?? 0) + 1);
  }

  const bands: { band: string; match: (count: number) => boolean }[] = [
    { band: "0", match: (count) => count === 0 },
    { band: "1-2", match: (count) => count >= 1 && count <= 2 },
    { band: "3+", match: (count) => count >= 3 },
  ];

  return {
    totalEvents: events.length,
    averagePerAttempt: attempts.length > 0
      ? mean(attempts.map((attempt) => attempt.violationCount))
      : 0,
    attemptsWithViolations: attempts.filter((attempt) => attempt.violationCount > 0).length,
    byType: [...byType.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    scoreByViolationBand: bands.map(({ band, match }) => {
      const inBand = attempts.filter((attempt) => match(attempt.violationCount));
      return {
        band,
        attemptCount: inBand.length,
        averageScore: mean(inBand.map((attempt) => attempt.score)),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Teaching insights
// ---------------------------------------------------------------------------

export function buildTeachingInsights(
  questions: readonly QuestionMetrics[],
  languages: readonly LanguageMetrics[],
): TeachingInsights {
  const label = (question: QuestionMetrics) => `Q${question.questionNumber}: ${question.title}`;

  const overallAcceptance =
    languages.reduce((total, entry) => total + entry.acceptedCount, 0) /
    Math.max(1, languages.reduce((total, entry) => total + entry.submissionCount, 0));

  return {
    lowSolveRateQuestions: questions
      .filter((question) => question.participantCount > 0 && question.solveRate < 0.3)
      .map(label),
    // Heavy engagement with little success usually means the specification is unclear rather than
    // that the problem is hard — worth separating from plain difficulty.
    highAttemptLowSolveQuestions: questions
      .filter(
        (question) =>
          question.attemptRate >= 0.5 && question.solveRate < 0.3 && question.averageAttempts >= 2,
      )
      .map(label),
    unattemptedQuestions: questions
      .filter((question) => question.participantCount > 0 && question.attemptRate < 0.3)
      .map(label),
    languageDisadvantageFlags: languages
      .filter(
        (entry) =>
          entry.confidence === "high" &&
          overallAcceptance > 0 &&
          entry.acceptanceRate < overallAcceptance * 0.6,
      )
      .map(
        (entry) =>
          `${entry.language}: ${Math.round(entry.acceptanceRate * 100)}% acceptance vs ${Math.round(
            overallAcceptance * 100,
          )}% overall`,
      ),
  };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export interface BuildAnalyticsInput {
  contest: ContestRecord;
  attempts: readonly ContestAttemptRecord[];
  submissions: readonly SubmissionAnalyticsRecord[];
  proctoringEvents: readonly ContestProctoringEventRecord[];
  registeredCount: number;
  now: Date;
}

export function buildContestAnalytics(input: BuildAnalyticsInput): ContestAnalytics {
  const { contest, submissions, proctoringEvents, registeredCount, now } = input;

  const scoredAttempts = selectScoredAttempts(input.attempts);
  const totalPoints = contest.questions.reduce((total, question) => total + question.points, 0);

  const questions = computeQuestionStats(contest, scoredAttempts);
  const languages = computeLanguageStats(submissions);
  const optimalCode = computeOptimalCode(contest, scoredAttempts, submissions, languages);

  const lowSampleLanguages = languages
    .filter((entry) => entry.confidence === "low")
    .map((entry) => `${entry.language} (${entry.sampleSize} accepted submissions)`);

  const percentileBasisNotes = [
    ...new Set(
      [...optimalCode.perQuestion, ...(optimalCode.overall ? [optimalCode.overall] : [])].map(
        (entry) => `Q${entry.questionNumber} ranked against: ${entry.percentileBasis}`,
      ),
    ),
  ];

  const discardedSolveTimes = countDiscardedSolveTimes(scoredAttempts);
  const solveTimeNotes =
    discardedSolveTimes > 0
      ? [
          `${discardedSolveTimes} solve timestamp${
            discardedSolveTimes === 1 ? " was" : "s were"
          } recorded after the attempt closed (a grading artefact rather than a real solve time) and ${
            discardedSolveTimes === 1 ? "is" : "are"
          } excluded from solve-time figures.`,
        ]
      : [];

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    contest: {
      id: contest.id,
      title: contest.title,
      type: contest.type,
      startAt: contest.startAt.toISOString(),
      endAt: contest.endAt.toISOString(),
      durationMinutes: contest.durationMinutes,
      targetDepartment: contest.targetDepartment,
      questionCount: contest.questions.length,
      codingQuestionCount: contest.questions.filter((question) => question.type === "Coding").length,
      totalPoints,
    },
    participation: computeParticipation(input.attempts, registeredCount),
    scores: computeScoreStats(scoredAttempts, totalPoints),
    questions,
    hardestQuestion: pickHardestQuestion(questions),
    easiestQuestion: pickEasiestQuestion(questions),
    languages,
    optimalCode,
    violations: computeViolationStats(scoredAttempts, proctoringEvents),
    teachingInsights: buildTeachingInsights(questions, languages),
    dataQuality: {
      lowSampleLanguages,
      percentileBasisNotes: [...percentileBasisNotes, ...solveTimeNotes],
      excludedFromRanking:
        lowSampleLanguages.length > 0
          ? [
              `Languages with fewer than ${MIN_LANGUAGE_SAMPLE} accepted submissions are shown but excluded from the "most optimal overall" pick.`,
            ]
          : [],
      generatedAt: now.toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Hashing / anonymization
// ---------------------------------------------------------------------------

/** Stable key ordering so the hash depends on the data, not on property insertion order. */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([key, entryValue]) => [key, canonicalize(entryValue)]));
  }
  return value;
}

export function hashMetrics(metrics: ContestAnalytics): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(metrics))).digest("hex");
}

/**
 * The reduced, de-identified view handed to the model.
 *
 * Two jobs. First, privacy: students appear as S1/S2 and questions as Q1/Q2, so the model physically
 * cannot attribute an outcome to a named student — the UI re-hydrates real names from the metrics, not
 * from the narrative. Second, accuracy: a 3B model misreads long nested JSON, so deep arrays are
 * truncated to the few entries the narrative is actually allowed to talk about.
 */
export function anonymizeMetricsForPrompt(metrics: ContestAnalytics): Record<string, unknown> {
  const studentAliases = new Map<string, string>();
  const aliasFor = (email: string): string => {
    const existing = studentAliases.get(email);
    if (existing) {
      return existing;
    }
    const alias = `S${studentAliases.size + 1}`;
    studentAliases.set(email, alias);
    return alias;
  };

  const reduceOptimal = (entry: OptimalSubmission | null) =>
    entry
      ? {
          question: `Q${entry.questionNumber}`,
          student: aliasFor(entry.studentEmail),
          language: entry.language,
          runtimeMs: entry.runtimeMs,
          memoryKb: entry.memoryKb,
          runtimePercentile: entry.runtimePercentile,
          memoryPercentile: entry.memoryPercentile,
          attemptsCount: entry.attemptsCount,
          totalScore: entry.totalScore,
        }
      : null;

  return {
    contest: {
      title: metrics.contest.title,
      type: metrics.contest.type,
      durationMinutes: metrics.contest.durationMinutes,
      questionCount: metrics.contest.questionCount,
      codingQuestionCount: metrics.contest.codingQuestionCount,
      totalPoints: metrics.contest.totalPoints,
    },
    participation: {
      registeredCount: metrics.participation.registeredCount,
      attemptedCount: metrics.participation.attemptedCount,
      completedCount: metrics.participation.completedCount,
      completionRate: metrics.participation.completionRate,
      registrationToAttemptRate: metrics.participation.registrationToAttemptRate,
    },
    scores: {
      averageScore: metrics.scores.averageScore,
      medianScore: metrics.scores.medianScore,
      maxScore: metrics.scores.maxScore,
      minScore: metrics.scores.minScore,
      totalPoints: metrics.scores.totalPoints,
      averageScorePercent: metrics.scores.averageScorePercent,
      averageTimeTakenMinutes:
        metrics.scores.averageTimeTakenMs !== null
          ? Math.round(metrics.scores.averageTimeTakenMs / 60000)
          : null,
    },
    questions: metrics.questions.map((question) => ({
      question: `Q${question.questionNumber}`,
      type: question.type,
      points: question.points,
      difficulty: question.difficulty,
      solveRate: question.solveRate,
      attemptRate: question.attemptRate,
      averageAttempts: question.averageAttempts,
    })),
    hardestQuestion: metrics.hardestQuestion
      ? { question: `Q${metrics.hardestQuestion.questionNumber}`, solveRate: metrics.hardestQuestion.solveRate }
      : null,
    easiestQuestion: metrics.easiestQuestion
      ? { question: `Q${metrics.easiestQuestion.questionNumber}`, solveRate: metrics.easiestQuestion.solveRate }
      : null,
    languages: metrics.languages.slice(0, 5).map((entry) => ({
      language: entry.language,
      submissionCount: entry.submissionCount,
      acceptedCount: entry.acceptedCount,
      acceptanceRate: entry.acceptanceRate,
      confidence: entry.confidence,
      medianRuntimeMs: entry.runtimeMs.median,
      medianMemoryKb: entry.memoryKb.median,
    })),
    optimalCode: {
      overall: reduceOptimal(metrics.optimalCode.overall),
      perQuestion: metrics.optimalCode.perQuestion.slice(0, 5).map(reduceOptimal),
      perLanguage: metrics.optimalCode.perLanguage.slice(0, 5).map(reduceOptimal),
    },
    violations: {
      totalEvents: metrics.violations.totalEvents,
      averagePerAttempt: metrics.violations.averagePerAttempt,
      attemptsWithViolations: metrics.violations.attemptsWithViolations,
      scoreByViolationBand: metrics.violations.scoreByViolationBand,
    },
    teachingInsights: metrics.teachingInsights,
    dataQuality: {
      lowSampleLanguages: metrics.dataQuality.lowSampleLanguages,
    },
  };
}
