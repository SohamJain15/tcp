import type { Collection } from "mongodb";

import { getMongoDatabase } from "../../config/mongodb";
import type { Department } from "../../shared/types/domain";
import { toDate } from "../../shared/utils/date";
import { normalizeDepartment, normalizeRole } from "../../shared/utils/normalize";
import type { StudentYear } from "../../shared/utils/student-year";
import type { AssignedStudent, ClassTestAudienceFilter } from "../classtest/classtest.model";
import type {
  LabAdmissionRecord,
  LabAdmissionStatus,
  LabAttendanceGates,
  LabAttendanceSessionRecord,
  LabAttendanceSessionState,
} from "./lab-attendance.model";

export interface LabAttendanceSessionRepository {
  getById(sessionId: string): Promise<LabAttendanceSessionRecord | null>;
  /**
   * The one live session for a lab. Hit by every student read and write on that lab, so it stays a
   * single indexed lookup.
   */
  findOpenByLab(labId: string, now: Date): Promise<LabAttendanceSessionRecord | null>;
  /** The live session this student is rostered on, across every lab. Powers the student poll. */
  findOpenForStudent(email: string, now: Date): Promise<LabAttendanceSessionRecord | null>;
  listByOwner(email: string): Promise<LabAttendanceSessionRecord[]>;
  save(session: LabAttendanceSessionRecord): Promise<LabAttendanceSessionRecord>;
}

export interface LabAdmissionRepository {
  getById(admissionId: string): Promise<LabAdmissionRecord | null>;
  getBySessionAndUser(sessionId: string, userEmail: string): Promise<LabAdmissionRecord | null>;
  listBySession(sessionId: string): Promise<LabAdmissionRecord[]>;
  save(record: LabAdmissionRecord): Promise<LabAdmissionRecord>;
}

// --- defensive document mapping ----------------------------------------------

function mapNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function mapAudienceYear(value: unknown): StudentYear | null {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : null;
}

function mapAudience(value: unknown): ClassTestAudienceFilter {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    department: normalizeDepartment(record.department),
    division: mapNullableString(record.division),
    semester: typeof record.semester === "number" ? record.semester : null,
    year: mapAudienceYear(record.year),
    rollFrom: typeof record.rollFrom === "number" ? record.rollFrom : null,
    rollTo: typeof record.rollTo === "number" ? record.rollTo : null,
  };
}

function mapRoster(value: unknown): AssignedStudent[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item): AssignedStudent | null => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      if (typeof record.email !== "string" || record.email.trim() === "") {
        return null;
      }
      return {
        email: record.email,
        name: mapNullableString(record.name),
        uid: mapNullableString(record.uid),
        rollNumber: mapNullableString(record.rollNumber),
        division: mapNullableString(record.division),
      } as AssignedStudent;
    })
    .filter((item): item is AssignedStudent => item !== null);
}

function mapGates(value: unknown): LabAttendanceGates {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    // Fails closed: an unreadable gates object still requires the teacher to admit.
    requireAdmission: record.requireAdmission !== false,
    requireNetworkMatch: record.requireNetworkMatch === true,
    requireJoinCode: record.requireJoinCode === true,
  };
}

function mapAdmissionStatus(value: unknown): LabAdmissionStatus {
  return value === "ADMITTED" || value === "DENIED" || value === "REVOKED" ? value : "PENDING";
}

function mapState(value: unknown): LabAttendanceSessionState {
  return value === "CLOSED" ? "CLOSED" : "OPEN";
}

function mapSession(id: string, data: Record<string, unknown>): LabAttendanceSessionRecord {
  const openedAt = toDate(data.openedAt) ?? new Date(0);
  return {
    id,
    labId: typeof data.labId === "string" ? data.labId : "",
    labTitle: typeof data.labTitle === "string" ? data.labTitle : "",
    subject: typeof data.subject === "string" ? data.subject : "",
    batchLabel: mapNullableString(data.batchLabel),
    audience: mapAudience(data.audience),
    roster: mapRoster(data.roster),
    gates: mapGates(data.gates),
    joinCodeSecret: typeof data.joinCodeSecret === "string" ? data.joinCodeSecret : "",
    hostIp: mapNullableString(data.hostIp),
    hostIpCidr: mapNullableString(data.hostIpCidr),
    state: mapState(data.state),
    openedBy: typeof data.openedBy === "string" ? data.openedBy : "",
    openedByRole: normalizeRole(data.openedByRole),
    managerEmails: Array.isArray(data.managerEmails)
      ? data.managerEmails.filter((item): item is string => typeof item === "string")
      : [],
    openedAt,
    closedAt: toDate(data.closedAt),
    // A stored document without an expiry is treated as already expired rather than eternal.
    expiresAt: toDate(data.expiresAt) ?? openedAt,
    createdAt: toDate(data.createdAt) ?? openedAt,
    updatedAt: toDate(data.updatedAt) ?? openedAt,
  };
}

function mapAdmission(id: string, data: Record<string, unknown>): LabAdmissionRecord {
  const requestedAt = toDate(data.requestedAt) ?? new Date(0);
  return {
    id,
    sessionId: typeof data.sessionId === "string" ? data.sessionId : "",
    labId: typeof data.labId === "string" ? data.labId : "",
    userEmail: typeof data.userEmail === "string" ? data.userEmail : "",
    userName: mapNullableString(data.userName),
    userUid: mapNullableString(data.userUid),
    userRollNumber: mapNullableString(data.userRollNumber),
    userDivision: mapNullableString(data.userDivision),
    userDepartment: normalizeDepartment(data.userDepartment) as Department | null,
    status: mapAdmissionStatus(data.status),
    requestedAt,
    decidedAt: toDate(data.decidedAt),
    decidedBy: mapNullableString(data.decidedBy),
    requestIp: mapNullableString(data.requestIp),
    lastSeenIp: mapNullableString(data.lastSeenIp),
    denialReason: mapNullableString(data.denialReason),
    createdAt: toDate(data.createdAt) ?? requestedAt,
    updatedAt: toDate(data.updatedAt) ?? requestedAt,
  };
}

async function getCollection(name: string): Promise<Collection> {
  const db = await getMongoDatabase();
  return db.collection(name);
}

const SESSIONS = "lab_attendance_sessions";
const ADMISSIONS = "lab_attendance_admissions";

export class MongoLabAttendanceSessionRepository implements LabAttendanceSessionRepository {
  async getById(sessionId: string): Promise<LabAttendanceSessionRecord | null> {
    const document = await (await getCollection(SESSIONS)).findOne({ id: sessionId });
    return document ? mapSession(sessionId, document as Record<string, unknown>) : null;
  }

  async findOpenByLab(labId: string, now: Date): Promise<LabAttendanceSessionRecord | null> {
    const document = await (await getCollection(SESSIONS)).findOne({
      labId,
      state: "OPEN",
      expiresAt: { $gt: now },
    });
    return document
      ? mapSession(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>)
      : null;
  }

  async findOpenForStudent(email: string, now: Date): Promise<LabAttendanceSessionRecord | null> {
    // Roster emails are lowercased on write, so this exact match is safe.
    const document = await (await getCollection(SESSIONS)).findOne({
      state: "OPEN",
      expiresAt: { $gt: now },
      "roster.email": email.trim().toLowerCase(),
    });
    return document
      ? mapSession(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>)
      : null;
  }

  async listByOwner(email: string): Promise<LabAttendanceSessionRecord[]> {
    const documents = await (await getCollection(SESSIONS))
      .find({ $or: [{ openedBy: email }, { managerEmails: email }] })
      .sort({ openedAt: -1 })
      .toArray();
    return documents.map((document) =>
      mapSession(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>),
    );
  }

  async save(session: LabAttendanceSessionRecord): Promise<LabAttendanceSessionRecord> {
    await (await getCollection(SESSIONS)).updateOne({ id: session.id }, { $set: { ...session } }, { upsert: true });
    return session;
  }
}

export class MongoLabAdmissionRepository implements LabAdmissionRepository {
  async getById(admissionId: string): Promise<LabAdmissionRecord | null> {
    const document = await (await getCollection(ADMISSIONS)).findOne({ id: admissionId });
    return document ? mapAdmission(admissionId, document as Record<string, unknown>) : null;
  }

  async getBySessionAndUser(sessionId: string, userEmail: string): Promise<LabAdmissionRecord | null> {
    const document = await (await getCollection(ADMISSIONS)).findOne({
      sessionId,
      userEmail: userEmail.trim().toLowerCase(),
    });
    return document
      ? mapAdmission(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>)
      : null;
  }

  async listBySession(sessionId: string): Promise<LabAdmissionRecord[]> {
    const documents = await (await getCollection(ADMISSIONS)).find({ sessionId }).sort({ requestedAt: 1 }).toArray();
    return documents.map((document) =>
      mapAdmission(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>),
    );
  }

  async save(record: LabAdmissionRecord): Promise<LabAdmissionRecord> {
    await (await getCollection(ADMISSIONS)).updateOne({ id: record.id }, { $set: { ...record } }, { upsert: true });
    return record;
  }
}
