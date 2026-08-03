import { getMongoDatabase } from "../config/mongodb";
import { FirestoreSubmissionRepository } from "../modules/submission/submission.repository";
import { calculateUserAggregateSnapshot } from "../modules/submission/submission.service";

/**
 * Backfills `avgAcceptedRuntimeMs` / `avgAcceptedMemoryKb` for every existing user.
 *
 * These two fields feed the practice leaderboard's efficiency tie-break. They are normally
 * maintained by the submission pipeline, so anyone who has not submitted since the feature
 * shipped would read 0 and sink below every student who has — which would penalise exactly the
 * dormant-but-strong accounts. Run this once at deploy.
 *
 * It reuses `calculateUserAggregateSnapshot`, the same function the live pipeline uses, so there
 * is one definition of "efficiency" rather than a second that can drift.
 *
 * Idempotent: it recomputes from submission history and writes the result, so running it twice
 * produces the same values. Safe to re-run.
 *
 *   npm run backfill:efficiency
 */
async function backfillUserEfficiency(): Promise<void> {
  const db = await getMongoDatabase();
  const submissionRepository = new FirestoreSubmissionRepository();

  const users = await db.collection("users").find({}, { projection: { email: 1 } }).toArray();
  console.log(`Backfilling efficiency for ${users.length} user(s)...`);

  let updated = 0;
  let skipped = 0;

  for (const user of users) {
    const email = typeof user.email === "string" ? user.email : null;
    if (!email) {
      skipped += 1;
      continue;
    }

    const submissions = await submissionRepository.list({ userEmail: email });
    const { avgAcceptedRuntimeMs, avgAcceptedMemoryKb } = calculateUserAggregateSnapshot(submissions);

    await db
      .collection("users")
      .updateOne({ email }, { $set: { avgAcceptedRuntimeMs, avgAcceptedMemoryKb } });

    updated += 1;
    if (updated % 50 === 0) {
      console.log(`  ...${updated}/${users.length}`);
    }
  }

  console.log(`Done. Updated ${updated} user(s)${skipped > 0 ? `, skipped ${skipped} without an email` : ""}.`);
}

backfillUserEfficiency()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });
