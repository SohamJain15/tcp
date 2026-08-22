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
  // provisions a throwaway database per attempt on this MySQL, so the admin user must be able to
  // CREATE/DROP DATABASE. The server must be reachable only from the backend.
  SQL_SANDBOX_ENABLED: z.unknown().transform((value) => parseBoolean(value, false)),
  MYSQL_HOST: z.string().min(1).default("127.0.0.1"),
  MYSQL_PORT: z.coerce.number().int().positive().default(3306),
  MYSQL_ADMIN_USER: z.string().optional().transform((value) => value?.trim() ?? "root"),
  MYSQL_ADMIN_PASSWORD: z.string().optional().transform((value) => value?.trim() ?? ""),
  // Per-statement ceiling for a student's query, and the row cap on a captured result set, so a
  // runaway JOIN cannot pin the shared MySQL or return a million rows to the browser.
  SQL_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  SQL_MAX_ROWS: z.coerce.number().int().positive().default(500),
  SQL_SANDBOX_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(5),
  // A throwaway `lab_%` database older than this is treated as orphaned (its request crashed
  // mid-run) and dropped by the sweeper. 0 disables the sweeper.
  SQL_SANDBOX_SWEEP_INTERVAL_MS: z.coerce.number().int().nonnegative().default(300000),
  // Local AI contest reports. Every default is safe with nothing installed: the adapter probes the
  // runtime, finds it absent, and falls back to template-generated narratives.
  AI_ENABLED: z.unknown().transform((value) => parseBoolean(value, true)),
  AI_BASE_URL: z.string().min(1).default("http://localhost:11434"),
  AI_MODEL: z.string().min(1).default("qwen2.5:3b"),
  /**
   * Model used for problem hints, kept separate from `AI_MODEL`.
   *
   * Hints are free-form reasoning about an algorithm, which a 3B model does poorly; the report
   * prompts are tuned around `AI_MODEL` and should not be repointed to chase hint quality.
   */
  AI_HINT_MODEL: z.string().min(1).default("llama3.1:latest"),
  /**
   * Model used to draft crossword clues at authoring time, kept separate from the others.
   *
   * Clue writing is short natural-language reasoning about a single word — the same larger model
   * that serves hints handles it well, so it shares that default but can be repointed on its own.
   */
  AI_CROSSWORD_MODEL: z.string().min(1).default("llama3.1:latest"),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  // A GENERATING report older than this is treated as abandoned and can be reclaimed, so a crash
  // mid-generation cannot wedge a contest's report forever.
  AI_STALE_LOCK_MS: z.coerce.number().int().positive().default(600000),
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  coeTrustedProxyIps: parsedEnv.COE_TRUSTED_PROXY_IPS.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean),
  corsOrigins: parsedEnv.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;
