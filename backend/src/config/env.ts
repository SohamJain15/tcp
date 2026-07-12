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
  JUDGE0_POLL_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  REDIS_HOST: z.string().min(1).default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0),
  REDIS_PASSWORD: z.string().optional().transform((value) => value?.trim() ?? ""),
  SUBMISSION_QUEUE_NAME: z.string().min(1).default("tcet-code-submissions"),
  SUBMISSION_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(4),
  SUBMISSION_RECOVERY_STALE_MS: z.coerce.number().int().positive().default(30000),
  EMBED_SUBMISSION_WORKER: z
    .unknown()
    .transform((value) => parseBoolean(value, true)),
  DEFAULT_PROBLEM_TIME_LIMIT_SECONDS: z.coerce.number().int().positive().default(1),
  DEFAULT_PROBLEM_MEMORY_LIMIT_MB: z.coerce.number().int().positive().default(256),
  RATING_POINTS_EASY: z.coerce.number().int().nonnegative().default(100),
  RATING_POINTS_MEDIUM: z.coerce.number().int().nonnegative().default(200),
  RATING_POINTS_HARD: z.coerce.number().int().nonnegative().default(300),
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
