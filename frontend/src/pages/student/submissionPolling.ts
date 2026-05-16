import type { Submission, SubmissionStatus } from "@/api/types";

const ACTIVE_STATUSES = new Set<SubmissionStatus>(["QUEUED", "RUNNING"]);

export interface PollSubmissionOptions {
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onUpdate?: (submission: Submission) => void;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Polling aborted", "AbortError"));
      return;
    }

    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Polling aborted", "AbortError"));
    };

    signal?.addEventListener("abort", onAbort);
  });
}

export function isSubmissionPending(status: SubmissionStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

export async function pollSubmissionUntilComplete(
  submissionId: string,
  getSubmission: (submissionId: string) => Promise<Submission>,
  options: PollSubmissionOptions = {},
): Promise<Submission> {
  const intervalMs = options.intervalMs ?? 1_500;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    if (options.signal?.aborted) {
      throw new DOMException("Polling aborted", "AbortError");
    }

    const submission = await getSubmission(submissionId);
    options.onUpdate?.(submission);
    if (!isSubmissionPending(submission.status)) {
      return submission;
    }

    await sleep(intervalMs, options.signal);
  }

  throw new Error(`Timed out while waiting for submission ${submissionId}.`);
}
