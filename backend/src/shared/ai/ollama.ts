/**
 * Transport for the local Ollama runtime, shared by the contest report and problem hints.
 *
 * Deliberately thin and total: every failure resolves to `null` rather than throwing. Diagnostics
 * are written to server stderr for PM2; callers must never expose them to browser responses.
 */

import { logServerError } from "../logging/error-logger";

interface OllamaChatResponse {
  message?: { content?: string };
}

export interface OllamaRuntimeStatus {
  available: boolean;
  model: string;
  baseUrl: string;
  /** Internal diagnostic only. Public API responses must map this to a safe message. */
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
      const error = new Error(`Ollama tag probe returned HTTP ${response.status}.`);
      logServerError("Ollama runtime probe failed", error, { baseUrl, model, status: response.status });
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

    // Ollama reports tagged names; a bare model name in config should still match its tagged form.
    const hasModel = installed.some(
      (name) => name === model || name.split(":")[0] === model.split(":")[0],
    );

    if (!hasModel) {
      const error = new Error(`Model "${model}" is not installed. Run: ollama pull ${model}`);
      logServerError("Ollama model is missing", error, { baseUrl, model, installed });
      return {
        available: false,
        model,
        baseUrl,
        reason: `Model "${model}" is not installed. Run: ollama pull ${model}`,
      };
    }

    return { available: true, model, baseUrl, reason: null };
  } catch (error) {
    logServerError("Ollama runtime is unreachable", error, { baseUrl, model });
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
      logServerError("Ollama chat request failed", new Error(`HTTP ${response.status}`), {
        baseUrl: options.baseUrl,
        model: options.model,
        status: response.status,
      });
      return null;
    }

    const body = (await response.json()) as OllamaChatResponse;
    const content = body.message?.content;
    if (typeof content !== "string") {
      logServerError("Ollama chat returned no content", new Error("Missing message content"), {
        baseUrl: options.baseUrl,
        model: options.model,
      });
      return null;
    }
    return content;
  } catch (error) {
    logServerError("Ollama chat request failed", error, {
      baseUrl: options.baseUrl,
      model: options.model,
    });
    return null;
  }
}
