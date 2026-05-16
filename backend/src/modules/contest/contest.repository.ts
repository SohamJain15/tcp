import type { Firestore } from "firebase-admin/firestore";
import { DEFAULT_PROBLEM_MEMORY_LIMIT_MB, DEFAULT_PROBLEM_TIME_LIMIT_SECONDS } from "../../shared/constants/domain";
import { toDate } from "../../shared/utils/date";
import {
  normalizeDepartment,
  normalizeDifficulty,
  normalizeNumber,
  normalizeRole,
  tryNormalizeSupportedLanguage,
} from "../../shared/utils/normalize";
import type {
  ContestAttemptRecord,
  ContestProctoringEventRecord,
  ContestQuestion,
  ContestQuestionAttemptState,
  ContestRecord,
  ContestTestCase,
} from "./contest.model";
import type { ExecutableLanguage } from "../../shared/types/domain";

export interface ContestRepository {
  getById(contestId: string): Promise<ContestRecord | null>;
  save(contest: ContestRecord): Promise<ContestRecord>;
  list(): Promise<ContestRecord[]>;
}

export interface ContestAttemptRepository {
  getById(attemptId: string): Promise<ContestAttemptRecord | null>;
  getByContestAndUser(contestId: string, userEmail: string): Promise<ContestAttemptRecord | null>;
  save(attempt: ContestAttemptRecord): Promise<ContestAttemptRecord>;
  listByContest(contestId: string): Promise<ContestAttemptRecord[]>;
}

export interface ContestProctoringRepository {
  create(event: ContestProctoringEventRecord): Promise<ContestProctoringEventRecord>;
  listByAttempt(attemptId: string): Promise<ContestProctoringEventRecord[]>;
}

function mapTestCase(value: unknown): ContestTestCase | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.input !== "string" || typeof record.output !== "string") {
    return null;
  }

  return {
    input: record.input,
    output: record.output,
    explanation: typeof record.explanation === "string" ? record.explanation : undefined,
  };
}

function mapTestCaseList(values: unknown): ContestTestCase[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.map(mapTestCase).filter((value): value is ContestTestCase => Boolean(value));
}

function normalizeLanguages(values: unknown): ExecutableLanguage[] {
  if (!Array.isArray(values)) {
    return ["cpp", "java", "python", "javascript"];
  }

  return values
    .map((value) => tryNormalizeSupportedLanguage(value))
    .filter((value): value is ExecutableLanguage => Boolean(value && value !== "react" && value !== "html" && value !== "css"));
}

function mapQuestion(value: unknown): ContestQuestion | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const base = {
    id: typeof record.id === "string" ? record.id : "",
    points: normalizeNumber(record.points, 0),
  };

  if (record.type === "MCQ") {
    return {
      ...base,
      type: "MCQ",
      statement: typeof record.statement === "string" ? record.statement : "",
      options: Array.isArray(record.options) ? record.options.map((option) => String(option)) : [],
      correctAnswer: typeof record.correctAnswer === "string" ? record.correctAnswer : "",
    };
  }

  if (record.type === "MSQ") {
    return {
      ...base,
      type: "MSQ",
      statement: typeof record.statement === "string" ? record.statement : "",
      options: Array.isArray(record.options) ? record.options.map((option) => String(option)) : [],
      correctAnswers: Array.isArray(record.correctAnswers) ? record.correctAnswers.map((answer) => String(answer)) : [],
    };
  }

  if (record.type === "Coding") {
    return {
      ...base,
      type: "Coding",
      problemTitle: typeof record.problemTitle === "string" ? record.problemTitle : "",
      difficulty: normalizeDifficulty(record.difficulty),
      problemStatement: typeof record.problemStatement === "string" ? record.problemStatement : "",
      constraints: typeof record.constraints === "string" ? record.constraints : "",
      inputFormat: typeof record.inputFormat === "string" ? record.inputFormat : "",
      outputFormat: typeof record.outputFormat === "string" ? record.outputFormat : "",
      timeLimitSeconds: normalizeNumber(record.timeLimitSeconds, DEFAULT_PROBLEM_TIME_LIMIT_SECONDS),
      memoryLimitMb: normalizeNumber(record.memoryLimitMb, DEFAULT_PROBLEM_MEMORY_LIMIT_MB),
      sampleTestCases: mapTestCaseList(record.sampleTestCases),
      hiddenTestCases: mapTestCaseList(record.hiddenTestCases),
      supportedLanguages: normalizeLanguages(record.supportedLanguages),
    };
  }

  return null;
}

function mapQuestionState(value: unknown): ContestQuestionAttemptState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.questionId !== "string" || typeof record.questionType !== "string") {
    return null;
  }

  return {
    questionId: record.questionId,
    questionType: record.questionType as ContestQuestionAttemptState["questionType"],
    status:
      record.status === "SOLVED"
        ? "SOLVED"
        : record.status === "ATTEMPTED"
          ? "ATTEMPTED"
          : "UNATTEMPTED",
    attemptsCount: normalizeNumber(record.attemptsCount, 0),
    awardedPoints: normalizeNumber(record.awardedPoints, 0),
    submittedAnswer:
      typeof record.submittedAnswer === "string"
        ? record.submittedAnswer
        : Array.isArray(record.submittedAnswer)
          ? record.submittedAnswer.map((value) => String(value))
          : null,
    isCorrect: typeof record.isCorrect === "boolean" ? record.isCorrect : null,
    lastSubmissionId: typeof record.lastSubmissionId === "string" ? record.lastSubmissionId : null,
    passedCount: normalizeNumber(record.passedCount, 0),
    totalCount: normalizeNumber(record.totalCount, 0),
    hasFinalCodingSubmission: Boolean(record.hasFinalCodingSubmission),
    finalSubmissionLanguage:
      typeof record.finalSubmissionLanguage === "string"
        ? (() => {
            const normalized = tryNormalizeSupportedLanguage(record.finalSubmissionLanguage);
            return normalized && normalized !== "react" && normalized !== "html" && normalized !== "css"
              ? normalized
              : null;
          })()
        : null,
    finalSubmissionStatus: typeof record.finalSubmissionStatus === "string" ? record.finalSubmissionStatus : null,
    finalRuntimeMs: normalizeNumber(record.finalRuntimeMs, 0),
    finalMemoryKb: normalizeNumber(record.finalMemoryKb, 0),
    solvedAt: toDate(record.solvedAt),
  };
}

function mapContestRecord(contestId: string, data: Record<string, unknown>): ContestRecord {
  const createdAt = toDate(data.createdAt) ?? new Date();
  const updatedAt = toDate(data.updatedAt) ?? createdAt;

  return {
    id: typeof data.id === "string" ? data.id : contestId,
    title: typeof data.title === "string" ? data.title : contestId,
    startAt: toDate(data.startAt) ?? createdAt,
    durationMinutes: normalizeNumber(data.durationMinutes ?? data.duration, 60),
    type: data.type === "Practice" ? "Practice" : "Rated",
    lifecycleState: "Published",
    resultsPublished: Boolean(data.resultsPublished),
    targetDepartment: normalizeDepartment(data.targetDepartment),
    maxViolations: normalizeNumber(data.maxViolations, 3),
    createdBy: typeof data.createdBy === "string" ? data.createdBy : "",
    createdByRole: normalizeRole(data.createdByRole),
    questions: Array.isArray(data.questions) ? data.questions.map(mapQuestion).filter((value): value is ContestQuestion => Boolean(value)) : [],
    createdAt,
    updatedAt,
  };
}

function mapContestAttemptRecord(attemptId: string, data: Record<string, unknown>): ContestAttemptRecord {
  const startedAt = toDate(data.startedAt) ?? new Date();
  const updatedAt = toDate(data.updatedAt) ?? startedAt;

  return {
    id: typeof data.id === "string" ? data.id : attemptId,
    contestId: typeof data.contestId === "string" ? data.contestId : "",
    contestTitleSnapshot: typeof data.contestTitleSnapshot === "string" ? data.contestTitleSnapshot : "",
    userEmail: typeof data.userEmail === "string" ? data.userEmail : "",
    userName: typeof data.userName === "string" ? data.userName : null,
    userUid: typeof data.userUid === "string" ? data.userUid : null,
    userDepartment: normalizeDepartment(data.userDepartment),
    status:
      data.status === "AUTO_SUBMITTED"
        ? "AUTO_SUBMITTED"
        : data.status === "SUBMITTED"
          ? "SUBMITTED"
          : data.status === "DISQUALIFIED"
            ? "DISQUALIFIED"
            : "ACTIVE",
    score: normalizeNumber(data.score, 0),
    violationCount: normalizeNumber(data.violationCount, 0),
    violationPenaltyPoints: normalizeNumber(data.violationPenaltyPoints, 0),
    timeTakenMs:
      data.timeTakenMs === null || data.timeTakenMs === undefined
        ? null
        : normalizeNumber(data.timeTakenMs, 0),
    questionStates: Array.isArray(data.questionStates)
      ? data.questionStates.map(mapQuestionState).filter((value): value is ContestQuestionAttemptState => Boolean(value))
      : [],
    startedAt,
    updatedAt,
    submittedAt: toDate(data.submittedAt),
    autoSubmittedAt: toDate(data.autoSubmittedAt),
    lastSolvedAt: toDate(data.lastSolvedAt),
  };
}

function mapProctoringEventRecord(eventId: string, data: Record<string, unknown>): ContestProctoringEventRecord {
  return {
    id: typeof data.id === "string" ? data.id : eventId,
    contestId: typeof data.contestId === "string" ? data.contestId : "",
    attemptId: typeof data.attemptId === "string" ? data.attemptId : "",
    userEmail: typeof data.userEmail === "string" ? data.userEmail : "",
    type: (data.type as ContestProctoringEventRecord["type"]) ?? "TAB_SWITCH",
    createdAt: toDate(data.createdAt) ?? new Date(),
    details: typeof data.details === "string" ? data.details : null,
  };
}

export class FirestoreContestRepository implements ContestRepository {
  constructor(private readonly firestore: Firestore) {}

  async getById(contestId: string): Promise<ContestRecord | null> {
    const snapshot = await this.firestore.collection("contests").doc(contestId).get();
    if (!snapshot.exists) {
      return null;
    }

    return mapContestRecord(contestId, snapshot.data() as Record<string, unknown>);
  }

  async save(contest: ContestRecord): Promise<ContestRecord> {
    await this.firestore.collection("contests").doc(contest.id).set(contest, { merge: true });
    return contest;
  }

  async list(): Promise<ContestRecord[]> {
    const snapshot = await this.firestore.collection("contests").get();
    return snapshot.docs.map((doc) => mapContestRecord(doc.id, doc.data() as Record<string, unknown>));
  }
}

export class FirestoreContestAttemptRepository implements ContestAttemptRepository {
  constructor(private readonly firestore: Firestore) {}

  async getById(attemptId: string): Promise<ContestAttemptRecord | null> {
    const snapshot = await this.firestore.collection("contestAttempts").doc(attemptId).get();
    if (!snapshot.exists) {
      return null;
    }

    return mapContestAttemptRecord(attemptId, snapshot.data() as Record<string, unknown>);
  }

  async getByContestAndUser(contestId: string, userEmail: string): Promise<ContestAttemptRecord | null> {
    const snapshot = await this.firestore
      .collection("contestAttempts")
      .where("contestId", "==", contestId)
      .where("userEmail", "==", userEmail)
      .limit(1)
      .get();

    const doc = snapshot.docs[0];
    return doc ? mapContestAttemptRecord(doc.id, doc.data() as Record<string, unknown>) : null;
  }

  async save(attempt: ContestAttemptRecord): Promise<ContestAttemptRecord> {
    await this.firestore.collection("contestAttempts").doc(attempt.id).set(attempt, { merge: true });
    return attempt;
  }

  async listByContest(contestId: string): Promise<ContestAttemptRecord[]> {
    const snapshot = await this.firestore.collection("contestAttempts").where("contestId", "==", contestId).get();
    return snapshot.docs.map((doc) => mapContestAttemptRecord(doc.id, doc.data() as Record<string, unknown>));
  }
}

export class FirestoreContestProctoringRepository implements ContestProctoringRepository {
  constructor(private readonly firestore: Firestore) {}

  async create(event: ContestProctoringEventRecord): Promise<ContestProctoringEventRecord> {
    await this.firestore.collection("contestProctoringEvents").doc(event.id).set(event);
    return event;
  }

  async listByAttempt(attemptId: string): Promise<ContestProctoringEventRecord[]> {
    const snapshot = await this.firestore
      .collection("contestProctoringEvents")
      .where("attemptId", "==", attemptId)
      .get();
    return snapshot.docs.map((doc) => mapProctoringEventRecord(doc.id, doc.data() as Record<string, unknown>));
  }
}
