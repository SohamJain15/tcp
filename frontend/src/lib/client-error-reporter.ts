import { getApiBaseUrl } from "@/api/client";

export type ClientErrorSource = "react" | "window" | "unhandled_rejection";

const MAX_REPORTS_PER_MINUTE = 5;
const DEDUPE_WINDOW_MS = 30_000;
const recentReports = new Map<string, number>();
let windowStartedAt = 0;
let reportsInWindow = 0;
let installed = false;

function errorParts(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message || error.name, stack: error.stack };
  }
  return { message: typeof error === "string" ? error : "Unknown frontend error" };
}

function currentPathname(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname.slice(0, 500);
}

export function reportClientError(
  source: ClientErrorSource,
  error: unknown,
  componentStack?: string,
): void {
  const parts = errorParts(error);

  if (!import.meta.env.PROD) {
    console.error(`[CLIENT_ERROR] ${source}`, error, componentStack ?? "");
    return;
  }

  const now = Date.now();
  if (now - windowStartedAt >= 60_000) {
    windowStartedAt = now;
    reportsInWindow = 0;
    recentReports.clear();
  }

  const signature = `${source}:${parts.message}:${currentPathname()}`;
  if (reportsInWindow >= MAX_REPORTS_PER_MINUTE || now - (recentReports.get(signature) ?? 0) < DEDUPE_WINDOW_MS) {
    return;
  }
  recentReports.set(signature, now);
  reportsInWindow += 1;

  void fetch(`${getApiBaseUrl()}/api/client-errors`, {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source,
      message: parts.message.slice(0, 2_000),
      stack: parts.stack?.slice(0, 10_000),
      componentStack: componentStack?.slice(0, 10_000),
      pathname: currentPathname(),
    }),
  }).catch(() => undefined);
}

export function installGlobalErrorReporting(): void {
  if (installed || typeof window === "undefined") {
    return;
  }
  installed = true;
  window.addEventListener("error", (event) => {
    reportClientError("window", event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportClientError("unhandled_rejection", event.reason);
  });
}

