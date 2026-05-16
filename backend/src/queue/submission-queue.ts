import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import { env } from "../config/env";

export interface SubmissionJobData {
  submissionId: string;
}

export interface SubmissionQueue {
  enqueue(submissionId: string): Promise<string>;
}

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  removeOnComplete: 500,
  removeOnFail: false,
  backoff: {
    type: "exponential",
    delay: 2_000,
  },
};

export function createRedisConnection(): ConnectionOptions {
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    db: env.REDIS_DB,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };
}

export class BullMQSubmissionQueue implements SubmissionQueue {
  private readonly queue = new Queue<SubmissionJobData>(env.SUBMISSION_QUEUE_NAME, {
    connection: createRedisConnection(),
    defaultJobOptions,
  });

  async enqueue(submissionId: string): Promise<string> {
    const job = await this.queue.add("submission.execute", { submissionId }, { jobId: submissionId });
    return String(job.id ?? submissionId);
  }
}
