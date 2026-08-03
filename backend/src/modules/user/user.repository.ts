import type { Collection } from "mongodb";
import { getMongoDatabase } from "../../config/mongodb";
import type { UserRole } from "../../shared/types/auth";
import type { Department } from "../../shared/types/domain";
import { toDate } from "../../shared/utils/date";
import { normalizeDepartment, normalizeNumber, normalizeRole } from "../../shared/utils/normalize";
import type { UserRecord } from "./user.model";

export type UserRecordUpdate = Partial<Omit<UserRecord, "email" | "createdAt">>;

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  getByEmail(email: string): Promise<UserRecord | null>;
  /**
   * Every user in a department, optionally narrowed to one role. The department
   * participation view needs the full roster as its denominator — the leaderboard
   * only contains students who have already submitted, so it would silently drop
   * the non-participants an HOD most needs to see.
   */
  listByDepartment(department: Department, role?: UserRole): Promise<UserRecord[]>;
  update(email: string, updates: UserRecordUpdate): Promise<UserRecord>;
  save(user: UserRecord): Promise<UserRecord>;
  deleteByEmail(email: string): Promise<void>;
}

function mapUserRecord(email: string, data: Record<string, unknown>): UserRecord {
  const createdAt = toDate(data.createdAt) ?? new Date();
  const updatedAt = toDate(data.updatedAt) ?? createdAt;
  const rating = normalizeNumber(data.rating ?? data.score, 0);
  const submissionCount = normalizeNumber(data.submissionCount, 0);
  const acceptedSubmissionCount = normalizeNumber(data.acceptedSubmissionCount, 0);
  const derivedAccuracy = submissionCount > 0 ? Math.round((acceptedSubmissionCount / submissionCount) * 10000) / 100 : 0;

  return {
    email: String(data.email ?? email),
    role: normalizeRole(data.role),
    name: typeof data.name === "string" ? data.name : null,
    uid: typeof data.uid === "string" ? data.uid : null,
    isProfileComplete: Boolean(data.isProfileComplete),
    designation: typeof data.designation === "string" ? data.designation : null,
    // Absent on every pre-existing document, so default to false — no migration needed.
    isHod: data.isHod === true,
    rollNumber: typeof data.rollNumber === "string" ? data.rollNumber : null,
    department: normalizeDepartment(data.department),
    semester: typeof data.semester === "number" ? data.semester : null,
    linkedInUrl: typeof data.linkedInUrl === "string" ? data.linkedInUrl : null,
    githubUrl: typeof data.githubUrl === "string" ? data.githubUrl : null,
    skills: Array.isArray(data.skills) ? data.skills.filter((skill): skill is string => typeof skill === "string") : [],
    rating,
    score: rating,
    problemsSolved: normalizeNumber(data.problemsSolved, 0),
    submissionCount,
    acceptedSubmissionCount,
    accuracy: normalizeNumber(data.accuracy, derivedAccuracy),
    // Absent on documents written before efficiency ranking existed; the backfill script fills
    // them in, and 0 means "no measured code" rather than "perfectly efficient".
    avgAcceptedRuntimeMs: normalizeNumber(data.avgAcceptedRuntimeMs, 0),
    avgAcceptedMemoryKb: normalizeNumber(data.avgAcceptedMemoryKb, 0),
    createdAt,
    updatedAt,
    lastLoginAt: toDate(data.lastLoginAt),
    lastAcceptedAt: toDate(data.lastAcceptedAt),
  };
}

function toUserDocument(user: UserRecord): Record<string, unknown> {
  return {
    ...user,
    score: user.rating,
  };
}

async function getCollection(): Promise<Collection> {
  const db = await getMongoDatabase();
  return db.collection("users");
}

export class FirestoreUserRepository implements UserRepository {
  async findByEmail(email: string): Promise<UserRecord | null> {
    const collection = await getCollection();
    const document = await collection.findOne({ email });
    return document ? mapUserRecord(email, document as Record<string, unknown>) : null;
  }

  async getByEmail(email: string): Promise<UserRecord | null> {
    return this.findByEmail(email);
  }

  async listByDepartment(department: Department, role?: UserRole): Promise<UserRecord[]> {
    const collection = await getCollection();
    const filter: Record<string, unknown> = { department };
    if (role) {
      filter.role = role;
    }

    const documents = await collection.find(filter).toArray();
    return documents.map((document) => {
      const data = document as Record<string, unknown>;
      return mapUserRecord(String(data.email ?? ""), data);
    });
  }

  async update(email: string, updates: UserRecordUpdate): Promise<UserRecord> {
    const existingUser = await this.findByEmail(email);
    if (!existingUser) {
      throw new Error(`User not found for update: ${email}`);
    }

    const updatedUser: UserRecord = {
      ...existingUser,
      ...updates,
      email: existingUser.email,
      createdAt: existingUser.createdAt,
    };

    const collection = await getCollection();
    await collection.updateOne({ email }, { $set: toUserDocument(updatedUser) }, { upsert: true });
    return updatedUser;
  }

  async save(user: UserRecord): Promise<UserRecord> {
    const collection = await getCollection();
    await collection.updateOne({ email: user.email }, { $set: toUserDocument(user) }, { upsert: true });
    return user;
  }

  async deleteByEmail(email: string): Promise<void> {
    const collection = await getCollection();
    await collection.deleteOne({ email });
  }
}
