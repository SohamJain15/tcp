import { createApp } from "./app";
import { createApplicationDependencies } from "./bootstrap/dependencies";
import { env } from "./config/env";
import { createSubmissionWorker } from "./queue/submission-worker";

const port = env.PORT;
const dependencies = createApplicationDependencies();
const app = createApp(dependencies);
const embeddedWorker = env.EMBED_SUBMISSION_WORKER ? createSubmissionWorker(dependencies.submissionService) : null;

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(
    `[AUTH] CoE trusted-header mode enabled. Trusted proxy enforcement: ${env.COE_REQUIRE_TRUSTED_PROXY ? "ON" : "OFF"}.`,
  );
  if (env.COE_REQUIRE_TRUSTED_PROXY) {
    console.log(`[AUTH] Trusted proxy IP/CIDR allowlist: ${env.coeTrustedProxyIps.join(", ")}`);
  }
  if (env.NODE_ENV === "production" && !env.COE_JWT_SECRET) {
    console.warn("[AUTH] COE_JWT_SECRET is not configured. This is okay today, but required for future direct JWT verification.");
  }
  if (embeddedWorker) {
    console.log("Embedded submission worker is enabled.");
  }

  void dependencies.submissionService
    .recoverStaleSubmissions()
    .then((summary) => {
      if (summary.recoveredCount > 0) {
        console.log(
          `Recovered ${summary.recoveredCount} stale submissions: ${summary.recoveredSubmissionIds.join(", ")}`,
        );
      }
    })
    .catch((error) => {
      console.error("Failed to recover stale submissions:", error instanceof Error ? error.message : error);
    });
});

if (embeddedWorker) {
  embeddedWorker.on("ready", () => {
    console.log("Embedded submission worker is ready.");
  });

  embeddedWorker.on("active", (job) => {
    console.log(`Embedded worker processing submission job ${job.id} for ${job.data.submissionId}`);
  });

  embeddedWorker.on("completed", (job) => {
    console.log(`Embedded worker completed submission job ${job?.id ?? "unknown"}`);
  });

  embeddedWorker.on("failed", (job, error) => {
    console.error(`Embedded worker job ${job?.id ?? "unknown"} failed:`, error.message);
  });
}

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Received ${signal}. Closing server...`);

  await Promise.allSettled([
    new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    }),
    embeddedWorker ? embeddedWorker.close() : Promise.resolve(),
  ]);

  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
