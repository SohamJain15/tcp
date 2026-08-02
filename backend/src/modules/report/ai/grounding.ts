import {
  NARRATIVE_SECTIONS,
  assignNarrativeSection,
  type ContestAnalytics,
  type ContestReportNarrative,
  type NarrativeSection,
} from "../report.model";
import { buildTemplateSection } from "./fallback";

/**
 * Numeric grounding for model-written prose.
 *
 * The model is instructed to only restate numbers from the metrics it was given, but instruction is
 * not enforcement — a 3B model will occasionally round wrong, swap two figures, or confidently invent
 * a percentage. This module is the enforcement: every numeric literal in a section must trace back to
 * a value derivable from the metrics, or the whole section is thrown away and rebuilt from templates.
 *
 * The check is deliberately generous about *form* (12, 12.0, 1,200, 45%, 3.5s all normalise) and
 * strict about *value*. A false rejection costs a slightly blander sentence; a false acceptance puts
 * a fabricated statistic in front of faculty, so the asymmetry is intentional.
 */

export interface GroundingResult {
  narrative: ContestReportNarrative;
  warnings: string[];
  rejectedSections: NarrativeSection[];
}

/**
 * Claims the model is not entitled to make, regardless of the numbers.
 *
 * No source code is read anywhere in this feature, so any statement about readability, style, naming,
 * or code quality is invented no matter how plausible it sounds. Observed in practice: a 3B model
 * asked to explain a low acceptance rate will reach for "issues with code readability" because that
 * is what the training data says causes low acceptance rates.
 *
 * Deliberately not applied to `facultyRecommendations`, where "teach cleaner code" is legitimate
 * advice about teaching rather than a claim about what the submissions contained.
 */
const FORBIDDEN_CLAIM_PATTERNS: { pattern: RegExp; topic: string }[] = [
  { pattern: /\breadab(le|ility)\b/i, topic: "code readability" },
  { pattern: /\b(code|coding|programming)\s+(style|quality)\b/i, topic: "code quality" },
  { pattern: /\bnaming\b|\bvariable names?\b/i, topic: "naming" },
  { pattern: /\brefactor(ing|ed)?\b/i, topic: "refactoring" },
  { pattern: /\bclean code\b|\bidiomatic\b/i, topic: "code style" },
  { pattern: /\b(well|poorly|badly)[- ]written\b/i, topic: "code quality" },
  { pattern: /\b(elegant|inelegant)\b/i, topic: "code style" },
  { pattern: /\bcode\s+structure\b/i, topic: "code structure" },
];

const CLAIM_CHECKED_SECTIONS: NarrativeSection[] = [
  "executiveSummary",
  "contestInsights",
  "efficiencyObservations",
  "studentPerformanceObservations",
];

export function findForbiddenClaims(content: string | string[]): string[] {
  const text = Array.isArray(content) ? content.join(" ") : content;
  return [
    ...new Set(
      FORBIDDEN_CLAIM_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ topic }) => topic),
    ),
  ];
}

const SECTION_LABELS: Record<NarrativeSection, string> = {
  executiveSummary: "Executive summary",
  contestInsights: "Contest insights",
  efficiencyObservations: "Efficiency observations",
  studentPerformanceObservations: "Student performance observations",
  facultyRecommendations: "Faculty recommendations",
};

/** Small integers are ordinals and counts far more often than they are claims ("the top 3 students"). */
const TRIVIAL_NUMBER_CEILING = 10;

const NUMBER_PATTERN = /-?\d[\d,]*(?:\.\d+)?/g;

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Every number a sentence is allowed to contain, including the forms a writer would naturally use:
 * a ratio may appear as a percentage, a millisecond duration as seconds or minutes, and any figure
 * may be rounded to a whole number or one decimal place.
 */
export function collectGroundedNumbers(metrics: ContestAnalytics): Set<number> {
  const grounded = new Set<number>();

  const add = (value: number) => {
    if (!Number.isFinite(value)) {
      return;
    }
    grounded.add(value);
    grounded.add(Math.round(value));
    grounded.add(roundTo(value, 1));
    grounded.add(roundTo(value, 2));
    grounded.add(Math.floor(value));
    grounded.add(Math.ceil(value));
  };

  const addNumeric = (value: number) => {
    add(value);

    // A rate in [0,1] is almost always written as a percentage.
    if (value >= 0 && value <= 1) {
      add(value * 100);
    }

    // Durations get restated in seconds, minutes, and hours; byte counts in MB.
    if (Math.abs(value) >= 1000) {
      add(value / 1000);
      add(value / 1024);
      add(value / 60000);
      add(value / 3600000);
      add(value / (1024 * 1024));
    }
  };

  const walk = (value: unknown): void => {
    if (typeof value === "number") {
      addNumeric(value);
      return;
    }
    if (typeof value === "string") {
      // Strings such as "0-25" (score buckets) and "1-2" (violation bands) carry real figures.
      for (const match of value.match(NUMBER_PATTERN) ?? []) {
        const parsed = Number(match.replace(/,/g, ""));
        if (Number.isFinite(parsed)) {
          addNumeric(parsed);
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      // Counts of things are legitimately quotable ("three questions had...").
      addNumeric(value.length);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(walk);
    }
  };

  walk(metrics);

  // Derived counts the narrative may reasonably state.
  addNumeric(metrics.questions.filter((question) => question.solveRate >= 0.7).length);
  addNumeric(metrics.questions.filter((question) => question.solveRate < 0.3).length);
  addNumeric(
    metrics.participation.registeredCount - metrics.participation.attemptedCount,
  );
  addNumeric(metrics.participation.attemptedCount - metrics.participation.completedCount);

  return grounded;
}

export function extractNumbers(text: string): number[] {
  return (text.match(NUMBER_PATTERN) ?? [])
    .map((match) => Number(match.replace(/,/g, "")))
    .filter((value) => Number.isFinite(value));
}

function isGrounded(value: number, grounded: Set<number>): boolean {
  if (Math.abs(value) <= TRIVIAL_NUMBER_CEILING && Number.isInteger(value)) {
    return true;
  }
  if (grounded.has(value)) {
    return true;
  }

  // Absorb the last digit of rounding drift ("41.7%" for 41.66%).
  for (const candidate of [roundTo(value, 0), roundTo(value, 1), roundTo(value, 2)]) {
    if (grounded.has(candidate)) {
      return true;
    }
  }

  // Percentages are frequently written one decimal off; allow a hair of tolerance proportionally.
  const tolerance = Math.max(0.05, Math.abs(value) * 0.005);
  for (const candidate of grounded) {
    if (Math.abs(candidate - value) <= tolerance) {
      return true;
    }
  }

  return false;
}

/** Returns the ungrounded numbers found in a section's text, empty when everything checks out. */
export function findUngroundedNumbers(
  content: string | string[],
  grounded: Set<number>,
): number[] {
  const text = Array.isArray(content) ? content.join(" ") : content;
  return extractNumbers(text).filter((value) => !isGrounded(value, grounded));
}

export function validateNarrativeNumbers(
  narrative: ContestReportNarrative,
  metrics: ContestAnalytics,
): GroundingResult {
  const grounded = collectGroundedNumbers(metrics);
  const result: ContestReportNarrative = { ...narrative };
  const warnings: string[] = [];
  const rejectedSections: NarrativeSection[] = [];

  for (const section of NARRATIVE_SECTIONS) {
    const content = narrative[section];
    if (content === undefined || content === null) {
      continue;
    }

    const ungrounded = findUngroundedNumbers(content, grounded);
    const forbidden = CLAIM_CHECKED_SECTIONS.includes(section) ? findForbiddenClaims(content) : [];

    if (ungrounded.length === 0 && forbidden.length === 0) {
      continue;
    }

    rejectedSections.push(section);
    if (ungrounded.length > 0) {
      warnings.push(
        `${SECTION_LABELS[section]} was replaced with a generated summary: the model produced ${
          ungrounded.length === 1 ? "a figure" : "figures"
        } (${ungrounded.slice(0, 3).join(", ")}) that could not be traced to the contest data.`,
      );
    }
    if (forbidden.length > 0) {
      warnings.push(
        `${SECTION_LABELS[section]} was replaced with a generated summary: the model commented on ${forbidden.join(
          " and ",
        )}, which no part of this report measures — source code is never analysed.`,
      );
    }

    assignNarrativeSection(result, section, buildTemplateSection(metrics, section));
  }

  return { narrative: result, warnings, rejectedSections };
}
