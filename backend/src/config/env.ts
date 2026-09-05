import "dotenv/config";
import path from "node:path";
import { z } from "zod";

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  COE_AUTH_BASE_URL: z.string().min(1).default("http://127.0.0.1:4000"),
  FRONTEND_BASE_URL: z.string().min(1).default("http://localhost:5173"),
  COE_JWT_SECRET: z.string().trim().min(32),
  COE_REQUIRE_TRUSTED_PROXY: z.unknown().transform((value) => parseBoolean(value, true)),
  COE_TRUSTED_PROXY_IPS: z
    .string()
    .trim()
    .min(1)
    .refine((value) => value.split(",").map((entry) => entry.trim()).filter(Boolean).length <= 20, {
      message: "COE_TRUSTED_PROXY_IPS must contain at most 20 entries",
    })
    .refine(
      (value) => value.split(",").every((entry) => entry.trim().length <= 45),
      {
        message: "Each trusted proxy IP entry must be at most 45 characters",
      },
    ),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017"),
  MONGODB_DB_NAME: z.string().min(1).default("Tcet-code-platform"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  EXECUTION_PROVIDER: z.enum(["stub", "judge0"]).default("stub"),
  JUDGE0_BASE_URL: z.string().optional().transform((value) => value?.trim() ?? ""),
  JUDGE0_API_KEY: z.string().optional().transform((value) => value?.trim() ?? ""),
  JUDGE0_HOST: z.string().optional().transform((value) => value?.trim() ?? ""),
  JUDGE0_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1500),
  // A run is capped well below this (5s CPU / 10s wall), so a lower ceiling only
  // frees a blocked worker sooner. Timeouts surface as INTERNAL_ERROR and are not
  // retried by the queue, so waiting longer buys nothing.
  JUDGE0_POLL_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  // Ask Judge0 to hold the request until the run finishes (needs ENABLE_WAIT_RESULT
  // on the Judge0 side). Avoids paying a full JUDGE0_POLL_INTERVAL_MS on every test
  // case; the token+poll path stays as the fallback.
  JUDGE0_USE_WAIT: z.unknown().transform((value) => parseBoolean(value, true)),
  REDIS_HOST: z.string().min(1).default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0),
  REDIS_PASSWORD: z.string().optional().transform((value) => value?.trim() ?? ""),
  SUBMISSION_QUEUE_NAME: z.string().min(1).default("tcet-code-submissions"),
  SUBMISSION_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(4),
  // Test cases sent to Judge0 in parallel per submission. Peak in-flight Judge0 jobs is
  // (worker processes) x SUBMISSION_WORKER_CONCURRENCY x this, and should be sized against
  // the isolate worker count (`COUNT` in judge0.conf) so requests don't queue inside Judge0.
  SUBMISSION_CHUNK_SIZE: z.coerce.number().int().min(1).max(20).default(5),
  // Compile once and run every test case in a single job (harness problems in languages with
  // batch support). Any inconclusive batch silently re-runs case-by-case, so this only changes
  // how fast a verdict is reached, never the verdict.
  JUDGE0_BATCH_TEST_CASES: z.unknown().transform((value) => parseBoolean(value, true)),
  // Cases per batched job. Automatically reduced when the per-case time limit is high enough
  // that a full batch would exceed the batch time ceiling.
  SUBMISSION_BATCH_SIZE: z.coerce.number().int().min(2).max(200).default(25),
  SUBMISSION_RECOVERY_STALE_MS: z.coerce.number().int().positive().default(30000),
  // How often the background finaliser sweeps for ACTIVE attempts past their deadline. 0 disables it.
  ATTEMPT_FINALIZER_INTERVAL_MS: z.coerce.number().int().nonnegative().default(60000),
  EMBED_SUBMISSION_WORKER: z
    .unknown()
    .transform((value) => parseBoolean(value, true)),
  DEFAULT_PROBLEM_TIME_LIMIT_SECONDS: z.coerce.number().int().positive().default(1),
  DEFAULT_PROBLEM_MEMORY_LIMIT_MB: z.coerce.number().int().positive().default(256),
  RATING_POINTS_EASY: z.coerce.number().int().nonnegative().default(100),
  RATING_POINTS_MEDIUM: z.coerce.number().int().nonnegative().default(200),
  RATING_POINTS_HARD: z.coerce.number().int().nonnegative().default(300),
  // DBMS Lab SQL sandbox. Off by default: with it disabled the rest of the platform runs with no
  // MySQL dependency, and the lab module falls back to a stub executor. When enabled, the backend
  // provisions a throwaway database per attempt on a dedicated MySQL instance, so the admin user
  // must be able to CREATE/DROP DATABASE and CREATE/DROP users. The server must be private.
  SQL_SANDBOX_ENABLED: z.unknown().transform((value) => parseBoolean(value, false)),
  SQL_SANDBOX_ISOLATED_INSTANCE: z.unknown().transform((value) => parseBoolean(value, false)),
  SQL_SANDBOX_NAMESPACE: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,20}$/, "SQL_SANDBOX_NAMESPACE must contain only lowercase letters, digits, and underscores")
    .default("tcp"),
  MYSQL_HOST: z.string().min(1).default("127.0.0.1"),
  MYSQL_PORT: z.coerce.number().int().positive().default(3306),
  MYSQL_ADMIN_USER: z.string().trim().min(1).default("tcp_sql_admin"),
  MYSQL_ADMIN_PASSWORD: z.string().optional().transform((value) => value?.trim() ?? ""),
  // Per-statement ceiling for a student's query, and the row cap on a captured result set, so a
  // runaway JOIN cannot pin the shared MySQL or return a million rows to the browser.
  SQL_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  SQL_MAX_ROWS: z.coerce.number().int().positive().default(500),
  SQL_MAX_COLUMNS: z.coerce.number().int().positive().max(500).default(100),
  SQL_MAX_QUERY_LENGTH: z.coerce.number().int().min(128).max(100000).default(12000),
  SQL_MAX_SCHEMA_LENGTH: z.coerce.number().int().min(1024).max(500000).default(100000),
  SQL_MAX_SOLUTION_LENGTH: z.coerce.number().int().min(128).max(100000).default(20000),
  // One active run consumes one admin-pool connection and one student connection. Keep the
  // default conservative for development, while allowing the Linux production deployment to
  // support 500 simultaneous sandbox executions when the host is sized for it.
  SQL_SANDBOX_CONCURRENCY: z.coerce.number().int().min(1).max(500).default(5),
  SQL_SANDBOX_POOL_SIZE: z.coerce.number().int().min(1).max(500).default(5),
  // A namespaced throwaway database older than this is treated as orphaned (its request crashed
  // mid-run) and dropped by the sweeper. 0 disables the sweeper.
  SQL_SANDBOX_SWEEP_INTERVAL_MS: z.coerce.number().int().nonnegative().default(300000),
  // Local AI contest reports. Every default is safe with nothing installed: the adapter probes the
  // runtime, finds it absent, and falls back to template-generated narratives.
  AI_ENABLED: z.unknown().transform((value) => parseBoolean(value, true)),
  AI_BASE_URL: z.string().min(1).default("http://localhost:11434"),
  // One model serves reports, hints, and crossword clues. Production must state it explicitly so
  // no feature can silently select a different hardcoded model.
  AI_MODEL: z.string().optional().transform((value) => value?.trim() ?? ""),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  // A GENERATING report older than this is treated as abandoned and can be reclaimed, so a crash
  // mid-generation cannot wedge a contest's report forever.
  AI_STALE_LOCK_MS: z.coerce.number().int().positive().default(600000),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === "production" && value.AI_ENABLED && !value.AI_MODEL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["AI_MODEL"],
      message: "AI_MODEL is required when AI is enabled in production.",
    });
  }

  if (value.NODE_ENV === "production" && value.SQL_SANDBOX_ENABLED) {
    if (!value.SQL_SANDBOX_ISOLATED_INSTANCE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SQL_SANDBOX_ISOLATED_INSTANCE"],
        message: "Production SQL sandbox requires a dedicated isolated MySQL instance.",
      });
    }
    if (!value.MYSQL_ADMIN_PASSWORD) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MYSQL_ADMIN_PASSWORD"],
        message: "MYSQL_ADMIN_PASSWORD is required when the production SQL sandbox is enabled.",
      });
    }
    if (value.MYSQL_ADMIN_USER.toLowerCase() === "root") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MYSQL_ADMIN_USER"],
        message: "Use a dedicated sandbox admin account instead of root.",
      });
    }
  }
});

export function parseEnvironment(source: NodeJS.ProcessEnv) {
  return envSchema.parse(source);
}

const parsedEnv = parseEnvironment(process.env);

export const env = {
  ...parsedEnv,
  // Development and tests remain zero-config; production is validated above and never reaches
  // this fallback.
  AI_MODEL: parsedEnv.AI_MODEL || "qwen2.5-coder:latest",
  coeTrustedProxyIps: parsedEnv.COE_TRUSTED_PROXY_IPS.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean),
  corsOrigins: parsedEnv.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;
