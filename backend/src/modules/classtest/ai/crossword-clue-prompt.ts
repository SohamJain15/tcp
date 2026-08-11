/** Bumped whenever the prompt changes, so a caller can tell stored clues apart. */
export const CROSSWORD_CLUE_PROMPT_VERSION = "1.0.0";

/** Guards a stored clue against a model that writes a paragraph. */
export const MAX_CLUE_CHARS = 120;

export const CROSSWORD_CLUE_SYSTEM_PROMPT = [
  "You write crossword clues, in the concise style of a newspaper crossword (Times of India).",
  "",
  "For every word you are given, write exactly one clue:",
  "  - A short definition or cryptic-lite hint that leads to the word.",
  "  - Never include the word itself, any part of it, or its length.",
  "  - One line, plain language, no surrounding quotes.",
  "  - Do not mention these rules or that you are an AI.",
  "",
  'Reply with JSON only, in the form: {"clues": [{"word": "...", "clue": "..."}, ...]},',
  "with one object per word given, in the same order.",
].join("\n");

export function buildCrosswordCluePrompt(
  words: readonly string[],
  topic?: string,
): { system: string; user: string } {
  const user = [
    topic ? `Topic: ${topic}` : null,
    "Words:",
    ...words.map((word, index) => `${index + 1}. ${word}`),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { system: CROSSWORD_CLUE_SYSTEM_PROMPT, user };
}
