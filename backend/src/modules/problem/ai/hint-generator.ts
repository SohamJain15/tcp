import { env } from "../../../config/env";
import { callOllamaJson, probeOllama, type OllamaRuntimeStatus } from "../../../shared/ai/ollama";
import type { ProblemRecord } from "../problem.model";
import {
  buildHintPrompt,
  HINTS_PER_PROBLEM,
  HINT_PROMPT_VERSION,
  MAX_HINT_CHARS,
} from "./hint-prompt";

export interface HintGenerator {
  getStatus(): Promise<OllamaRuntimeStatus>;
  /** Returns exactly `HINTS_PER_PROBLEM` hints, or null if usable ones could not be produced. */
  generate(problem: ProblemRecord): Promise<string[] | null>;
  readonly model: string;
  readonly promptVersion: string;
}

const CODE_FENCE = /```/;

/**
 * Accepts the model's reply only if it is exactly what was asked for.
 *
 * The report module validates its output by checking every number traces back to real metrics;
 * hints are prose, so there is nothing to trace. What can be checked is shape and safety, and the
 * rule is all-or-nothing: three good hints or none. Two hints followed by a blank card is a worse
 * experience than a problem that simply has no hints yet, and a hint containing the full solution
 * is worse than both.
 */
export function parseHintResponse(raw: string): string[] | null {
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
  const value = "hints" in record ? record.hints : Object.values(record)[0];
  if (!Array.isArray(value)) {
    return null;
  }

  const hints = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (hints.length !== HINTS_PER_PROBLEM) {
    return null;
  }

  // A hint that ships code is a solution, not a hint.
  if (hints.some((hint) => CODE_FENCE.test(hint) || hint.length > MAX_HINT_CHARS)) {
    return null;
  }

  return hints;
}

export class OllamaHintGenerator implements HintGenerator {
  readonly promptVersion = HINT_PROMPT_VERSION;

  constructor(
    readonly model: string = env.AI_HINT_MODEL,
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
        reason: "AI hint generation is disabled (AI_ENABLED=false).",
      };
    }

    return probeOllama(this.baseUrl, this.model);
  }

  async generate(problem: ProblemRecord): Promise<string[] | null> {
    const status = await this.getStatus();
    if (!status.available) {
      return null;
    }

    const { system, user } = buildHintPrompt(problem);
    // Problem statements run long; the report's 8k default would truncate the constraints on
    // exactly the problems where the constraints are the hint.
    const raw = await callOllamaJson({
      baseUrl: this.baseUrl,
      model: this.model,
      timeoutMs: this.timeoutMs,
      system,
      user,
      numCtx: 16384,
    });

    return raw === null ? null : parseHintResponse(raw);
  }
}

/** Always-offline generator, used when AI is disabled and as the default in tests. */
export class NoopHintGenerator implements HintGenerator {
  readonly model = "none";
  readonly promptVersion = HINT_PROMPT_VERSION;

  async getStatus(): Promise<OllamaRuntimeStatus> {
    return {
      available: false,
      model: this.model,
      baseUrl: "",
      reason: "AI hint generation is disabled.",
    };
  }

  async generate(): Promise<string[] | null> {
    return null;
  }
}
