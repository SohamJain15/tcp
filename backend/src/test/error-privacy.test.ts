import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { env, parseEnvironment } from "../config/env";
import { OllamaCrosswordClueGenerator } from "../modules/classtest/ai/crossword-clue-generator";
import { OllamaHintGenerator } from "../modules/problem/ai/hint-generator";
import { OllamaReportGenerator } from "../modules/report/ai/ollama-client";
import { toPublicAiRuntimeStatus } from "../modules/report/report.service";
import { toContestReportResponse, type ContestReportRecord } from "../modules/report/report.model";
import { AppError } from "../shared/errors/app-error";
import {
  AI_NOT_REACHABLE_MESSAGE,
  GENERIC_PRODUCTION_ERROR_MESSAGE,
} from "../shared/errors/public-messages";
import { logServerError } from "../shared/logging/error-logger";
import { formatErrorResponse } from "../shared/middleware/error-handler";
import { createTestApp } from "./helpers/create-test-app";

describe("production error privacy", () => {
  it("uses AI_MODEL for every Ollama feature", () => {
    expect(new OllamaReportGenerator().model).toBe(env.AI_MODEL);
    expect(new OllamaHintGenerator().model).toBe(env.AI_MODEL);
    expect(new OllamaCrosswordClueGenerator().model).toBe(env.AI_MODEL);
  });

  it("requires an explicit production AI model when AI is enabled", () => {
    const source = {
      ...process.env,
      NODE_ENV: "production",
      AI_ENABLED: "true",
      AI_MODEL: "",
      COE_JWT_SECRET: "test-secret-that-is-at-least-32-characters",
      COE_TRUSTED_PROXY_IPS: "127.0.0.1",
    };

    expect(() => parseEnvironment(source)).toThrow(/AI_MODEL is required/);
    expect(parseEnvironment({ ...source, AI_MODEL: "qwen2.5-coder:latest" }).AI_MODEL)
      .toBe("qwen2.5-coder:latest");
  });

  it("hides 5xx details but preserves safe 4xx validation", () => {
    const internal = formatErrorResponse(
      new AppError(500, "mongodb://private-host failed", { command: "secret" }),
      true,
    );
    expect(internal.body).toEqual({ message: GENERIC_PRODUCTION_ERROR_MESSAGE });

    const ai = formatErrorResponse(
      new AppError(503, "ollama pull private-model", undefined, AI_NOT_REACHABLE_MESSAGE),
      true,
    );
    expect(ai.body).toEqual({ message: AI_NOT_REACHABLE_MESSAGE });

    const validationError = z.object({ title: z.string().min(3) }).safeParse({ title: "" });
    expect(validationError.success).toBe(false);
    if (!validationError.success) {
      const validation = formatErrorResponse(validationError.error, true);
      expect(validation.statusCode).toBe(400);
      expect(validation.body.message).toBe("Validation failed");
      expect(validation.body.details).toBeDefined();
    }
  });

  it("sanitizes persisted report failures and AI warnings", () => {
    const record = {
      contestId: "contest-1",
      status: "FAILED",
      source: "TEMPLATE",
      metrics: null,
      narrative: null,
      warnings: ["Model missing. Run: ollama pull private-model"],
      modelId: null,
      promptVersion: null,
      metricsHash: null,
      generatedByEmail: "faculty@example.com",
      generatedAt: null,
      failureReason: "Connection refused at http://private-host:11434",
    } as unknown as ContestReportRecord;

    const response = toContestReportResponse(record, true);
    expect(response.failureReason).toBe(GENERIC_PRODUCTION_ERROR_MESSAGE);
    expect(response.warnings).toEqual([AI_NOT_REACHABLE_MESSAGE]);
    expect(JSON.stringify(response)).not.toContain("private-host");
    expect(JSON.stringify(response)).not.toContain("ollama pull");

    const status = toPublicAiRuntimeStatus({
      available: false,
      model: "private-model",
      baseUrl: "http://private-host:11434",
      reason: "Run ollama pull private-model",
    });
    expect(status).toEqual({ available: false, message: AI_NOT_REACHABLE_MESSAGE });
    expect(status).not.toHaveProperty("model");
    expect(status).not.toHaveProperty("baseUrl");
  });

  it("accepts bounded authenticated frontend crash reports without echoing them", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { app } = createTestApp();
    const response = await request(app)
      .post("/api/client-errors")
      .set({
        "x-coe-role": "FACULTY",
        "x-coe-email": "faculty1@tcetmumbai.in",
        "x-coe-name": "Prof. Mehta",
        origin: env.corsOrigins[0],
      })
      .send({
        source: "react",
        message: "render exploded",
        stack: "private client stack",
        componentStack: "at FacultyPage",
        pathname: "/faculty/problems/1",
      });

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Frontend crash report"),
      expect.objectContaining({ source: "react", pathname: "/faculty/problems/1" }),
    );
    consoleSpy.mockRestore();
  });

  it("protects and rate-limits frontend crash reporting", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const payload = { source: "window", message: "boom", pathname: "/faculty/dashboard" };
    const { app: unauthorizedApp } = createTestApp({
      authMiddleware: (_req, res) => {
        res.status(401).json({ message: "Authentication required." });
      },
    });
    const unauthorized = await request(unauthorizedApp)
      .post("/api/client-errors")
      .set({ origin: env.corsOrigins[0] })
      .send(payload);
    expect(unauthorized.status).toBe(401);

    const rejectedOrigin = await request(unauthorizedApp)
      .post("/api/client-errors")
      .set({ origin: "https://untrusted.example" })
      .send(payload);
    expect(rejectedOrigin.status).not.toBe(204);

    const { app } = createTestApp();
    const headers = {
      "x-coe-role": "FACULTY",
      "x-coe-email": "faculty1@tcetmumbai.in",
      "x-coe-name": "Prof. Mehta",
      origin: env.corsOrigins[0],
    };
    for (let index = 0; index < 10; index += 1) {
      const accepted = await request(app).post("/api/client-errors").set(headers).send(payload);
      expect(accepted.status).toBe(204);
    }
    const limited = await request(app).post("/api/client-errors").set(headers).send(payload);
    expect(limited.status).toBe(429);

    const oversized = await request(createTestApp().app)
      .post("/api/client-errors")
      .set(headers)
      .send({ ...payload, message: "x".repeat(2_001) });
    expect(oversized.status).toBe(400);
    consoleSpy.mockRestore();
  });

  it("redacts sensitive metadata before writing diagnostics", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logServerError("redaction test", new Error("provider failed"), {
      prompt: "private prompt",
      source_code: "private student code",
      authorization: "Bearer private-token",
      provider: "judge0",
    });

    const logged = JSON.stringify(consoleSpy.mock.calls);
    expect(logged).toContain("judge0");
    expect(logged).not.toContain("private prompt");
    expect(logged).not.toContain("private student code");
    expect(logged).not.toContain("private-token");
    consoleSpy.mockRestore();
  });

  it("returns only the safe AI message from crossword generation", async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .post("/api/class-tests/crossword/clues")
      .set({
        "x-coe-role": "FACULTY",
        "x-coe-email": "faculty1@tcetmumbai.in",
        "x-coe-name": "Prof. Mehta",
        origin: env.corsOrigins[0],
      })
      .send({ words: ["STACK"] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ clues: [], available: false, message: AI_NOT_REACHABLE_MESSAGE });
  });
});
