import Redis from "ioredis";
import { env } from "../config/env";
import { closeMongoDatabase, getMongoDatabase } from "../config/mongodb";
import { FirestoreUserRepository } from "../modules/user/user.repository";
import { FirestoreSubmissionRepository } from "../modules/submission/submission.repository";
import { FirestoreLeaderboardRepository } from "../modules/leaderboard/leaderboard.repository";
import { syncUserAndLeaderboard } from "../modules/submission/submission.service";

export const LEGACY_LAB_COLLECTIONS = [
  "labs",
  "lab_sessions",
  "lab_session_attempts",
  "lab_sql_submissions",
  "lab_attendance_sessions",
  "lab_attendance_admissions",
] as const;
export const LEGACY_SUBMISSION_FILTER = { sourceType: "lab_coding" } as const;

async function reset() {
  const apply = process.argv.includes("--apply");
  const db = await getMongoDatabase();
  const submissions = await db
    .collection("submissions")
    .find(LEGACY_SUBMISSION_FILTER, { projection: { id: 1, userEmail: 1 } })
    .toArray();
  const counts = Object.fromEntries(
    await Promise.all(
      LEGACY_LAB_COLLECTIONS.map(async (name) => [
        name,
        await db.collection(name).countDocuments(),
      ]),
    ),
  );
  console.log(
    JSON.stringify(
      {
        database: db.databaseName,
        mode: apply ? "apply" : "preview",
        collections: counts,
        labCodingSubmissions: submissions.length,
      },
      null,
      2,
    ),
  );
  if (!apply) return;
  // A durable manifest allows statistics repair to resume even after the original submissions are gone.
  const manifest = db.collection<{
    id: string;
    submissionIds: string[];
    emails: string[];
    completedAt?: Date;
  }>("maintenance_legacy_labs");
  await manifest.updateOne(
    { id: "reset-v1" },
    {
      $addToSet: {
        submissionIds: { $each: submissions.map((s) => String(s.id)) },
        emails: { $each: submissions.map((s) => String(s.userEmail)) },
      },
    },
    { upsert: true },
  );
  const record = (await manifest.findOne({ id: "reset-v1" }))!;
  // Use the stable queue key layout directly: old development Redis installations cannot
  // initialize current BullMQ, and this migration must still be able to remove their old jobs.
  const redis = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    db: env.REDIS_DB,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    retryStrategy: () => null,
  });
  redis.on("error", () => {});
  try {
    const ids = new Set(record.submissionIds);
    const prefix = `bull:${env.SUBMISSION_QUEUE_NAME}:`;
    const active = await redis.lrange(`${prefix}active`, 0, -1);
    if (active.some((jobId) => ids.has(jobId)))
      throw new Error(
        "An old lab job is active. Stop the old workers and retry the reset.",
      );
    for (const submissionId of ids) {
      // Check and remove atomically so a worker cannot claim this job between the two steps.
      const removed = await redis.eval(
        `
        local active = redis.call('LRANGE', KEYS[1] .. 'active', 0, -1)
        for _, id in ipairs(active) do if id == ARGV[1] then return 0 end end
        for _, list in ipairs({'wait', 'paused'}) do redis.call('LREM', KEYS[1] .. list, 0, ARGV[1]) end
        for _, set in ipairs({'delayed', 'completed', 'failed', 'prioritized', 'waiting-children'}) do redis.call('ZREM', KEYS[1] .. set, ARGV[1]) end
        for _, suffix in ipairs({'', ':logs', ':dependencies', ':processed', ':failed', ':unsuccessful', ':lock'}) do redis.call('DEL', KEYS[1] .. ARGV[1] .. suffix) end
        return 1`,
        1,
        prefix,
        submissionId,
      );
      if (removed !== 1)
        throw new Error(
          "An old lab job became active. Stop old workers before retrying.",
        );
    }
    for (const name of LEGACY_LAB_COLLECTIONS)
      await db.collection(name).deleteMany({});
    await db.collection("submissions").deleteMany(LEGACY_SUBMISSION_FILTER);
    const dependencies = {
      userRepository: new FirestoreUserRepository(),
      submissionRepository: new FirestoreSubmissionRepository(),
      leaderboardRepository: new FirestoreLeaderboardRepository(),
    } as Parameters<typeof syncUserAndLeaderboard>[0];
    for (const email of record.emails)
      if (await dependencies.userRepository.getByEmail(email))
        await syncUserAndLeaderboard(dependencies, email, new Date());
    await manifest.updateOne(
      { id: "reset-v1" },
      { $set: { completedAt: new Date() } },
    );
    console.log(
      `Removed old lab data and reconciled ${record.emails.length} student aggregates. Classroom data was preserved.`,
    );
  } finally {
    redis.disconnect();
  }
}
if (require.main === module)
  reset()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : "Reset failed");
      process.exitCode = 1;
    })
    .finally(closeMongoDatabase);
