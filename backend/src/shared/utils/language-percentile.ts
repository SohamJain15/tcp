import { lowerIsBetterPercentile } from "./percentile";

/**
 * Accepted submissions a language bucket needs before it is trusted on its own.
 *
 * Below this a percentile says more about who happened to submit than about the code, so the
 * scorer widens to the cross-language pool and marks the result low-confidence instead.
 */
export const MIN_LANGUAGE_SAMPLE = 5;

export interface LanguagePercentileBasis {
  /** The language the bucket was drawn from, or null once it fell back to every language. */
  language: string | null;
  sampleSize: number;
  /** False once the fallback widened the pool past the sample's own language. */
  languagePure: boolean;
  label: string;
}

export interface LanguagePercentileScorer<T> {
  /** 1 for the best value in the bucket, 0 for the worst, 0 for anything unmeasured. */
  scoreFor: (sample: T) => number;
  basisFor: (sample: T) => LanguagePercentileBasis;
  /** True when nothing in the field was measured, so callers can hide the column entirely. */
  isEmpty: boolean;
}

export interface LanguagePercentileOptions<T> {
  languageOf: (sample: T) => string;
  /** The metric being ranked, where lower is better. Values <= 0 count as unmeasured. */
  valueOf: (sample: T) => number;
  minSample?: number;
}

/**
 * Scores each sample against others written in the same language.
 *
 * Pooling runtime and memory across languages is the bias this exists to remove: a Python
 * solution measured against C++ memory always looks wasteful, however good the algorithm is.
 * Comparing within a language asks the only question that is actually about the student —
 * "given this language, how well did they use it?".
 *
 * The pool is built once for the whole field, so ranking a page of entries costs one pass
 * rather than a percentile query per row.
 */
export function buildLanguagePercentileScorer<T>(
  samples: readonly T[],
  options: LanguagePercentileOptions<T>,
): LanguagePercentileScorer<T> {
  const { languageOf, valueOf, minSample = MIN_LANGUAGE_SAMPLE } = options;

  const measured = samples.filter((sample) => valueOf(sample) > 0);
  const allValues = measured.map((sample) => valueOf(sample));

  const valuesByLanguage = new Map<string, number[]>();
  for (const sample of measured) {
    const language = languageOf(sample);
    const bucket = valuesByLanguage.get(language) ?? [];
    bucket.push(valueOf(sample));
    valuesByLanguage.set(language, bucket);
  }

  const resolveBucket = (sample: T): { values: number[]; basis: LanguagePercentileBasis } => {
    const language = languageOf(sample);
    const languageValues = valuesByLanguage.get(language) ?? [];

    if (languageValues.length >= minSample) {
      return {
        values: languageValues,
        basis: {
          language,
          sampleSize: languageValues.length,
          languagePure: true,
          label: `${language} · ${languageValues.length} submissions`,
        },
      };
    }

    // Too thin to stand alone. Widening beats reporting a percentile drawn from two people,
    // but the caller is told so it can label the number as indicative.
    return {
      values: allValues,
      basis: {
        language,
        sampleSize: allValues.length,
        languagePure: false,
        label:
          allValues.length > 0
            ? `all languages · ${allValues.length} submissions (too few ${language} submissions)`
            : "no measured submissions",
      },
    };
  };

  return {
    isEmpty: measured.length === 0,
    scoreFor: (sample) => {
      const value = valueOf(sample);
      if (value <= 0) {
        return 0;
      }
      return lowerIsBetterPercentile(resolveBucket(sample).values, value);
    },
    basisFor: (sample) => resolveBucket(sample).basis,
  };
}
