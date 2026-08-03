import type { ApiErrorPayload } from "@/api/types";

function getDefaultApiBaseUrl(): string {
  if (typeof window !== "undefined" && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }

  return "http://localhost:3001";
}

function resolveApiBaseUrl(): string {
  const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (!configuredBaseUrl) {
    return getDefaultApiBaseUrl();
  }

  if (typeof window === "undefined") {
    return configuredBaseUrl;
  }

  try {
    const parsed = new URL(configuredBaseUrl);
    if (["localhost", "127.0.0.1"].includes(parsed.hostname) && parsed.hostname !== window.location.hostname) {
      parsed.hostname = window.location.hostname;
      return parsed.toString().replace(/\/$/, "");
    }
  } catch {
    return configuredBaseUrl;
  }

  return configuredBaseUrl;
}

const API_BASE_URL = resolveApiBaseUrl();
const AUTH_REDIRECT_ALLOWLIST = ["https://www.tcetmumbai.in","https://tcetcercd.in"];

function isAllowedLoginUrl(candidateUrl: string): boolean {
  try {
    const parsed = new URL(candidateUrl);
    return AUTH_REDIRECT_ALLOWLIST.some((allowedUrl) => parsed.origin === allowedUrl);
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  status: number;
  loginUrl?: string;
  details?: unknown;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = "ApiError";
    this.status = payload.status;
    this.loginUrl = payload.loginUrl;
    this.details = payload.details;
  }
}

export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | undefined | null>;
  body?: unknown;
  pathname?: string;
  headers?: Record<string, string>;
  suppressAuthRedirect?: boolean;
  responseType?: "json" | "text";
};

/** Kept in step with `createFrontendPathnameGuard` in the backend's app.ts. */
const FRONTEND_PATHNAME_PATTERN = /^\/[a-zA-Z0-9/_-]*$/;

function buildQueryString(query?: ApiRequestOptions["query"]): string {
  if (!query) {
    return "";
  }

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      params.set(key, String(value));
    }
  });

  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

async function parseErrorPayload(response: Response): Promise<ApiErrorPayload> {
  try {
    const data = await response.json();

    if (data && typeof data === "object") {
      const loginUrl =
        typeof (data as { loginUrl?: unknown }).loginUrl === "string"
          ? (data as { loginUrl: string }).loginUrl
          : undefined;
      const message =
        typeof (data as { message?: unknown }).message === "string"
          ? (data as { message: string }).message
          : `Request failed with status ${response.status}`;
      return {
        status: response.status,
        message,
        loginUrl,
        details: data,
      };
    }
  } catch {
    // ignore parse error
  }

  return {
    status: response.status,
    message: `Request failed with status ${response.status}`,
  };
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const queryString = buildQueryString(options.query);

  const headers: Record<string, string> = { ...(options.headers ?? {}) };

  const isJsonBody = options.body !== undefined;
  if (isJsonBody) {
    headers["Content-Type"] = "application/json";
  }

  // Tells the backend which screen the call came from. The guard there rejects a malformed value
  // outright, so send it only when it matches the shape the server accepts — an unexpected
  // character in a route id must never turn a working request into a 400.
  if (options.pathname && FRONTEND_PATHNAME_PATTERN.test(options.pathname)) {
    headers["x-frontend-pathname"] = options.pathname;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}${queryString}`, {
      method: options.method ?? "GET",
      credentials: "include",
      headers,
      body: isJsonBody ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed";
    throw new ApiError({
      status: 0,
      message: `Unable to reach backend at ${API_BASE_URL}. ${message}`,
    });
  }

  if (!response.ok) {
    const errorPayload = await parseErrorPayload(response);

    if (errorPayload.status === 401 && !options.suppressAuthRedirect && typeof window !== "undefined") {
      if (errorPayload.loginUrl && isAllowedLoginUrl(errorPayload.loginUrl)) {
        window.location.assign(errorPayload.loginUrl);
      } else if (window.location.pathname !== "/") {
        // Auth was lost (e.g. CoE-side logout or session timeout) and no login URL was supplied.
        // Send the user to the public landing page instead of leaving them on a broken authed view.
        window.location.assign("/");
      }
    }

    throw new ApiError(errorPayload);
  }

  if (options.responseType === "text") {
    return (await response.text()) as T;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}
