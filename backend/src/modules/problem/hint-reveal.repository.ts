import type { Collection } from "mongodb";
import { getMongoDatabase } from "../../config/mongodb";
import { toDate } from "../../shared/utils/date";
import { normalizeNumber } from "../../shared/utils/normalize";

/**
 * How many hints one student has unlocked on one problem.
 *
 * A separate collection rather than a map on the user document: this grows with
 * students × problems, and a per-user map would rewrite the whole user record on every reveal.
 * Keeping it separate also leaves an auditable per-reveal timestamp, which faculty asking
 * "did they solve this unaided?" actually need.
 */
export interface HintRevealRecord {
  userEmail: string;
  problemId: string;
  revealedCount: number;
  firstRevealedAt: Date;
  lastRevealedAt: Date;
}

export interface HintRevealRepository {
  get(userEmail: string, problemId: string): Promise<HintRevealRecord | null>;
  save(record: HintRevealRecord): Promise<HintRevealRecord>;
}

async function getCollection(): Promise<Collection> {
  const db = await getMongoDatabase();
  return db.collection("problem_hint_reveals");
}

function mapRecord(data: Record<string, unknown>): HintRevealRecord {
  const lastRevealedAt = toDate(data.lastRevealedAt) ?? new Date();

  return {
    userEmail: String(data.userEmail ?? ""),
    problemId: String(data.problemId ?? ""),
    revealedCount: normalizeNumber(data.revealedCount, 0),
    firstRevealedAt: toDate(data.firstRevealedAt) ?? lastRevealedAt,
    lastRevealedAt,
  };
}

export class MongoHintRevealRepository implements HintRevealRepository {
  async get(userEmail: string, problemId: string): Promise<HintRevealRecord | null> {
    const collection = await getCollection();
    const document = await collection.findOne({ userEmail, problemId });
    return document ? mapRecord(document as Record<string, unknown>) : null;
  }

  async save(record: HintRevealRecord): Promise<HintRevealRecord> {
    const collection = await getCollection();
    await collection.updateOne(
      { userEmail: record.userEmail, problemId: record.problemId },
      { $set: record },
      { upsert: true },
    );
    return record;
  }
}
