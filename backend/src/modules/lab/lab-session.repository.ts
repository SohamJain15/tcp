import type { Collection } from "mongodb";

import { getMongoDatabase } from "../../config/mongodb";
import { toDate } from "../../shared/utils/date";
import { normalizeDepartment, normalizeNumber, normalizeRole } from "../../shared/utils/normalize";
import type { AssignedStudent, ClassTestAudienceFilter } from "../classtest/classtest.model";
import type { LabExperiment } from "./lab.model";
import type {
  LabSessionAttemptRecord,
  LabSessionExperimentState,
  LabSessionRecord,
} from "./lab-session.model";
// Reuse the lab experiment mapper indirectly by trusting stored shapes; sessions snapshot the same
// objects the lab repository already validated on write.

export interface LabSessionRepository {
  getById(sessionId: string): Promise<LabSessionRecord | null>;
  save(session: LabSessionRecord): Promise<LabSessionRecord>;
  list(): Promise<LabSessionRecord[]>;
}

export interface LabSessionAttemptRepository {
  getById(attemptId: string): Promise<LabSessionAttemptRecord | null>;
  getBySessionAndUser(sessionId: string, userEmail: string): Promise<LabSessionAttemptRecord | null>;
  listBySession(sessionId: string): Promise<LabSessionAttemptRecord[]>;
  save(attempt: LabSessionAttemptRecord): Promise<LabSessionAttemptRecord>;
  listActiveExpired(now: Date): Promise<LabSessionAttemptRecord[]>;
}

function mapNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function mapAssignedStudents(value: unknown): AssignedStudent[] {
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
      };
    })
    .filter((item): item is AssignedStudent => item !== null);
}

function mapAudience(value: unknown): ClassTestAudienceFilter {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    department: normalizeDepartment(record.department),
    division: mapNullableString(record.division),
    semester: typeof record.semester === "number" ? record.semester : null,
    rollFrom: typeof record.rollFrom === "number" ? record.rollFrom : null,
    rollTo: typeof record.rollTo === "number" ? record.rollTo : null,
  };
}

function mapSession(id: string, data: Record<string, unknown>): LabSessionRecord {
  return {
    id,
    labId: typeof data.labId === "string" ? data.labId : "",
    title: typeof data.title === "string" ? data.title : "",
    subject: typeof data.subject === "string" ? data.subject : "",
    kind: data.kind === "DBMS" ? "DBMS" : "DSA",
    // Experiments are stored exactly as the lab validator produced them, so they are read back as-is.
    experiments: Array.isArray(data.experiments) ? (data.experiments as LabExperiment[]) : [],
    startAt: toDate(data.startAt) ?? new Date(0),
    durationMinutes: normalizeNumber(data.durationMinutes, 30),
    audience: mapAudience(data.audience),
    assignedStudents: mapAssignedStudents(data.assignedStudents),
    maxViolations: normalizeNumber(data.maxViolations, 1),
    lifecycleState:
      data.lifecycleState === "Published" || data.lifecycleState === "Archived" ? data.lifecycleState : "Draft",
    resultsPublished: data.resultsPublished === true,
    createdBy: typeof data.createdBy === "string" ? data.createdBy : "",
    createdByRole: normalizeRole(data.createdByRole),
    managerEmails: Array.isArray(data.managerEmails)
      ? data.managerEmails.filter((item): item is string => typeof item === "string")
      : [],
    createdAt: toDate(data.createdAt) ?? new Date(0),
    updatedAt: toDate(data.updatedAt) ?? new Date(0),
  };
}

function mapExperimentState(value: unknown): LabSessionExperimentState | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.experimentId !== "string") {
    return null;
  }
  return {
    experimentId: record.experimentId,
    kind: record.kind === "coding" ? "coding" : "sql",
    awardedPoints: normalizeNumber(record.awardedPoints, 0),
    maxPoints: normalizeNumber(record.maxPoints, 0),
    submittedSql: mapNullableString(record.submittedSql),
    lastSubmissionId: mapNullableString(record.lastSubmissionId),
    passedCount: normalizeNumber(record.passedCount, 0),
    totalCount: normalizeNumber(record.totalCount, 0),
    finalSubmissionStatus: mapNullableString(record.finalSubmissionStatus),
    finalSubmissionLanguage: mapNullableString(record.finalSubmissionLanguage),
    draftCode: mapNullableString(record.draftCode),
    draftLanguage: mapNullableString(record.draftLanguage),
  };
}

function mapAttempt(id: string, data: Record<string, unknown>): LabSessionAttemptRecord {
  const status =
    data.status === "SUBMITTED" || data.status === "AUTO_SUBMITTED" ? data.status : "ACTIVE";
  return {
    id,
    sessionId: typeof data.sessionId === "string" ? data.sessionId : "",
    userEmail: typeof data.userEmail === "string" ? data.userEmail : "",
    userName: mapNullableString(data.userName),
    userUid: mapNullableString(data.userUid),
    userRollNumber: mapNullableString(data.userRollNumber),
    userDivision: mapNullableString(data.userDivision),
    userDepartment: normalizeDepartment(data.userDepartment),
    status,
    experimentStates: Array.isArray(data.experimentStates)
      ? data.experimentStates.map(mapExperimentState).filter((item): item is LabSessionExperimentState => item !== null)
      : [],
    autoScore: normalizeNumber(data.autoScore, 0),
    finalScore: normalizeNumber(data.finalScore, 0),
    gradingStatus: data.gradingStatus === "COMPLETE" ? "COMPLETE" : "PENDING",
    violationCount: normalizeNumber(data.violationCount, 0),
    suspectedMalpractice: data.suspectedMalpractice === true,
    startedAt: toDate(data.startedAt) ?? new Date(0),
    deadlineAt: toDate(data.deadlineAt) ?? new Date(0),
    submittedAt: toDate(data.submittedAt),
    autoSubmittedAt: toDate(data.autoSubmittedAt),
    timeTakenMs: typeof data.timeTakenMs === "number" ? data.timeTakenMs : null,
    createdAt: toDate(data.createdAt) ?? new Date(0),
    updatedAt: toDate(data.updatedAt) ?? new Date(0),
  };
}

async function getCollection(name: string): Promise<Collection> {
  const db = await getMongoDatabase();
  return db.collection(name);
}

export class MongoLabSessionRepository implements LabSessionRepository {
  async getById(sessionId: string): Promise<LabSessionRecord | null> {
    const document = await (await getCollection("lab_sessions")).findOne({ id: sessionId });
    return document ? mapSession(sessionId, document as Record<string, unknown>) : null;
  }

  async save(session: LabSessionRecord): Promise<LabSessionRecord> {
    await (await getCollection("lab_sessions")).updateOne({ id: session.id }, { $set: session }, { upsert: true });
    return session;
  }

  async list(): Promise<LabSessionRecord[]> {
    const documents = await (await getCollection("lab_sessions")).find({}).toArray();
    return documents.map((document) =>
      mapSession(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>),
    );
  }
}

export class MongoLabSessionAttemptRepository implements LabSessionAttemptRepository {
  async getById(attemptId: string): Promise<LabSessionAttemptRecord | null> {
    const document = await (await getCollection("lab_session_attempts")).findOne({ id: attemptId });
    return document ? mapAttempt(attemptId, document as Record<string, unknown>) : null;
  }

  async getBySessionAndUser(sessionId: string, userEmail: string): Promise<LabSessionAttemptRecord | null> {
    const document = await (await getCollection("lab_session_attempts")).findOne({ sessionId, userEmail });
    return document
      ? mapAttempt(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>)
      : null;
  }

  async listBySession(sessionId: string): Promise<LabSessionAttemptRecord[]> {
    const documents = await (await getCollection("lab_session_attempts")).find({ sessionId }).toArray();
    return documents.map((document) =>
      mapAttempt(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>),
    );
  }

  async save(attempt: LabSessionAttemptRecord): Promise<LabSessionAttemptRecord> {
    await (await getCollection("lab_session_attempts")).updateOne({ id: attempt.id }, { $set: attempt }, { upsert: true });
    return attempt;
  }

  async listActiveExpired(now: Date): Promise<LabSessionAttemptRecord[]> {
    const documents = await (await getCollection("lab_session_attempts"))
      .find({ status: "ACTIVE", deadlineAt: { $lte: now } })
      .toArray();
    return documents.map((document) =>
      mapAttempt(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>),
    );
  }
}
