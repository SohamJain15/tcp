import type { Collection, Filter } from "mongodb";
import { env } from "../../config/env";
import { getMongoDatabase } from "../../config/mongodb";
import type { Department, SubmissionStatus, SupportedLanguage } from "../../shared/types/domain";
import { toDate } from "../../shared/utils/date";
import {
  normalizeDepartment,
  normalizeDifficulty,
  normalizeExecutableLanguage,
  normalizeNumber,
  normalizeRole,
  normalizeSubmissionStatus,
} from "../../shared/utils/normalize";
import type { SubmissionRecord } from "./submission.model";
import type { SubmissionSourceType } from "./submission.model";

export interface SubmissionListFilters {
  userEmail?: string;
  resourceOwnerEmail?: string;
  userDepartment?: Department;
  problemId?: string;
  contestId?: string;
  sourceType?: SubmissionSourceType;
  status?: SubmissionStatus;
  language?: SupportedLanguage;
}

export interface SubmissionRepository {
  getById(submissionId: string): Promise<SubmissionRecord | null>;
  save(submission: SubmissionRecord): Promise<SubmissionRecord>;
  create(submission: SubmissionRecord): Promise<SubmissionRecord>;
  list(filters?: SubmissionListFilters): Promise<SubmissionRecord[]>;
}

function mapSubmissionRecord(submissionId: string, data: Record<string, unknown>): SubmissionRecord {
  const createdAt = toDate(data.createdAt) ?? new Date();
  const updatedAt = toDate(data.updatedAt) ?? createdAt;

  return {
    id: String(data.id ?? submissionId),
    queueJobId: typeof data.queueJobId === "string" ? data.queueJobId : null,
    judge0Token: typeof data.judge0Token === "string" ? data.judge0Token : null,
    sourceType: data.sourceType === "contest_coding" ? "contest_coding" : "problem",
    userEmail: String(data.userEmail ?? ""),
    userRole: normalizeRole(data.userRole),
    userDepartment: normalizeDepartment(data.userDepartment),
    resourceOwnerEmail: typeof data.resourceOwnerEmail === "string" ? data.resourceOwnerEmail : "",
    resourceTargetDepartment: normalizeDepartment(data.resourceTargetDepartment),
    problemId: String(data.problemId ?? ""),
    problemTitleSnapshot: typeof data.problemTitleSnapshot === "string" ? data.problemTitleSnapshot : String(data.problemTitle ?? ""),
    problemDifficultySnapshot: normalizeDifficulty(data.problemDifficultySnapshot ?? data.problemDifficulty),
    contestId: typeof data.contestId === "string" ? data.contestId : null,
    contestTitleSnapshot: typeof data.contestTitleSnapshot === "string" ? data.contestTitleSnapshot : null,
    contestQuestionId: typeof data.contestQuestionId === "string" ? data.contestQuestionId : null,
    code: typeof data.code === "string" ? data.code : "",
    language: normalizeExecutableLanguage(data.language),
    status: normalizeSubmissionStatus(data.status),
    runtimeMs: normalizeNumber(data.runtimeMs ?? data.executionTime, 0),
    memoryKb: normalizeNumber(data.memoryKb, 0),
    passedCount: normalizeNumber(data.passedCount ?? data.testCasesPassed, 0),
    totalCount: normalizeNumber(data.totalCount ?? data.totalTestCases, 0),
    executionProvider: typeof data.executionProvider === "string" ? data.executionProvider : env.EXECUTION_PROVIDER,
    ratingAwarded: normalizeNumber(data.ratingAwarded, 0),
    stdout: typeof data.stdout === "string" ? data.stdout : null,
    stderr: typeof data.stderr === "string" ? data.stderr : null,
    createdAt,
    updatedAt,
    judgedAt: toDate(data.judgedAt),
    finalizationAppliedAt: toDate(data.finalizationAppliedAt),
  };
}

function toSubmissionDocument(submission: SubmissionRecord): Record<string, unknown> {
  return {
    ...submission,
  };
}

async function getCollection(): Promise<Collection> {
  const db = await getMongoDatabase();
  return db.collection("submissions");
}

function buildFilter(filters: SubmissionListFilters): Filter<Record<string, unknown>> {
  const filter: Filter<Record<string, unknown>> = {};
  if (filters.userEmail) filter.userEmail = filters.userEmail;
  if (filters.resourceOwnerEmail) filter.resourceOwnerEmail = filters.resourceOwnerEmail;
  if (filters.userDepartment) filter.userDepartment = filters.userDepartment;
  if (filters.problemId) filter.problemId = filters.problemId;
  if (filters.contestId) filter.contestId = filters.contestId;
  if (filters.sourceType) filter.sourceType = filters.sourceType;
  if (filters.status) filter.status = filters.status;
  if (filters.language) filter.language = filters.language;
  return filter;
}

export class FirestoreSubmissionRepository implements SubmissionRepository {
  async getById(submissionId: string): Promise<SubmissionRecord | null> {
    const collection = await getCollection();
    const document = await collection.findOne({ id: submissionId });
    return document ? mapSubmissionRecord(submissionId, document as Record<string, unknown>) : null;
  }

  async save(submission: SubmissionRecord): Promise<SubmissionRecord> {
    const collection = await getCollection();
    await collection.updateOne({ id: submission.id }, { $set: toSubmissionDocument(submission) }, { upsert: true });
    return submission;
  }

  async create(submission: SubmissionRecord): Promise<SubmissionRecord> {
    const collection = await getCollection();
    await collection.insertOne(toSubmissionDocument(submission));
    return submission;
  }

  async list(filters: SubmissionListFilters = {}): Promise<SubmissionRecord[]> {
    const collection = await getCollection();
    const documents = await collection.find(buildFilter(filters)).sort({ createdAt: -1 }).toArray();
    return documents.map((document) => mapSubmissionRecord(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>));
  }
}
