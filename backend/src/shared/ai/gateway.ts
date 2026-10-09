/**
 * Transport for the CoE AI Gateway (OpenAI-compatible), shared by the contest report, problem
 * hints and crossword clues.
 *
 * Deliberately thin and total: every failure resolves to `null` rather than throwing. Diagnostics
 * are written to server stderr for PM2; callers must never expose them to browser responses.
 * The API key is sent only in the Authorization header and is never logged.
 */

import { logServerError } from "../logging/error-logger";

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
}

export interface AiRuntimeStatus {
  available: boolean;
  model: string;
  baseUrl: string;
  /** Internal diagnostic only. Public API responses must map this to a safe message. */
  reason: string | null;
}

export interface GatewayChatOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  system: string;
  user: string;
  maxTokens: number;
}

function authHeaders(apiKey: string): Record<string, string> {
  return { "content-type": "application/json", authorization: `Bearer ${apiKey}` };
}

function describeHttpFailure(status: number): string {
  if (status === 401) {
    return "AI gateway rejected AI_API_KEY (HTTP 401).";
  }
  if (status === 502) {
    return "AI gateway model server is unavailable (HTTP 502).";
  }
  return `AI gateway responded with HTTP ${status}.`;
}

/** Health check: `GET /models` confirms the gateway is reachable and the key is accepted. */
export async function probeGateway(
  baseUrl: string,
  apiKey: string,
  model: string,
  timeoutMs = 5000,
): Promise<AiRuntimeStatus> {
  if (!apiKey) {
    return { available: false, model, baseUrl, reason: "AI_API_KEY is not configured." };
  }

  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: authHeaders(apiKey),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const reason = describeHttpFailure(response.status);
      logServerError("AI gateway probe failed", new Error(reason), { baseUrl, model, status: response.status });
      return { available: false, model, baseUrl, reason };
    }
    return { available: true, model, baseUrl, reason: null };
  } catch (error) {
    logServerError("AI gateway is unreachable", error, { baseUrl, model });
    return {
      available: false,
      model,
      baseUrl,
      reason: `AI gateway unreachable at ${baseUrl} (${error instanceof Error ? error.message : "unknown error"}).`,
    };
  }
}

/**
 * Reduces a reply to its JSON object. Qwen can wrap JSON in a ```json fence or, with thinking on,
 * prefix a <think> block; the parsers downstream expect a bare object.
 */
export function extractJsonObject(content: string): string {
  const withoutThinking = content.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const start = withoutThinking.indexOf("{");
  const end = withoutThinking.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return withoutThinking.trim();
  }
  return withoutThinking.slice(start, end + 1);
}

async function postChat(options: GatewayChatOptions, jsonMode: boolean): Promise<Response> {
  return fetch(`${options.baseUrl}/chat/completions`, {
    method: "POST",
    headers: authHeaders(options.apiKey),
    body: JSON.stringify({
      model: options.model,
      stream: false,
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ],
      max_tokens: options.maxTokens,
      // temperature 0 with a fixed seed keeps two runs over the same input comparable — for hints
      // it also means a problem's hints do not quietly change between two students reading them.
      temperature: 0,
      seed: 42,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(options.timeoutMs),
  });
}

/** One JSON-mode chat turn. Returns the JSON reply body, or null on any failure. */
export async function callGatewayJson(options: GatewayChatOptions): Promise<string | null> {
  const context = { baseUrl: options.baseUrl, model: options.model };
  if (!options.apiKey) {
    logServerError("AI gateway chat skipped", new Error("AI_API_KEY is not configured"), context);
    return null;
  }

  try {
    let response = await postChat(options, true);
    // Not every OpenAI-compatible server accepts `response_format`; the prompts already demand
    // JSON, so retrying without it is safe.
    if (response.status === 400) {
      response = await postChat(options, false);
    }

    if (!response.ok) {
      logServerError("AI gateway chat request failed", new Error(describeHttpFailure(response.status)), {
        ...context,
        status: response.status,
      });
      return null;
    }

    const body = (await response.json()) as ChatCompletionResponse;
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      logServerError("AI gateway chat returned no content", new Error("Missing message content"), context);
      return null;
    }
    return extractJsonObject(content);
  } catch (error) {
    logServerError("AI gateway chat request failed", error, context);
    return null;
  }
}
