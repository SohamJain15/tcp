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
  const pathname =
    options.pathname ||
    (typeof window !== "undefined" && typeof window.location?.pathname === "string"
      ? window.location.pathname
      : "/");

  const headers: Record<string, string> = {
    ...(options.headers ?? {}),
    "x-frontend-pathname": pathname,
  };

  const isJsonBody = options.body !== undefined;
  if (isJsonBody) {
    headers["Content-Type"] = "application/json";
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

    if (
      errorPayload.status === 401 &&
      errorPayload.loginUrl &&
      !options.suppressAuthRedirect &&
      typeof window !== "undefined"
    ) {
      window.location.assign(errorPayload.loginUrl);
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
