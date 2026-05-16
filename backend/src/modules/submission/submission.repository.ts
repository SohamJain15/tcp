import type { Firestore } from "firebase-admin/firestore";
import { env } from "../../config/env";
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

export class FirestoreSubmissionRepository implements SubmissionRepository {
  constructor(private readonly firestore: Firestore) {}

  async getById(submissionId: string): Promise<SubmissionRecord | null> {
    const snapshot = await this.firestore.collection("submissions").doc(submissionId).get();
    if (!snapshot.exists) {
      return null;
    }

    return mapSubmissionRecord(submissionId, snapshot.data() as Record<string, unknown>);
  }

  async save(submission: SubmissionRecord): Promise<SubmissionRecord> {
    await this.firestore.collection("submissions").doc(submission.id).set(submission, { merge: true });
    return submission;
  }

  async create(submission: SubmissionRecord): Promise<SubmissionRecord> {
    await this.firestore.collection("submissions").doc(submission.id).set(submission);
    return submission;
  }

  async list(filters: SubmissionListFilters = {}): Promise<SubmissionRecord[]> {
    const snapshot = await this.firestore.collection("submissions").get();
    return snapshot.docs
      .map((doc) => mapSubmissionRecord(doc.id, doc.data() as Record<string, unknown>))
      .filter((submission) => (filters.userEmail ? submission.userEmail === filters.userEmail : true))
      .filter((submission) => (filters.resourceOwnerEmail ? submission.resourceOwnerEmail === filters.resourceOwnerEmail : true))
      .filter((submission) => (filters.userDepartment ? submission.userDepartment === filters.userDepartment : true))
      .filter((submission) => (filters.problemId ? submission.problemId === filters.problemId : true))
      .filter((submission) => (filters.contestId ? submission.contestId === filters.contestId : true))
      .filter((submission) => (filters.sourceType ? submission.sourceType === filters.sourceType : true))
      .filter((submission) => (filters.status ? submission.status === filters.status : true))
      .filter((submission) => (filters.language ? submission.language === filters.language : true))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }
}
