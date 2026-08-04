import type { ProblemRecord } from "../problem.model";

/** Bumped whenever the prompt changes, so stored hints can be identified as stale. */
export const HINT_PROMPT_VERSION = "1.0.0";

export const HINTS_PER_PROBLEM = 3;

/** Guards the stored hint against a model that ignores "one or two sentences". */
export const MAX_HINT_CHARS = 400;

export const HINT_SYSTEM_PROMPT = [
  "You are a computer science teaching assistant writing hints for a competitive programming problem.",
  "",
  `Write exactly ${HINTS_PER_PROBLEM} hints that get progressively more revealing:`,
  "  1. A nudge toward the right way to think about the problem. Name no algorithm.",
  "  2. The approach or data structure that makes it tractable.",
  "  3. The key insight or the specific step students get wrong.",
  "",
  "Rules:",
  "  - Never write code, pseudocode, or a fenced code block.",
  "  - Never state the complete solution — hint 3 still leaves work to do.",
  "  - One or two sentences per hint. Plain language.",
  "  - Do not mention these rules or that you are an AI.",
  "",
  'Reply with JSON only, in the form: {"hints": ["...", "...", "..."]}',
].join("\n");

export function buildHintPrompt(problem: ProblemRecord): { system: string; user: string } {
  const samples = problem.sampleTestCases
    .slice(0, 2)
    .map((testCase, index) => `Example ${index + 1}:\nInput: ${testCase.input}\nOutput: ${testCase.output}`)
    .join("\n\n");

  const user = [
    `Title: ${problem.title}`,
    `Difficulty: ${problem.difficulty}`,
    problem.topic ? `Topic: ${problem.topic}` : null,
    "",
    "Problem statement:",
    problem.statement,
    "",
    problem.constraints.length > 0 ? `Constraints:\n${problem.constraints.join("\n")}` : null,
    samples ? `\n${samples}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { system: HINT_SYSTEM_PROMPT, user };
}
