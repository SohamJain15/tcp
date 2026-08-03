import { getMongoDatabase } from "../config/mongodb";
import { FirestoreLeaderboardRepository } from "../modules/leaderboard/leaderboard.repository";
import { FirestoreSubmissionRepository } from "../modules/submission/submission.repository";
import { syncUserAndLeaderboard } from "../modules/submission/submission.service";
import { FirestoreUserRepository } from "../modules/user/user.repository";

/**
 * Backfills `avgAcceptedRuntimeMs` / `avgAcceptedMemoryKb` for every existing user.
 *
 * These feed the practice leaderboard's efficiency tie-break. They are normally maintained by
 * the submission pipeline, so anyone who has not submitted since the feature shipped reads 0 and
 * sinks below every student who has — penalising exactly the dormant-but-strong accounts. Run
 * once at deploy.
 *
 * It calls `syncUserAndLeaderboard`, the same function the live submission path uses. That
 * matters: the board reads a separate `leaderboard` collection, not `users`, so a script that
 * updated only the user record would appear to do nothing at all.
 *
 * Idempotent — it recomputes from submission history, so running it twice yields the same
 * values.
 *
 *   npm run backfill:efficiency
 */
async function backfillUserEfficiency(): Promise<void> {
  const db = await getMongoDatabase();

  // Only the four repositories `syncUserAndLeaderboard` actually touches; the rest of the
  // submission service's dependencies are irrelevant here and are left unset on purpose.
  const dependencies = {
    userRepository: new FirestoreUserRepository(),
    submissionRepository: new FirestoreSubmissionRepository(),
    leaderboardRepository: new FirestoreLeaderboardRepository(),
  } as unknown as Parameters<typeof syncUserAndLeaderboard>[0];

  const users = await db.collection("users").find({}, { projection: { email: 1 } }).toArray();
  console.log(`Backfilling efficiency for ${users.length} user(s)...`);

  const now = new Date();
  let updated = 0;
  const failures: string[] = [];

  for (const user of users) {
    const email = typeof user.email === "string" ? user.email : null;
    if (!email) {
      continue;
    }

    try {
      await syncUserAndLeaderboard(dependencies, email, now);
      updated += 1;
      if (updated % 50 === 0) {
        console.log(`  ...${updated}/${users.length}`);
      }
    } catch (error) {
      // One bad record must not abort the whole run — report it and carry on.
      failures.push(`${email}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`Done. Updated ${updated} user(s).`);
  if (failures.length > 0) {
    console.warn(`${failures.length} user(s) failed:`);
    failures.forEach((failure) => console.warn(`  ${failure}`));
  }
}

backfillUserEfficiency()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });
