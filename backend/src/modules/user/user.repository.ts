import type { Firestore } from "firebase-admin/firestore";
import { toDate } from "../../shared/utils/date";
import { normalizeDepartment, normalizeNumber, normalizeRole } from "../../shared/utils/normalize";
import type { UserRecord } from "./user.model";

export type UserRecordUpdate = Partial<Omit<UserRecord, "email" | "createdAt">>;

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  getByEmail(email: string): Promise<UserRecord | null>;
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
  const derivedAccuracy =
    submissionCount > 0 ? Math.round((acceptedSubmissionCount / submissionCount) * 10000) / 100 : 0;

  return {
    email: String(data.email ?? email),
    role: normalizeRole(data.role),
    name: typeof data.name === "string" ? data.name : null,
    uid: typeof data.uid === "string" ? data.uid : null,
    isProfileComplete: Boolean(data.isProfileComplete),
    designation: typeof data.designation === "string" ? data.designation : null,
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
    createdAt,
    updatedAt,
    lastLoginAt: toDate(data.lastLoginAt),
    lastAcceptedAt: toDate(data.lastAcceptedAt),
  };
}

function toFirestoreUser(user: UserRecord): Record<string, unknown> {
  return {
    ...user,
    score: user.rating,
  };
}

export class FirestoreUserRepository implements UserRepository {
  constructor(private readonly firestore: Firestore) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const snapshot = await this.firestore.collection("users").doc(email).get();
    if (!snapshot.exists) {
      return null;
    }

    return mapUserRecord(email, snapshot.data() as Record<string, unknown>);
  }

  async getByEmail(email: string): Promise<UserRecord | null> {
    return this.findByEmail(email);
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

    await this.firestore.collection("users").doc(email).set(toFirestoreUser(updatedUser), { merge: true });
    return updatedUser;
  }

  async save(user: UserRecord): Promise<UserRecord> {
    await this.firestore.collection("users").doc(user.email).set(toFirestoreUser(user), { merge: true });
    return user;
  }

  async deleteByEmail(email: string): Promise<void> {
    await this.firestore.collection("users").doc(email).delete();
  }
}
