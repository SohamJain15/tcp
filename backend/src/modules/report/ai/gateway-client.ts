import { env } from "../../../config/env";
import { AI_NOT_REACHABLE_MESSAGE } from "../../../shared/errors/public-messages";
import { logServerError } from "../../../shared/logging/error-logger";
import { callGatewayJson, probeGateway, type AiRuntimeStatus } from "../../../shared/ai/gateway";
import {
  assignNarrativeSection,
  type ContestAnalytics,
  type ContestReportNarrative,
  type NarrativeSection,
} from "../report.model";
import { buildTemplateSection } from "./fallback";
import { PROMPT_VERSION, SECTION_SPECS, buildSectionPrompt } from "./prompt";

/**
 * CoE AI Gateway adapter.
 *
 * The contract with the rest of the module is simple: this never throws and never blocks the report.
 * Any failure — gateway down, bad key, timeout, garbage JSON, a section the model refused to write —
 * resolves to the template text for that section. A report is always produced.
 */

export type { AiRuntimeStatus };

export interface AiGenerationResult {
  narrative: ContestReportNarrative;
  /** True when at least one section came from the model. */
  usedAi: boolean;
  modelId: string | null;
  promptVersion: string;
  warnings: string[];
}

export interface AiReportGenerator {
  getStatus(): Promise<AiRuntimeStatus>;
  generate(metrics: ContestAnalytics): Promise<AiGenerationResult>;
}

const HEALTH_CACHE_MS = 60_000;

function templateNarrativeFor(metrics: ContestAnalytics): ContestReportNarrative {
  return {
    executiveSummary: buildTemplateSection(metrics, "executiveSummary") as string,
    contestInsights: buildTemplateSection(metrics, "contestInsights") as string[],
    efficiencyObservations: buildTemplateSection(metrics, "efficiencyObservations") as string[],
    studentPerformanceObservations: buildTemplateSection(
      metrics,
      "studentPerformanceObservations",
    ) as string[],
    facultyRecommendations: buildTemplateSection(metrics, "facultyRecommendations") as string[],
  };
}

/**
 * Extracts a section's value from the model's JSON reply.
 *
 * Small models frequently answer with the right content under a slightly wrong key, or wrap a
 * single-string section in an array. Accepting those shapes recovers a usable answer instead of
 * discarding good text over a formatting quibble — but anything genuinely unrecognisable returns null
 * and falls back to the template.
 */
export function parseSectionResponse(
  raw: string,
  key: NarrativeSection,
  shape: "string" | "string[]",
): string | string[] | null {
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
  const value = key in record ? record[key] : Object.values(record)[0];

  if (shape === "string") {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (Array.isArray(value)) {
      const joined = value.filter((entry): entry is string => typeof entry === "string").join(" ").trim();
      return joined || null;
    }
    return null;
  }

  if (Array.isArray(value)) {
    const entries = value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
    return entries.length > 0 ? entries : null;
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return null;
}

export class GatewayReportGenerator implements AiReportGenerator {
  private healthCache: { checkedAt: number; status: AiRuntimeStatus } | null = null;

  constructor(
    private readonly baseUrl: string = env.AI_BASE_URL,
    readonly model: string = env.AI_MODEL,
    private readonly apiKey: string = env.AI_API_KEY,
    private readonly timeoutMs: number = env.AI_TIMEOUT_MS,
    private readonly enabled: boolean = env.AI_ENABLED,
  ) {}

  async getStatus(): Promise<AiRuntimeStatus> {
    if (!this.enabled) {
      return {
        available: false,
        model: this.model,
        baseUrl: this.baseUrl,
        reason: "AI report generation is disabled (AI_ENABLED=false).",
      };
    }

    const now = Date.now();
    if (this.healthCache && now - this.healthCache.checkedAt < HEALTH_CACHE_MS) {
      return this.healthCache.status;
    }

    const status = await this.probe();
    this.healthCache = { checkedAt: now, status };
    return status;
  }

  private async probe(): Promise<AiRuntimeStatus> {
    return probeGateway(this.baseUrl, this.apiKey, this.model);
  }

  private async chat(system: string, user: string): Promise<string | null> {
    return callGatewayJson({
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      model: this.model,
      timeoutMs: this.timeoutMs,
      system,
      user,
      maxTokens: env.AI_MAX_TOKENS,
    });
  }

  async generate(metrics: ContestAnalytics): Promise<AiGenerationResult> {
    const status = await this.getStatus();
    if (!status.available) {
      return {
        narrative: templateNarrativeFor(metrics),
        usedAi: false,
        modelId: null,
        promptVersion: PROMPT_VERSION,
        warnings: [AI_NOT_REACHABLE_MESSAGE],
      };
    }

    const narrative = templateNarrativeFor(metrics);
    const warnings: string[] = [];
    let usedAi = false;

    // Sequential rather than parallel: the gateway is a single campus server shared by many
    // students, and firing five at once only makes each slower while risking a timeout.
    for (const spec of SECTION_SPECS) {
      const { system, user } = buildSectionPrompt(metrics, spec);
      const raw = await this.chat(system, user);
      if (raw === null) {
        warnings.push(`The model did not return a ${spec.key} section; a generated summary was used.`);
        continue;
      }

      const parsed = parseSectionResponse(raw, spec.key, spec.shape);
      if (parsed === null) {
        logServerError("AI gateway report response was unusable", new Error("Invalid report section"), {
          model: this.model,
          section: spec.key,
        });
        warnings.push(`The model's ${spec.key} response could not be read; a generated summary was used.`);
        continue;
      }

      assignNarrativeSection(narrative, spec.key, parsed);
      usedAi = true;
    }

    return {
      narrative,
      usedAi,
      modelId: usedAi ? this.model : null,
      promptVersion: PROMPT_VERSION,
      warnings,
    };
  }
}

/** Always-offline generator. Used when AI_ENABLED is false and as the default in tests. */
export class TemplateOnlyReportGenerator implements AiReportGenerator {
  async getStatus(): Promise<AiRuntimeStatus> {
    return {
      available: false,
      model: "none",
      baseUrl: "",
      reason: "AI report generation is disabled.",
    };
  }

  async generate(metrics: ContestAnalytics): Promise<AiGenerationResult> {
    return {
      narrative: templateNarrativeFor(metrics),
      usedAi: false,
      modelId: null,
      promptVersion: PROMPT_VERSION,
      warnings: [],
    };
  }
}
