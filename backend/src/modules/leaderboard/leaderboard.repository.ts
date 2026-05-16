import type { Firestore } from "firebase-admin/firestore";
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

export class FirestoreLeaderboardRepository implements LeaderboardRepository {
  constructor(private readonly firestore: Firestore) {}

  async getByEmail(email: string): Promise<LeaderboardEntry | null> {
    const snapshot = await this.firestore.collection("leaderboard").doc(email).get();
    if (!snapshot.exists) {
      return null;
    }

    return mapLeaderboardEntry(email, snapshot.data() as Record<string, unknown>);
  }

  async save(entry: LeaderboardEntry): Promise<LeaderboardEntry> {
    await this.firestore.collection("leaderboard").doc(entry.email).set(
      {
        ...entry,
        score: entry.rating,
      },
      { merge: true },
    );
    return entry;
  }

  async delete(email: string): Promise<void> {
    await this.firestore.collection("leaderboard").doc(email).delete();
  }

  async list(): Promise<LeaderboardEntry[]> {
    const snapshot = await this.firestore.collection("leaderboard").get();
    return snapshot.docs.map((doc) => mapLeaderboardEntry(doc.id, doc.data() as Record<string, unknown>));
  }
}
