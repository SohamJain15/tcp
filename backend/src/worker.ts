import { createApplicationDependencies } from "./bootstrap/dependencies";
import { createSubmissionWorker } from "./queue/submission-worker";

const dependencies = createApplicationDependencies();
const worker = createSubmissionWorker(dependencies.submissionService);

worker.on("ready", () => {
  console.log("Submission worker is ready.");
});

worker.on("active", (job) => {
  console.log(`Processing submission job ${job.id} for ${job.data.submissionId}`);
});

worker.on("completed", (job) => {
  console.log(`Completed submission job ${job?.id ?? "unknown"}`);
});

worker.on("failed", (job, error) => {
  console.error(`Submission job ${job?.id ?? "unknown"} failed:`, error.message);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}. Closing submission worker...`);
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
