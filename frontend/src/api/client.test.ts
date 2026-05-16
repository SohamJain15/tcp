import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiRequest, getApiBaseUrl } from "@/api/client";

describe("api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves API base url", () => {
    expect(getApiBaseUrl()).toBeTruthy();
  });

  it("adds frontend pathname header and parses json response", async () => {
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
    expect(requestHeaders["x-frontend-pathname"]).toBe("/student/dashboard");
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
});
