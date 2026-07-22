import type { Collection } from "mongodb";
import { DEFAULT_PROBLEM_MEMORY_LIMIT_MB, DEFAULT_PROBLEM_TIME_LIMIT_SECONDS } from "../../shared/constants/domain";
import { getMongoDatabase } from "../../config/mongodb";
import { toDate } from "../../shared/utils/date";
import {
  normalizeDepartment,
  normalizeDifficulty,
  normalizeNumber,
  normalizeRole,
  tryNormalizeSupportedLanguage,
} from "../../shared/utils/normalize";
import type { ExecutableLanguage } from "../../shared/types/domain";
import type {
  ContestAttemptRecord,
  ContestProctoringEventRecord,
  ContestQuestion,
  ContestQuestionAttemptState,
  ContestRecord,
  ContestRegistrationRecord,
  ContestTestCase,
} from "./contest.model";

export interface ContestRepository {
  getById(contestId: string): Promise<ContestRecord | null>;
  save(contest: ContestRecord): Promise<ContestRecord>;
  list(): Promise<ContestRecord[]>;
}

export interface ContestRegistrationRepository {
  getByContestAndUser(contestId: string, userEmail: string): Promise<ContestRegistrationRecord | null>;
  listByContest(contestId: string): Promise<ContestRegistrationRecord[]>;
  save(registration: ContestRegistrationRecord): Promise<ContestRegistrationRecord>;
  delete(contestId: string, userEmail: string): Promise<void>;
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
  return { input: record.input, output: record.output, explanation: typeof record.explanation === "string" ? record.explanation : undefined };
}

function mapTestCaseList(values: unknown): ContestTestCase[] {
  if (!Array.isArray(values)) return [];
  return values.map(mapTestCase).filter((value): value is ContestTestCase => Boolean(value));
}

function normalizeLanguages(values: unknown): ExecutableLanguage[] {
  if (!Array.isArray(values)) return ["cpp", "java", "python", "javascript"];
  return values
    .map((value) => tryNormalizeSupportedLanguage(value))
    .filter((value): value is ExecutableLanguage => Boolean(value && value !== "react" && value !== "html" && value !== "css"));
}

function mapQuestion(value: unknown): ContestQuestion | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const base = { id: typeof record.id === "string" ? record.id : "", points: normalizeNumber(record.points, 0) };
  if (record.type === "MCQ") {
    return { ...base, type: "MCQ", statement: typeof record.statement === "string" ? record.statement : "", options: Array.isArray(record.options) ? record.options.map((option) => String(option)) : [], correctAnswer: typeof record.correctAnswer === "string" ? record.correctAnswer : "" };
  }
  if (record.type === "MSQ") {
    return { ...base, type: "MSQ", statement: typeof record.statement === "string" ? record.statement : "", options: Array.isArray(record.options) ? record.options.map((option) => String(option)) : [], correctAnswers: Array.isArray(record.correctAnswers) ? record.correctAnswers.map((answer) => String(answer)) : [] };
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
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.questionId !== "string" || typeof record.questionType !== "string") return null;
  return {
    questionId: record.questionId,
    questionType: record.questionType as ContestQuestionAttemptState["questionType"],
    status: record.status === "SOLVED" ? "SOLVED" : record.status === "ATTEMPTED" ? "ATTEMPTED" : "UNATTEMPTED",
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
            return normalized && normalized !== "react" && normalized !== "html" && normalized !== "css" ? normalized : null;
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
  const startAt = toDate(data.startAt) ?? createdAt;
  const durationMinutes = normalizeNumber(data.durationMinutes ?? data.duration, 60);
  // Contests authored before the start/end window existed only had a duration: their window is
  // exactly one duration long and registration was implicitly open until the contest started.
  const endAt = toDate(data.endAt) ?? new Date(startAt.getTime() + durationMinutes * 60_000);
  return {
    id: typeof data.id === "string" ? data.id : contestId,
    title: typeof data.title === "string" ? data.title : contestId,
    startAt,
    endAt,
    durationMinutes,
    registrationOpenAt: toDate(data.registrationOpenAt) ?? createdAt,
    registrationCloseAt: toDate(data.registrationCloseAt) ?? startAt,
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
    timeTakenMs: data.timeTakenMs === null || data.timeTakenMs === undefined ? null : normalizeNumber(data.timeTakenMs, 0),
    questionStates: Array.isArray(data.questionStates) ? data.questionStates.map(mapQuestionState).filter((value): value is ContestQuestionAttemptState => Boolean(value)) : [],
    startedAt,
    // Attempts predating per-attempt deadlines fall back to the contest duration from their start.
    deadlineAt:
      toDate(data.deadlineAt) ??
      new Date(startedAt.getTime() + normalizeNumber(data.durationMinutes, 60) * 60_000),
    updatedAt,
    submittedAt: toDate(data.submittedAt),
    autoSubmittedAt: toDate(data.autoSubmittedAt),
    lastSolvedAt: toDate(data.lastSolvedAt),
  };
}

function mapContestRegistrationRecord(
  registrationId: string,
  data: Record<string, unknown>,
): ContestRegistrationRecord {
  return {
    id: typeof data.id === "string" ? data.id : registrationId,
    contestId: typeof data.contestId === "string" ? data.contestId : "",
    userEmail: typeof data.userEmail === "string" ? data.userEmail : "",
    userName: typeof data.userName === "string" ? data.userName : null,
    userUid: typeof data.userUid === "string" ? data.userUid : null,
    userDepartment: normalizeDepartment(data.userDepartment),
    registeredAt: toDate(data.registeredAt) ?? new Date(),
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

async function getCollection(name: string): Promise<Collection> {
  const db = await getMongoDatabase();
  return db.collection(name);
}

export class FirestoreContestRepository implements ContestRepository {
  async getById(contestId: string): Promise<ContestRecord | null> {
    const document = await (await getCollection("contests")).findOne({ id: contestId });
    return document ? mapContestRecord(contestId, document as Record<string, unknown>) : null;
  }
  async save(contest: ContestRecord): Promise<ContestRecord> {
    await (await getCollection("contests")).updateOne({ id: contest.id }, { $set: contest }, { upsert: true });
    return contest;
  }
  async list(): Promise<ContestRecord[]> {
    const documents = await (await getCollection("contests")).find({}).toArray();
    return documents.map((document) => mapContestRecord(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>));
  }
}

export class FirestoreContestRegistrationRepository implements ContestRegistrationRepository {
  async getByContestAndUser(contestId: string, userEmail: string): Promise<ContestRegistrationRecord | null> {
    const document = await (await getCollection("contest_registrations")).findOne({ contestId, userEmail });
    return document
      ? mapContestRegistrationRecord(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>)
      : null;
  }
  async listByContest(contestId: string): Promise<ContestRegistrationRecord[]> {
    const documents = await (await getCollection("contest_registrations")).find({ contestId }).toArray();
    return documents.map((document) =>
      mapContestRegistrationRecord(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>),
    );
  }
  async save(registration: ContestRegistrationRecord): Promise<ContestRegistrationRecord> {
    await (await getCollection("contest_registrations")).updateOne(
      { contestId: registration.contestId, userEmail: registration.userEmail },
      { $set: registration },
      { upsert: true },
    );
    return registration;
  }
  async delete(contestId: string, userEmail: string): Promise<void> {
    await (await getCollection("contest_registrations")).deleteOne({ contestId, userEmail });
  }
}

export class FirestoreContestAttemptRepository implements ContestAttemptRepository {
  async getById(attemptId: string): Promise<ContestAttemptRecord | null> {
    const document = await (await getCollection("contest_attempts")).findOne({ id: attemptId });
    return document ? mapContestAttemptRecord(attemptId, document as Record<string, unknown>) : null;
  }
  async getByContestAndUser(contestId: string, userEmail: string): Promise<ContestAttemptRecord | null> {
    const document = await (await getCollection("contest_attempts")).findOne({ contestId, userEmail });
    return document ? mapContestAttemptRecord(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>) : null;
  }
  async save(attempt: ContestAttemptRecord): Promise<ContestAttemptRecord> {
    await (await getCollection("contest_attempts")).updateOne({ id: attempt.id }, { $set: attempt }, { upsert: true });
    return attempt;
  }
  async listByContest(contestId: string): Promise<ContestAttemptRecord[]> {
    const documents = await (await getCollection("contest_attempts")).find({ contestId }).toArray();
    return documents.map((document) => mapContestAttemptRecord(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>));
  }
}

export class FirestoreContestProctoringRepository implements ContestProctoringRepository {
  async create(event: ContestProctoringEventRecord): Promise<ContestProctoringEventRecord> {
    await (await getCollection("proctoring_events")).insertOne(event);
    return event;
  }
  async listByAttempt(attemptId: string): Promise<ContestProctoringEventRecord[]> {
    const documents = await (await getCollection("proctoring_events")).find({ attemptId }).toArray();
    return documents.map((document) => mapProctoringEventRecord(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>));
  }
}
