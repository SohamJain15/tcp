import "dotenv/config";
import { env } from "../config/env";

const baseUrl = `http://127.0.0.1:${env.PORT}`;
const concurrentSubmissions = 10;
const pollIntervalMs = 2_000;
const pollTimeoutMs = 180_000;

const facultyHeaders = {
  "Content-Type": "application/json",
  "x-coe-role": "FACULTY",
  "x-coe-email": "faculty-loadtest@tcetmumbai.in",
  "x-coe-name": "Load Test Faculty",
  "x-coe-status": "ACTIVE",
};

function studentHeaders(index: number): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-coe-role": "STUDENT",
    "x-coe-email": `loadtest-student-${index}@tcetmumbai.in`,
    "x-coe-name": `Load Test Student ${index}`,
    "x-coe-status": "ACTIVE",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${path}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function createProblem(): Promise<string> {
  const payload = await requestJson("/api/problems", {
    method: "POST",
    headers: facultyHeaders,
    body: JSON.stringify({
      title: `Queue Load Test ${Date.now()}`,
      statement: "Read two integers and print their sum.",
      inputFormat: "Two integers",
      outputFormat: "Their sum",
      constraints: ["1 <= a, b <= 10^9"],
      difficulty: "Easy",
      tags: ["Math"],
      timeLimitSeconds: 2,
      memoryLimitMb: 256,
      lifecycleState: "Published",
      sampleTestCases: [{ input: "2 3\n", output: "5\n" }],
      hiddenTestCases: [{ input: "11 31\n", output: "42\n" }],
    }),
  });

  const problem = (payload as { problem?: { id?: string } }).problem;
  if (!problem?.id) {
    throw new Error("Problem creation response did not include an id.");
  }

  return problem.id;
}

async function enqueueSubmission(problemId: string, index: number): Promise<string> {
  const payload = await requestJson("/api/submissions", {
    method: "POST",
    headers: studentHeaders(index),
    body: JSON.stringify({
      problemId,
      language: "python",
      code: "a, b = map(int, input().split())\nprint(a + b)",
    }),
  });

  const submissionId = (payload as { submission_id?: string }).submission_id;
  if (!submissionId) {
    throw new Error(`Submission ${index} did not return a submission_id.`);
  }

  return submissionId;
}

async function pollSubmission(submissionId: string, index: number): Promise<{ id: string; status: string }> {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= pollTimeoutMs) {
    const payload = await requestJson(`/api/submissions/${submissionId}`, {
      headers: studentHeaders(index),
    });

    const status = (payload as { submission?: { status?: string } }).submission?.status;
    if (!status) {
      throw new Error(`Submission ${submissionId} returned no status.`);
    }

    if (status !== "QUEUED" && status !== "RUNNING") {
      return { id: submissionId, status };
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(`Timed out waiting for submission ${submissionId}.`);
}

async function verifyFacultyView(problemId: string): Promise<void> {
  const payload = await requestJson(`/api/submissions?problemId=${encodeURIComponent(problemId)}`, {
    headers: facultyHeaders,
  });

  const items = (payload as { items?: Array<{ status?: string }> }).items ?? [];
  if (items.length < concurrentSubmissions) {
    throw new Error(`Expected at least ${concurrentSubmissions} stored submissions, found ${items.length}.`);
  }
}

async function main(): Promise<void> {
  console.log(`Starting queue load test against ${baseUrl}`);
  const problemId = await createProblem();
  console.log(`Created load-test problem ${problemId}`);

  const submissionIds = await Promise.all(
    Array.from({ length: concurrentSubmissions }, (_, index) => enqueueSubmission(problemId, index + 1)),
  );

  console.log(`Queued ${submissionIds.length} submissions. Polling for final states...`);

  const results = await Promise.all(
    submissionIds.map((submissionId, index) => pollSubmission(submissionId, index + 1)),
  );

  const nonAccepted = results.filter((result) => result.status !== "ACCEPTED");
  if (nonAccepted.length > 0) {
    throw new Error(`Some submissions did not finish as ACCEPTED: ${JSON.stringify(nonAccepted)}`);
  }

  await verifyFacultyView(problemId);
  console.log(`All ${results.length} submissions completed successfully and were persisted.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});

