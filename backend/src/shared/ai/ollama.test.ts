import { afterEach, describe, expect, it, vi } from "vitest";

import { callOllamaJson, probeOllama } from "./ollama";

describe("Ollama transport diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs a missing model internally while retaining the diagnostic for server callers", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ models: [{ name: "another-model:latest" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const status = await probeOllama("http://private-ollama:11434", "qwen2.5-coder:latest");

    expect(status.available).toBe(false);
    expect(status.reason).toContain("ollama pull qwen2.5-coder:latest");
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Ollama model is missing"),
      expect.objectContaining({ model: "qwen2.5-coder:latest" }),
    );
  });

  it("logs transport failures and returns null instead of throwing", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connection refused at private host"));

    const result = await callOllamaJson({
      baseUrl: "http://private-ollama:11434",
      model: "qwen2.5-coder:latest",
      timeoutMs: 100,
      system: "system prompt",
      user: "user prompt",
    });

    expect(result).toBeNull();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Ollama chat request failed"),
      expect.objectContaining({ model: "qwen2.5-coder:latest" }),
    );
  });
});

