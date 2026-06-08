import type { Collection } from "mongodb";
import { getMongoDatabase } from "../../config/mongodb";
import { toDate } from "../../shared/utils/date";
import { normalizeDepartment, normalizeNumber, normalizeRole } from "../../shared/utils/normalize";
import type { LeaderboardEntry } from "./leaderboard.model";

export interface LeaderboardRepository {
  getByEmail(email: string): Promise<LeaderboardEntry | null>;
  save(entry: LeaderboardEntry): Promise<LeaderboardEntry>;
  delete(email: string): Promise<void>;
  list(): Promise<LeaderboardEntry[]>;
}

function mapLeaderboardEntry(email: string, data: Record<string, unknown>): LeaderboardEntry {
  const createdAt = toDate(data.createdAt) ?? new Date();
  const updatedAt = toDate(data.updatedAt) ?? createdAt;
  const rating = normalizeNumber(data.rating ?? data.score, 0);

  return {
    email: String(data.email ?? email),
    role: normalizeRole(data.role),
    name: typeof data.name === "string" ? data.name : null,
    uid: typeof data.uid === "string" ? data.uid : null,
    department: normalizeDepartment(data.department),
    rating,
    score: rating,
    problemsSolved: normalizeNumber(data.problemsSolved, 0),
    submissionCount: normalizeNumber(data.submissionCount, 0),
    acceptedSubmissionCount: normalizeNumber(data.acceptedSubmissionCount, 0),
    accuracy: normalizeNumber(data.accuracy, 0),
    createdAt,
    updatedAt,
    lastAcceptedAt: toDate(data.lastAcceptedAt),
  };
}

async function getCollection(): Promise<Collection> {
  const db = await getMongoDatabase();
  return db.collection("leaderboard");
}

export class FirestoreLeaderboardRepository implements LeaderboardRepository {
  async getByEmail(email: string): Promise<LeaderboardEntry | null> {
    const collection = await getCollection();
    const document = await collection.findOne({ email });
    return document ? mapLeaderboardEntry(email, document as Record<string, unknown>) : null;
  }

  async save(entry: LeaderboardEntry): Promise<LeaderboardEntry> {
    const collection = await getCollection();
    await collection.updateOne(
      { email: entry.email },
      {
        $set: {
          ...entry,
          score: entry.rating,
        },
      },
      { upsert: true },
    );
    return entry;
  }

  async delete(email: string): Promise<void> {
    const collection = await getCollection();
    await collection.deleteOne({ email });
  }

  async list(): Promise<LeaderboardEntry[]> {
    const collection = await getCollection();
    const documents = await collection.find({}).toArray();
    return documents.map((document) => mapLeaderboardEntry(String((document as Record<string, unknown>).email ?? ""), document as Record<string, unknown>));
  }
}
