import { createApp } from "./app";
import { createApplicationDependencies } from "./bootstrap/dependencies";
import { env } from "./config/env";
import { createSubmissionWorker } from "./queue/submission-worker";
import { logServerError } from "./shared/logging/error-logger";

const port = env.PORT;
const dependencies = createApplicationDependencies();
const app = createApp(dependencies);
const embeddedWorker = env.EMBED_SUBMISSION_WORKER ? createSubmissionWorker(dependencies.submissionService) : null;
const attemptFinalizerIntervalMs = env.ATTEMPT_FINALIZER_INTERVAL_MS;

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`[AI] ${env.AI_ENABLED ? `Enabled with model ${env.AI_MODEL}` : "Disabled"}.`);
  console.log("[AUTH] Trusted proxy enforcement: ON.");
  console.log(`[AUTH] Trusted proxy IP/CIDR allowlist: ${env.coeTrustedProxyIps.join(", ")}`);
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
      logServerError("Failed to recover stale submissions", error);
    });

  if (attemptFinalizerIntervalMs > 0) {
    console.log(`Attempt finaliser enabled (every ${attemptFinalizerIntervalMs}ms).`);
  }
});

// Periodically finalise ACTIVE attempts whose personal deadline has passed, so abandoned attempts are
// submitted and graded near their real deadline instead of lingering until the student returns or the
// contest is published. Guarded against overlapping runs; disabled when the interval is 0.
let finalizerRunning = false;
const attemptFinalizerTimer =
  attemptFinalizerIntervalMs > 0
    ? setInterval(() => {
        if (finalizerRunning) {
          return;
        }
        finalizerRunning = true;
        void Promise.allSettled([
          dependencies.contestService.finalizeExpiredAttempts().then((summary) => {
            if (summary.finalizedCount > 0) {
              console.log(
                `Finalised ${summary.finalizedCount} expired contest attempt(s): ${summary.finalizedAttemptIds.join(", ")}`,
              );
            }
          }),
          dependencies.labSessionService.finalizeExpiredAttempts().then((summary) => {
            if (summary.finalizedCount > 0) {
              console.log(`Finalised ${summary.finalizedCount} expired lab-session attempt(s).`);
            }
          }),
        ])
          .catch((error) => {
            logServerError("Attempt finaliser failed", error);
          })
          .finally(() => {
            finalizerRunning = false;
          });
      }, attemptFinalizerIntervalMs)
    : null;

if (attemptFinalizerTimer) {
  // Don't keep the process alive solely for this timer.
  attemptFinalizerTimer.unref();
}

// Reap DBMS-Lab sandbox databases a crashed run left behind. Only wired when the real MySQL
// sandbox is enabled; a database still in use is younger than one sweep interval, so this only
// ever drops orphans.
const sqlSweepIntervalMs = env.SQL_SANDBOX_SWEEP_INTERVAL_MS;
const sqlSandboxSweep = dependencies.sqlSandboxSweep;
const sqlSweepTimer =
  sqlSandboxSweep && sqlSweepIntervalMs > 0
    ? setInterval(() => {
        void sqlSandboxSweep(sqlSweepIntervalMs).catch((error) => {
          logServerError("SQL sandbox sweep failed", error);
        });
      }, sqlSweepIntervalMs)
    : null;
sqlSweepTimer?.unref();

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
    logServerError("Embedded worker job failed", error, { jobId: job?.id ?? "unknown" });
  });
}

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Received ${signal}. Closing server...`);

  if (attemptFinalizerTimer) {
    clearInterval(attemptFinalizerTimer);
  }

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
