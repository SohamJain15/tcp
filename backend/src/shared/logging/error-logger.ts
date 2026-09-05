const MAX_METADATA_STRING_LENGTH = 2_000;

const SENSITIVE_KEY =
  /authorization|cookie|token|password|secret|api[-_]?key|prompt|source[-_]?code|student[-_]?code|request[-_]?body|stdin/i;

function bounded(value: unknown, depth = 0): unknown {
  if (depth >= 5) {
    return "[max depth]";
  }
  if (typeof value === "string") {
    return value.length <= MAX_METADATA_STRING_LENGTH
      ? value
      : `${value.slice(0, MAX_METADATA_STRING_LENGTH)}...[truncated]`;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => bounded(entry, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 30)
        .map(([key, entry]) => [
          key,
          SENSITIVE_KEY.test(key) ? "[redacted]" : bounded(entry, depth + 1),
        ]),
    );
  }
  return value;
}

function serializeError(error: unknown, depth = 0): unknown {
  if (depth >= 5) {
    return "[max cause depth]";
  }
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    return {
      name: error.name,
      message: bounded(error.message),
      stack: bounded(error.stack),
      cause: cause === undefined ? undefined : serializeError(cause, depth + 1),
    };
  }
  return bounded(error);
}

/** Writes bounded diagnostics to stderr, which PM2 captures. Never pass request bodies or secrets. */
export function logServerError(
  context: string,
  error: unknown,
  metadata: Record<string, unknown> = {},
): void {
  console.error(`[SERVER_ERROR] ${context}`, {
    ...(bounded(metadata) as Record<string, unknown>),
    error: serializeError(error),
  });
}
