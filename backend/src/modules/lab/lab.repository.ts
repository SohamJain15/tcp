import type { Collection } from "mongodb";

import { getMongoDatabase } from "../../config/mongodb";
import type { HarnessSpec } from "../../execution/harness/contract";
import { DEFAULT_PROBLEM_MEMORY_LIMIT_MB, DEFAULT_PROBLEM_TIME_LIMIT_SECONDS } from "../../shared/constants/domain";
import type { ExecutableLanguage } from "../../shared/types/domain";
import { toDate } from "../../shared/utils/date";
import { normalizeDepartment, normalizeDifficulty, normalizeNumber, normalizeRole, tryNormalizeSupportedLanguage } from "../../shared/utils/normalize";
import type { LabExperiment, LabRecord, LabSqlSubmissionRecord, LabTestCase } from "./lab.model";

export interface LabRepository {
  getById(labId: string): Promise<LabRecord | null>;
  save(lab: LabRecord): Promise<LabRecord>;
  list(): Promise<LabRecord[]>;
}

export interface LabSqlSubmissionRepository {
  getByExperimentAndUser(labId: string, experimentId: string, userEmail: string): Promise<LabSqlSubmissionRecord | null>;
  listByLabAndUser(labId: string, userEmail: string): Promise<LabSqlSubmissionRecord[]>;
  save(record: LabSqlSubmissionRecord): Promise<LabSqlSubmissionRecord>;
}

// --- defensive document mapping ---------------------------------------------

function mapStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function mapNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function mapNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mapTestCases(value: unknown): LabTestCase[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item): LabTestCase | null => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      if (typeof record.input !== "string" || typeof record.output !== "string") {
        return null;
      }
      return {
        input: record.input,
        output: record.output,
        explanation: typeof record.explanation === "string" ? record.explanation : undefined,
      };
    })
    .filter((item): item is LabTestCase => item !== null);
}

function mapLanguages(value: unknown): ExecutableLanguage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? tryNormalizeSupportedLanguage(item) : null))
    .filter((item): item is ExecutableLanguage => Boolean(item));
}

function mapExperiment(value: unknown): LabExperiment | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  if (!id) {
    return null;
  }
  const base = {
    id,
    number: normalizeNumber(record.number, 1),
    title: typeof record.title === "string" ? record.title : "",
    aim: typeof record.aim === "string" ? record.aim : "",
    points: normalizeNumber(record.points, 0),
  };

  if (record.kind === "sql") {
    return {
      ...base,
      kind: "sql",
      schemaSql: typeof record.schemaSql === "string" ? record.schemaSql : "",
      solutionSql: typeof record.solutionSql === "string" ? record.solutionSql : "",
      ordered: record.ordered === true,
    };
  }

  if (record.kind === "coding") {
    return {
      ...base,
      kind: "coding",
      difficulty: normalizeDifficulty(record.difficulty),
      constraints: typeof record.constraints === "string" ? record.constraints : "",
      inputFormat: typeof record.inputFormat === "string" ? record.inputFormat : "",
      outputFormat: typeof record.outputFormat === "string" ? record.outputFormat : "",
      timeLimitSeconds: normalizeNumber(record.timeLimitSeconds, DEFAULT_PROBLEM_TIME_LIMIT_SECONDS),
      memoryLimitMb: normalizeNumber(record.memoryLimitMb, DEFAULT_PROBLEM_MEMORY_LIMIT_MB),
      sampleTestCases: mapTestCases(record.sampleTestCases),
      hiddenTestCases: mapTestCases(record.hiddenTestCases),
      supportedLanguages: mapLanguages(record.supportedLanguages),
      harness: (record.harness as HarnessSpec | undefined) ?? undefined,
    };
  }

  return null;
}

function mapLabRecord(id: string, data: Record<string, unknown>): LabRecord {
  return {
    id,
    title: typeof data.title === "string" ? data.title : "",
    subject: typeof data.subject === "string" ? data.subject : "",
    kind: data.kind === "DBMS" ? "DBMS" : "DSA",
    department: normalizeDepartment(data.department),
    semester: mapNullableNumber(data.semester),
    description: mapNullableString(data.description),
    lifecycleState:
      data.lifecycleState === "Published" || data.lifecycleState === "Archived" ? data.lifecycleState : "Draft",
    experiments: Array.isArray(data.experiments)
      ? data.experiments.map(mapExperiment).filter((item): item is LabExperiment => item !== null)
      : [],
    createdBy: typeof data.createdBy === "string" ? data.createdBy : "",
    createdByRole: normalizeRole(data.createdByRole),
    managerEmails: mapStringArray(data.managerEmails),
    createdAt: toDate(data.createdAt) ?? new Date(0),
    updatedAt: toDate(data.updatedAt) ?? new Date(0),
  };
}

function mapSqlSubmission(id: string, data: Record<string, unknown>): LabSqlSubmissionRecord {
  return {
    id,
    labId: typeof data.labId === "string" ? data.labId : "",
    experimentId: typeof data.experimentId === "string" ? data.experimentId : "",
    userEmail: typeof data.userEmail === "string" ? data.userEmail : "",
    userName: mapNullableString(data.userName),
    userUid: mapNullableString(data.userUid),
    userDepartment: normalizeDepartment(data.userDepartment),
    studentSql: typeof data.studentSql === "string" ? data.studentSql : "",
    status: typeof data.status === "string" ? data.status : "",
    passed: data.passed === true,
    awardedPoints: normalizeNumber(data.awardedPoints, 0),
    runtimeMs: normalizeNumber(data.runtimeMs, 0),
    createdAt: toDate(data.createdAt) ?? new Date(0),
    updatedAt: toDate(data.updatedAt) ?? new Date(0),
  };
}

async function getCollection(name: string): Promise<Collection> {
  const db = await getMongoDatabase();
  return db.collection(name);
}

export class MongoLabRepository implements LabRepository {
  async getById(labId: string): Promise<LabRecord | null> {
    const document = await (await getCollection("labs")).findOne({ id: labId });
    return document ? mapLabRecord(labId, document as Record<string, unknown>) : null;
  }

  async save(lab: LabRecord): Promise<LabRecord> {
    await (await getCollection("labs")).updateOne({ id: lab.id }, { $set: lab }, { upsert: true });
    return lab;
  }

  async list(): Promise<LabRecord[]> {
    const documents = await (await getCollection("labs")).find({}).toArray();
    return documents.map((document) =>
      mapLabRecord(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>),
    );
  }
}

export class MongoLabSqlSubmissionRepository implements LabSqlSubmissionRepository {
  async getByExperimentAndUser(
    labId: string,
    experimentId: string,
    userEmail: string,
  ): Promise<LabSqlSubmissionRecord | null> {
    const document = await (await getCollection("lab_sql_submissions")).findOne({ labId, experimentId, userEmail });
    return document
      ? mapSqlSubmission(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>)
      : null;
  }

  async listByLabAndUser(labId: string, userEmail: string): Promise<LabSqlSubmissionRecord[]> {
    const documents = await (await getCollection("lab_sql_submissions")).find({ labId, userEmail }).toArray();
    return documents.map((document) =>
      mapSqlSubmission(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>),
    );
  }

  async save(record: LabSqlSubmissionRecord): Promise<LabSqlSubmissionRecord> {
    await (await getCollection("lab_sql_submissions")).updateOne({ id: record.id }, { $set: record }, { upsert: true });
    return record;
  }
}
