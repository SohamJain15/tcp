import { anonymizeMetricsForPrompt, type ContestAnalytics, type NarrativeSection } from "../report.model";

/** Bump whenever the wording below changes, so stored reports record what produced them. */
export const PROMPT_VERSION = "1.0.0";

export const SYSTEM_PROMPT = [
  "You are a teaching assistant writing a contest report for university faculty.",
  "",
  "Hard rules, in priority order:",
  "1. Use ONLY the numbers present in the supplied JSON. Never calculate, derive, extrapolate, or estimate a new number. If you want to state a figure that is not in the JSON, leave it out.",
  "2. Never invent facts about students, questions, or code. The JSON is the entire world.",
  "3. Never assign, suggest, or revise a grade, mark, or pass/fail outcome. Grading is done elsewhere.",
  "4. Never comment on code style, readability, naming, or algorithm choice. No source code was analysed. Efficiency statements must rest only on the measured runtime, memory, language, and attempt figures.",
  "5. Never draw a conclusion from a group whose confidence is \"low\" — say the sample is too small instead.",
  "6. Refer to students only by the aliases given (S1, S2). Refer to questions only as Q1, Q2.",
  "7. Describe relationships as observed associations, never as cause and effect.",
  "",
  "Write plainly and specifically for a busy lecturer. No filler, no praise, no restating the instructions.",
  "Respond with JSON only, matching the requested shape exactly.",
].join("\n");

interface SectionSpec {
  key: NarrativeSection;
  shape: "string" | "string[]";
  instruction: string;
}

/**
 * Sections are requested one at a time rather than as a single object.
 *
 * A 3B model handling five sections at once tends to degrade across the later ones, and a single bad
 * figure anywhere would sink the whole response. Per-section calls keep each prompt small and let the
 * grounding validator reject one section without losing the other four.
 */
export const SECTION_SPECS: SectionSpec[] = [
  {
    key: "executiveSummary",
    shape: "string",
    instruction:
      "Write a single paragraph of 3-5 sentences summarising how the contest went: turnout, completion, and overall scoring. Quote figures directly from the JSON.",
  },
  {
    key: "contestInsights",
    shape: "string[]",
    instruction:
      "Write 3-5 short bullet points about the contest as a whole: difficulty spread across questions, which question was hardest and easiest, score distribution, and turnout. One observation per bullet.",
  },
  {
    key: "efficiencyObservations",
    shape: "string[]",
    instruction:
      "Write 2-4 short bullet points about measured runtime and memory efficiency across languages. Compare a language only against its own baseline, never against a different language, and say so when a sample is too small. Do not discuss code quality, style, or algorithms.",
  },
  {
    key: "studentPerformanceObservations",
    shape: "string[]",
    instruction:
      "Write 3-5 short bullet points about how students performed: score range, which questions they handled well or struggled with, retry behaviour, and proctoring activity. Describe the cohort, never an individual's ability.",
  },
  {
    key: "facultyRecommendations",
    shape: "string[]",
    instruction:
      "Write 3-5 concrete, actionable recommendations for the next contest, each tied to a specific observation in the JSON. Prefer changes to question wording, difficulty balance, time limits, or language support.",
  },
];

export function buildSectionPrompt(
  metrics: ContestAnalytics,
  spec: SectionSpec,
): { system: string; user: string } {
  const reduced = anonymizeMetricsForPrompt(metrics);

  const shape =
    spec.shape === "string"
      ? `{ "${spec.key}": "..." }`
      : `{ "${spec.key}": ["...", "..."] }`;

  const user = [
    "Contest data (this is the complete set of facts available to you):",
    "```json",
    JSON.stringify(reduced, null, 2),
    "```",
    "",
    `Task: ${spec.instruction}`,
    "",
    `Respond with JSON in exactly this shape: ${shape}`,
    "Every number you write must appear verbatim in the JSON above.",
  ].join("\n");

  return { system: SYSTEM_PROMPT, user };
}
