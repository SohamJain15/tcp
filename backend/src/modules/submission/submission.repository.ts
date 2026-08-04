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
import type { FailedTestCase, SubmissionRecord } from "./submission.model";
import type { SubmissionSourceType } from "./submission.model";

export interface SubmissionListFilters {
  userEmail?: string;
  /** Matches any of the given authors. Used to scope reads to a department roster. */
  userEmails?: string[];
  resourceOwnerEmail?: string;
  userDepartment?: Department;
  problemId?: string;
  contestId?: string;
  sourceType?: SubmissionSourceType;
  status?: SubmissionStatus;
  language?: SupportedLanguage;
  createdFrom?: Date;
  createdTo?: Date;
}

/**
 * A submission with the student's source code and program output removed.
 *
 * Aggregate/reporting paths (department participation views, dashboard statistics)
 * read through this type so that leaking a student's code from an aggregate endpoint
 * is a compile error rather than something a reviewer has to catch by eye.
 */
export type SubmissionAnalyticsRecord = Omit<SubmissionRecord, "code" | "stdout" | "stderr" | "failedTest">;

export interface SubmissionRepository {
  getById(submissionId: string): Promise<SubmissionRecord | null>;
  save(submission: SubmissionRecord): Promise<SubmissionRecord>;
  create(submission: SubmissionRecord): Promise<SubmissionRecord>;
  list(filters?: SubmissionListFilters): Promise<SubmissionRecord[]>;
  /** Same query as `list`, projected to exclude code/stdout/stderr. */
  listForAnalytics(filters?: SubmissionListFilters): Promise<SubmissionAnalyticsRecord[]>;
}

/** Absent on every submission judged before failing cases were captured, hence the null. */
function mapFailedTestCase(value: unknown): FailedTestCase | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = value as Record<string, unknown>;
  return {
    index: normalizeNumber(data.index, 0),
    isHidden: data.isHidden === true,
    status: normalizeSubmissionStatus(data.status),
    input: typeof data.input === "string" ? data.input : "",
    expectedOutput: typeof data.expectedOutput === "string" ? data.expectedOutput : "",
    actualOutput: typeof data.actualOutput === "string" ? data.actualOutput : "",
  };
}

function mapSubmissionRecord(submissionId: string, data: Record<string, unknown>): SubmissionRecord {
  const createdAt = toDate(data.createdAt) ?? new Date();
  const updatedAt = toDate(data.updatedAt) ?? createdAt;

  return {
    id: String(data.id ?? submissionId),
    queueJobId: typeof data.queueJobId === "string" ? data.queueJobId : null,
    judge0Token: typeof data.judge0Token === "string" ? data.judge0Token : null,
    sourceType:
      data.sourceType === "contest_coding" || data.sourceType === "classtest_coding"
        ? data.sourceType
        : "problem",
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
    classTestId: typeof data.classTestId === "string" ? data.classTestId : null,
    classTestQuestionId: typeof data.classTestQuestionId === "string" ? data.classTestQuestionId : null,
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
    failedTest: mapFailedTestCase(data.failedTest),
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
  if (filters.userEmails) filter.userEmail = { $in: filters.userEmails };
  if (filters.resourceOwnerEmail) filter.resourceOwnerEmail = filters.resourceOwnerEmail;
  if (filters.userDepartment) filter.userDepartment = filters.userDepartment;
  if (filters.problemId) filter.problemId = filters.problemId;
  if (filters.contestId) filter.contestId = filters.contestId;
  if (filters.sourceType) filter.sourceType = filters.sourceType;
  if (filters.status) filter.status = filters.status;
  if (filters.language) filter.language = filters.language;
  if (filters.createdFrom || filters.createdTo) {
    const range: Record<string, Date> = {};
    if (filters.createdFrom) range.$gte = filters.createdFrom;
    if (filters.createdTo) range.$lte = filters.createdTo;
    filter.createdAt = range;
  }
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

  async listForAnalytics(filters: SubmissionListFilters = {}): Promise<SubmissionAnalyticsRecord[]> {
    const collection = await getCollection();
    // Projected away at the database, so code never enters the process on this path.
    // `failedTest` joins the list for the same reason: it carries verbatim test-case data, which
    // no aggregate consumer needs and none of them should be able to re-emit.
    const documents = await collection
      .find(buildFilter(filters))
      .project({ code: 0, stdout: 0, stderr: 0, failedTest: 0 })
      .sort({ createdAt: -1 })
      .toArray();

    return documents.map((document) => {
      const data = document as Record<string, unknown>;
      const {
        code: _code,
        stdout: _stdout,
        stderr: _stderr,
        failedTest: _failedTest,
        ...rest
      } = mapSubmissionRecord(String(data.id ?? ""), data);
      return rest;
    });
  }
}
