/**
 * Transport for the local Ollama runtime, shared by the contest report and problem hints.
 *
 * Deliberately thin and total: every failure — runtime not installed, model missing, timeout,
 * non-JSON reply — resolves to `null` rather than throwing. Both callers treat AI output as a
 * bonus over a working baseline, so a model outage must never surface as a request failure.
 */

interface OllamaChatResponse {
  message?: { content?: string };
}

export interface OllamaRuntimeStatus {
  available: boolean;
  model: string;
  baseUrl: string;
  /** Present when unreachable, so the UI can explain why rather than just greying out. */
  reason: string | null;
}

export interface OllamaChatOptions {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  system: string;
  user: string;
  /** Raised for prompts carrying a long problem statement. */
  numCtx?: number;
}

/** Probes the runtime and confirms the requested model is actually installed. */
export async function probeOllama(
  baseUrl: string,
  model: string,
  timeoutMs = 2000,
): Promise<OllamaRuntimeStatus> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      return {
        available: false,
        model,
        baseUrl,
        reason: `Local model runtime responded with HTTP ${response.status}.`,
      };
    }

    const body = (await response.json()) as { models?: { name?: string }[] };
    const installed = (body.models ?? [])
      .map((entry) => entry.name)
      .filter((name): name is string => typeof name === "string");

    // Ollama reports tags as "llama3.1:latest"; a bare "llama3.1" in config should still match.
    const hasModel = installed.some(
      (name) => name === model || name.split(":")[0] === model.split(":")[0],
    );

    if (!hasModel) {
      return {
        available: false,
        model,
        baseUrl,
        reason: `Model "${model}" is not installed. Run: ollama pull ${model}`,
      };
    }

    return { available: true, model, baseUrl, reason: null };
  } catch (error) {
    return {
      available: false,
      model,
      baseUrl,
      reason: `Local model runtime unreachable at ${baseUrl} (${
        error instanceof Error ? error.message : "unknown error"
      }).`,
    };
  }
}

/**
 * One JSON-mode chat turn. Returns the raw reply body, or null on any failure.
 *
 * temperature 0 with a fixed seed is what makes two runs over the same input comparable — for
 * hints it also means a problem's hints do not quietly change between two students reading them.
 */
export async function callOllamaJson(options: OllamaChatOptions): Promise<string | null> {
  try {
    const response = await fetch(`${options.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: options.model,
        stream: false,
        format: "json",
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
        options: { temperature: 0, seed: 42, num_ctx: options.numCtx ?? 8192 },
      }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as OllamaChatResponse;
    return body.message?.content ?? null;
  } catch {
    return null;
  }
}
