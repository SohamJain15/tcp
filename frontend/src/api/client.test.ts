import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiRequest, getApiBaseUrl, sanitizeApiErrorPayload } from "@/api/client";
import { AI_NOT_REACHABLE_MESSAGE, GENERIC_PRODUCTION_ERROR_MESSAGE } from "@/lib/public-errors";

describe("api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves API base url", () => {
    expect(getApiBaseUrl()).toBeTruthy();
  });

  /**
   * `pathname` is accepted and deliberately NOT sent as a header.
   *
   * Sending `x-frontend-pathname` makes every call a non-simple request, so the browser issues a
   * CORS preflight. The backend's `allowedHeaders` (app.ts) lists only Content-Type and
   * Authorization, so the preflight fails and EVERY api call is blocked — the app cannot even
   * load /api/users/me. Re-adding the header here without adding it to the backend CORS config
   * at the same time takes the whole platform down.
   */
  it("does not send the pathname as a header, and parses the json response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await apiRequest<{ ok: boolean }>("/health", {
      pathname: "/student/dashboard",
    });

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, options] = fetchMock.mock.calls[0];
    const requestHeaders = options?.headers as Record<string, string>;
    expect(requestHeaders["x-frontend-pathname"]).toBeUndefined();
  });

  it("sends only simple headers, so no request triggers a CORS preflight", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await apiRequest<{ ok: boolean }>("/health", {
      method: "POST",
      body: { hello: "world" },
      pathname: "/student/dashboard",
    });

    const [, options] = fetchMock.mock.calls[0];
    const requestHeaders = options?.headers as Record<string, string>;
    // Content-Type is required for a json body and is already in the backend's allowedHeaders.
    // Anything beyond this list must be added to that config in the same change.
    expect(Object.keys(requestHeaders)).toEqual(["Content-Type"]);
  });

  it("normalizes backend error payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Validation failed" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    let caughtError: unknown;
    try {
      await apiRequest("/api/submissions");
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(ApiError);
    expect(caughtError).toMatchObject({ status: 400, message: "Validation failed" });
  });

  it("includes loginUrl in unauthorized responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Authentication required.", loginUrl: "http://localhost:4000/login" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    let caughtError: unknown;
    try {
      await apiRequest("/api/users/me", { suppressAuthRedirect: true });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(ApiError);
    expect(caughtError).toMatchObject({
      status: 401,
      message: "Authentication required.",
      loginUrl: "http://localhost:4000/login",
    });
  });

  it("removes production 5xx payload details while preserving the approved AI message", () => {
    expect(sanitizeApiErrorPayload({
      status: 500,
      message: "database private-host refused connection",
      details: { stack: "secret stack" },
    }, true)).toEqual({ status: 500, message: GENERIC_PRODUCTION_ERROR_MESSAGE });

    expect(sanitizeApiErrorPayload({
      status: 503,
      message: AI_NOT_REACHABLE_MESSAGE,
      details: { command: "ollama pull private-model" },
    }, true)).toEqual({ status: 503, message: AI_NOT_REACHABLE_MESSAGE });
  });
});
