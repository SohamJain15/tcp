import { env } from "../../../config/env";
import { callOllamaJson, probeOllama, type OllamaRuntimeStatus } from "../../../shared/ai/ollama";
import {
  buildCrosswordCluePrompt,
  CROSSWORD_CLUE_PROMPT_VERSION,
  MAX_CLUE_CHARS,
} from "./crossword-clue-prompt";

export interface CrosswordClue {
  word: string;
  clue: string;
}

export interface CrosswordClueGenerator {
  getStatus(): Promise<OllamaRuntimeStatus>;
  /** One clue per requested word, in the same order — or null if usable clues could not be made. */
  generate(words: string[], topic?: string): Promise<CrosswordClue[] | null>;
  readonly model: string;
  readonly promptVersion: string;
}

/**
 * Accepts the model's reply only if there is exactly one usable clue per word, in order.
 *
 * All-or-nothing, like the hint generator: a partial set would leave some words silently blank,
 * which is worse than the faculty simply typing the clues. A clue that leaks its own word is
 * rejected too — a crossword clue that names the answer defeats the puzzle.
 */
export function parseClueResponse(raw: string, words: readonly string[]): CrosswordClue[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const value = "clues" in record ? record.clues : Object.values(record)[0];
  if (!Array.isArray(value) || value.length !== words.length) {
    return null;
  }

  const clues: CrosswordClue[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const item = value[index];
    if (!item || typeof item !== "object") {
      return null;
    }
    const clue = (item as Record<string, unknown>).clue;
    if (typeof clue !== "string") {
      return null;
    }
    const trimmed = clue.trim();
    const word = words[index].toUpperCase();
    // Reject an empty clue, one that runs long, or one that gives the answer away.
    if (trimmed.length === 0 || trimmed.length > MAX_CLUE_CHARS || trimmed.toUpperCase().includes(word)) {
      return null;
    }
    clues.push({ word, clue: trimmed });
  }

  return clues;
}

export class OllamaCrosswordClueGenerator implements CrosswordClueGenerator {
  readonly promptVersion = CROSSWORD_CLUE_PROMPT_VERSION;

  constructor(
    readonly model: string = env.AI_CROSSWORD_MODEL,
    private readonly baseUrl: string = env.AI_BASE_URL,
    private readonly timeoutMs: number = env.AI_TIMEOUT_MS,
    private readonly enabled: boolean = env.AI_ENABLED,
  ) {}

  async getStatus(): Promise<OllamaRuntimeStatus> {
    if (!this.enabled) {
      return {
        available: false,
        model: this.model,
        baseUrl: this.baseUrl,
        reason: "AI clue generation is disabled (AI_ENABLED=false).",
      };
    }

    return probeOllama(this.baseUrl, this.model);
  }

  async generate(words: string[], topic?: string): Promise<CrosswordClue[] | null> {
    if (words.length === 0) {
      return [];
    }

    const status = await this.getStatus();
    if (!status.available) {
      return null;
    }

    const { system, user } = buildCrosswordCluePrompt(words, topic);
    const raw = await callOllamaJson({
      baseUrl: this.baseUrl,
      model: this.model,
      timeoutMs: this.timeoutMs,
      system,
      user,
    });

    return raw === null ? null : parseClueResponse(raw, words);
  }
}

/** Always-offline generator, used when AI is disabled and as the default in tests. */
export class NoopCrosswordClueGenerator implements CrosswordClueGenerator {
  readonly model = "none";
  readonly promptVersion = CROSSWORD_CLUE_PROMPT_VERSION;

  async getStatus(): Promise<OllamaRuntimeStatus> {
    return {
      available: false,
      model: this.model,
      baseUrl: "",
      reason: "AI clue generation is disabled.",
    };
  }

  async generate(): Promise<CrosswordClue[] | null> {
    return null;
  }
}
