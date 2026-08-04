import type { ExecutableLanguage } from "../../shared/types/domain";
import { MIN_LANGUAGE_SAMPLE } from "../../shared/utils/language-percentile";
import { lowerIsBetterPercentile } from "../../shared/utils/percentile";
import type { SubmissionAnalyticsRecord } from "./submission.repository";

/** Enough buckets to show a shape without inventing precision the sample cannot support. */
const BUCKET_COUNT = 10;

export interface DistributionBucket {
  /** Inclusive lower bound of the bucket, in the metric's own unit. */
  rangeStart: number;
  /** Exclusive upper bound, except for the final bucket which includes its own maximum. */
  rangeEnd: number;
  count: number;
  /** True for the bucket the requesting student's own submission falls into. */
  isYours: boolean;
}

export interface MetricDistribution {
  buckets: DistributionBucket[];
  yourValue: number;
  /** Percentage of the compared field this submission beat, 0-100. */
  beatsPercent: number;
}

export interface SubmissionStatsResponse {
  submissionId: string;
  problemId: string;
  language: ExecutableLanguage;
  runtime: MetricDistribution;
  memory: MetricDistribution;
  /** Human-readable description of who this was compared against. */
  basis: string;
  sampleSize: number;
  confidence: "high" | "low";
}

/**
 * One accepted submission per student — their fastest, then leanest.
 *
 * Without this a student who submits the same solution ten times would appear ten times in the
 * distribution and drag the whole curve toward their own result.
 */
export function selectBestAcceptedPerUser(
  submissions: readonly SubmissionAnalyticsRecord[],
): SubmissionAnalyticsRecord[] {
  const bestByUser = new Map<string, SubmissionAnalyticsRecord>();

  for (const submission of submissions) {
    const incumbent = bestByUser.get(submission.userEmail);
    if (
      !incumbent ||
      submission.runtimeMs < incumbent.runtimeMs ||
      (submission.runtimeMs === incumbent.runtimeMs && submission.memoryKb < incumbent.memoryKb)
    ) {
      bestByUser.set(submission.userEmail, submission);
    }
  }

  return [...bestByUser.values()];
}

function buildBuckets(values: readonly number[], yourValue: number): DistributionBucket[] {
  if (values.length === 0) {
    return [];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  // Everyone scored identically — one bucket is the honest picture, and it avoids dividing by a
  // zero-width range below.
  if (min === max) {
    return [{ rangeStart: min, rangeEnd: min, count: values.length, isYours: true }];
  }

  const width = (max - min) / BUCKET_COUNT;
  const indexOf = (value: number): number =>
    Math.min(BUCKET_COUNT - 1, Math.floor((value - min) / width));

  const counts = new Array<number>(BUCKET_COUNT).fill(0);
  for (const value of values) {
    counts[indexOf(value)] += 1;
  }

  const yourIndex = indexOf(yourValue);
  return counts.map((count, index) => ({
    rangeStart: Math.round(min + index * width),
    rangeEnd: Math.round(min + (index + 1) * width),
    count,
    isYours: index === yourIndex,
  }));
}

function buildDistribution(values: readonly number[], yourValue: number): MetricDistribution {
  return {
    buckets: buildBuckets(values, yourValue),
    yourValue,
    // The same primitive the leaderboards rank on, so the percentage in the graph and the
    // student's position on the board can never tell different stories.
    beatsPercent: Number((lowerIsBetterPercentile(values, yourValue) * 100).toFixed(1)),
  };
}

/**
 * Builds the "your solution beats X% of submissions" view for one accepted submission.
 *
 * Comparison prefers submissions in the same language. Below `MIN_LANGUAGE_SAMPLE` it widens to
 * every language and reports `confidence: "low"` — a percentile drawn from three people is a
 * number, not a fact, and the UI is expected to show `basis` alongside it so the student can see
 * what they were measured against.
 */
export function buildSubmissionStats(
  submission: SubmissionAnalyticsRecord,
  acceptedForProblem: readonly SubmissionAnalyticsRecord[],
): SubmissionStatsResponse {
  const best = selectBestAcceptedPerUser(acceptedForProblem);
  const sameLanguage = best.filter((entry) => entry.language === submission.language);

  const languagePure = sameLanguage.length >= MIN_LANGUAGE_SAMPLE;
  const pool = languagePure ? sameLanguage : best;

  return {
    submissionId: submission.id,
    problemId: submission.problemId,
    language: submission.language,
    runtime: buildDistribution(
      pool.map((entry) => entry.runtimeMs),
      submission.runtimeMs,
    ),
    memory: buildDistribution(
      pool.map((entry) => entry.memoryKb),
      submission.memoryKb,
    ),
    basis: languagePure
      ? `${submission.language} · ${pool.length} submissions`
      : `all languages · ${pool.length} submissions (too few ${submission.language} submissions)`,
    sampleSize: pool.length,
    confidence: languagePure ? "high" : "low",
  };
}
