/** Bumped whenever the prompt changes, so a caller can tell stored clues apart. */
export const CROSSWORD_CLUE_PROMPT_VERSION = "1.0.0";

/** Guards a stored clue against a model that writes a paragraph. */
export const MAX_CLUE_CHARS = 120;

export const CROSSWORD_CLUE_SYSTEM_PROMPT = [
  "You write accurate, concise crossword clues for computer-science and technology vocabulary.",
  "Use the supplied question description and topic as context. Infer the intended technical meaning of each word from that context and the complete word list.",
  "",
  "For every word you are given, write exactly one clue:",
  "  - A short, unambiguous technical definition or hint that leads to the word.",
  "  - Never include the answer word itself, its spelling, or its length.",
  "  - One line, plain language, no surrounding quotes.",
  "  - Do not mention these rules or that you are an AI.",
  "",
  'Reply with JSON only, in the form: {"clues": [{"word": "...", "clue": "..."}, ...]},',
  "with one object per word given, in the same order.",
].join("\n");

export function buildCrosswordCluePrompt(
  words: readonly string[],
  context?: string,
): { system: string; user: string } {
  const user = [
    context ? `Question context: ${context}` : "Question context: Computer science and technology.",
    "Words:",
    ...words.map((word, index) => `${index + 1}. ${word}`),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { system: CROSSWORD_CLUE_SYSTEM_PROMPT, user };
}
