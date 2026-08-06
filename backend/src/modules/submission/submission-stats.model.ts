import type { ExecutableLanguage } from "../../shared/types/domain";
import { buildLanguagePercentileScorer } from "../../shared/utils/language-percentile";
import type { SubmissionAnalyticsRecord } from "./submission.repository";

export const PRACTICE_OPTIMIZATION_WEIGHTS = { runtime: 0.6, memory: 0.4 } as const;
const PERCENTILE_BUCKET_COUNT = 10;

export interface DistributionBucket {
  rangeStart: number;
  rangeEnd: number;
  count: number;
  isYours: boolean;
}

export interface PercentileDistribution {
  buckets: DistributionBucket[];
  /** The selected solution's normalized efficiency score, 0-100. */
  yourValue: number;
}

export interface MetricPercentile {
  /** Raw measurement retained so students can still see their exact result. */
  rawValue: number;
  /** Language-normalized percentile, 0-100. */
  percentile: number;
}

export interface SubmissionStatsResponse {
  submissionId: string;
  problemId: string;
  language: ExecutableLanguage;
  efficiency: {
    score: number;
    beatsPercent: number;
    distribution: PercentileDistribution;
  };
  runtime: MetricPercentile;
  memory: MetricPercentile;
  basis: string;
  sampleSize: number;
  confidence: "high" | "low";
}

function roundPercent(value: number): number {
  return Math.max(0, Math.min(100, Number((value * 100).toFixed(1))));
}

/** Higher normalized scores are better. Ties split their shared position evenly. */
function higherIsBetterPercentile(values: readonly number[], value: number): number {
  if (values.length <= 1) return 1;

  let beaten = 0;
  let ties = 0;
  for (const candidate of values) {
    if (candidate < value) beaten += 1;
    else if (candidate === value) ties += 1;
  }

  return Math.max(0, Math.min(1, (beaten + 0.5 * Math.max(0, ties - 1)) / (values.length - 1)));
}

function buildPercentileBuckets(values: readonly number[], yourValue: number): DistributionBucket[] {
  const counts = new Array<number>(PERCENTILE_BUCKET_COUNT).fill(0);
  const indexOf = (value: number): number =>
    Math.min(PERCENTILE_BUCKET_COUNT - 1, Math.max(0, Math.floor(value / 10)));

  for (const value of values) counts[indexOf(value)] += 1;

  const yourIndex = indexOf(yourValue);
  return counts.map((count, index) => ({
    rangeStart: index * 10,
    rangeEnd: (index + 1) * 10,
    count,
    isYours: index === yourIndex,
  }));
}

/**
 * Builds a language-normalized practice comparison for one accepted solution.
 * Every accepted submission participates, including resubmissions. Raw runtime and memory are
 * scored inside their language buckets before weighted scores are compared across the whole field.
 */
export function buildSubmissionStats(
  submission: SubmissionAnalyticsRecord,
  acceptedForProblem: readonly SubmissionAnalyticsRecord[],
): SubmissionStatsResponse {
  // The selected record can be fetched separately, so explicitly include it before ranking.
  const field = acceptedForProblem.some((entry) => entry.id === submission.id)
    ? [...acceptedForProblem]
    : [...acceptedForProblem, submission];
  const languageOf = (entry: SubmissionAnalyticsRecord): string => entry.language;
  const runtimeScorer = buildLanguagePercentileScorer(field, {
    languageOf,
    valueOf: (entry) => entry.runtimeMs,
  });
  const memoryScorer = buildLanguagePercentileScorer(field, {
    languageOf,
    valueOf: (entry) => entry.memoryKb,
  });
  const scoreFor = (entry: SubmissionAnalyticsRecord): number =>
    runtimeScorer.scoreFor(entry) * PRACTICE_OPTIMIZATION_WEIGHTS.runtime +
    memoryScorer.scoreFor(entry) * PRACTICE_OPTIMIZATION_WEIGHTS.memory;

  const efficiencyScores = field.map(scoreFor);
  const selectedScore = scoreFor(submission);
  const basis = runtimeScorer.basisFor(submission);
  const normalizedScores = efficiencyScores.map(roundPercent);
  const normalizedSelectedScore = roundPercent(selectedScore);

  return {
    submissionId: submission.id,
    problemId: submission.problemId,
    language: submission.language,
    efficiency: {
      score: normalizedSelectedScore,
      beatsPercent: roundPercent(higherIsBetterPercentile(efficiencyScores, selectedScore)),
      distribution: {
        buckets: buildPercentileBuckets(normalizedScores, normalizedSelectedScore),
        yourValue: normalizedSelectedScore,
      },
    },
    runtime: { rawValue: submission.runtimeMs, percentile: roundPercent(runtimeScorer.scoreFor(submission)) },
    memory: { rawValue: submission.memoryKb, percentile: roundPercent(memoryScorer.scoreFor(submission)) },
    basis: basis.label,
    sampleSize: basis.sampleSize,
    confidence: basis.languagePure ? "high" : "low",
  };
}
