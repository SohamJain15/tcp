import { afterEach, describe, expect, it, vi } from "vitest";

import { callGatewayJson, extractJsonObject, probeGateway } from "./gateway";

const baseOptions = {
  baseUrl: "https://gateway.test/v1",
  apiKey: "sk-secret-key",
  model: "qwen3.6",
  timeoutMs: 100,
  system: "system prompt",
  user: "user prompt",
  maxTokens: 256,
};

function chatResponse(content: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AI gateway transport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("probes /models with the bearer key and reports available on 200", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    const status = await probeGateway(baseOptions.baseUrl, baseOptions.apiKey, baseOptions.model);

    expect(status.available).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://gateway.test/v1/models");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer sk-secret-key");
  });

  it("reports a rejected key without logging the key", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));

    const status = await probeGateway(baseOptions.baseUrl, baseOptions.apiKey, baseOptions.model);

    expect(status.available).toBe(false);
    expect(status.reason).toContain("AI_API_KEY");
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain("sk-secret-key");
  });

  it("is unavailable without a key and makes no request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const status = await probeGateway(baseOptions.baseUrl, "", baseOptions.model);

    expect(status.available).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns the JSON body of an OpenAI-style chat completion", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(chatResponse('{"hints":["a","b","c"]}'));

    const result = await callGatewayJson(baseOptions);

    expect(result).toBe('{"hints":["a","b","c"]}');
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://gateway.test/v1/chat/completions");
    const body = JSON.parse(String(init?.body));
    expect(body.messages).toEqual([
      { role: "system", content: "system prompt" },
      { role: "user", content: "user prompt" },
    ]);
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBe(256);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("retries once without response_format when the gateway rejects it", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 400 }))
      .mockResolvedValueOnce(chatResponse('{"ok":true}'));

    const result = await callGatewayJson(baseOptions);

    expect(result).toBe('{"ok":true}');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchSpy.mock.calls[1][1]?.body)).response_format).toBeUndefined();
  });

  it("logs transport failures and returns null instead of throwing", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connection refused at private host"));

    const result = await callGatewayJson(baseOptions);

    expect(result).toBeNull();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("AI gateway chat request failed"),
      expect.objectContaining({ model: "qwen3.6" }),
    );
  });

  it("returns null on a 502 from the model server", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad gateway", { status: 502 }));

    expect(await callGatewayJson(baseOptions)).toBeNull();
  });
});

describe("extractJsonObject", () => {
  it("strips code fences and thinking blocks", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJsonObject('<think>{"draft":true}</think>\n{"a":1}')).toBe('{"a":1}');
  });

  it("leaves non-JSON text for the parser to reject", () => {
    expect(extractJsonObject("no json here")).toBe("no json here");
  });
});
