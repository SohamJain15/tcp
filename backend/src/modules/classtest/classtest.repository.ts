import type { Collection } from "mongodb";
import { getMongoDatabase } from "../../config/mongodb";
import type { HarnessSpec } from "../../execution/harness/contract";
import { DEFAULT_PROBLEM_MEMORY_LIMIT_MB, DEFAULT_PROBLEM_TIME_LIMIT_SECONDS } from "../../shared/constants/domain";
import type { ExecutableLanguage } from "../../shared/types/domain";
import { toDate } from "../../shared/utils/date";
import {
  normalizeDepartment,
  normalizeDifficulty,
  normalizeNumber,
  normalizeRole,
  tryNormalizeSupportedLanguage,
} from "../../shared/utils/normalize";
import type {
  AssignedStudent,
  ClassTestAttemptRecord,
  ClassTestAudienceFilter,
  ClassTestGradingStatus,
  ClassTestProctoringEventRecord,
  ClassTestQuestion,
  ClassTestQuestionAttemptState,
  ClassTestRecord,
  ClassTestTestCase,
} from "./classtest.model";

export interface ClassTestRepository {
  getById(classTestId: string): Promise<ClassTestRecord | null>;
  save(test: ClassTestRecord): Promise<ClassTestRecord>;
  list(): Promise<ClassTestRecord[]>;
}

export interface ClassTestAttemptRepository {
  getById(attemptId: string): Promise<ClassTestAttemptRecord | null>;
  getByTestAndUser(classTestId: string, userEmail: string): Promise<ClassTestAttemptRecord | null>;
  listByTest(classTestId: string): Promise<ClassTestAttemptRecord[]>;
  save(attempt: ClassTestAttemptRecord): Promise<ClassTestAttemptRecord>;
  /** ACTIVE attempts past the shared deadline — used by the background finaliser. */
  listActiveExpired(now: Date): Promise<ClassTestAttemptRecord[]>;
}

export interface ClassTestProctoringRepository {
  create(event: ClassTestProctoringEventRecord): Promise<ClassTestProctoringEventRecord>;
  listByAttempt(attemptId: string): Promise<ClassTestProctoringEventRecord[]>;
}

// --- document mapping --------------------------------------------------------
// Every field is read defensively: a document written by an older build must never
// crash a request, and a missing value must never silently widen who can sit a test.

function mapStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function mapNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mapNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function mapTestCase(value: unknown): ClassTestTestCase | null {
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

function mapTestCaseList(values: unknown): ClassTestTestCase[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.map(mapTestCase).filter((item): item is ClassTestTestCase => item !== null);
}

function mapLanguages(value: unknown): ExecutableLanguage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? tryNormalizeSupportedLanguage(item) : null))
    .filter((item): item is ExecutableLanguage => Boolean(item));
}

function mapQuestion(value: unknown): ClassTestQuestion | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  if (!id) {
    return null;
  }
  const points = normalizeNumber(record.points, 0);
  const setLabel = typeof record.setLabel === "string" ? record.setLabel : undefined;

  switch (record.type) {
    case "MCQ":
      return {
        id,
        type: "MCQ",
        points,
        setLabel,
        statement: typeof record.statement === "string" ? record.statement : "",
        options: mapStringArray(record.options),
        correctAnswer: typeof record.correctAnswer === "string" ? record.correctAnswer : "",
      };
    case "MSQ":
      return {
        id,
        type: "MSQ",
        points,
        setLabel,
        statement: typeof record.statement === "string" ? record.statement : "",
        options: mapStringArray(record.options),
        correctAnswers: mapStringArray(record.correctAnswers),
      };
    case "ShortAnswer":
      return {
        id,
        type: "ShortAnswer",
        points,
        setLabel,
        statement: typeof record.statement === "string" ? record.statement : "",
        expectedSentences: mapNullableNumber(record.expectedSentences) ?? undefined,
        modelAnswer: typeof record.modelAnswer === "string" ? record.modelAnswer : undefined,
      };
    case "Coding": {
      const languages = mapLanguages(record.supportedLanguages);
      return {
        id,
        type: "Coding",
        points,
        setLabel,
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
        // Kept exactly as stored. The validator guarantees a non-empty list on write, so an
        // empty one here means corrupt data — and then every submission is refused, which is a
        // loud, obvious failure rather than silently letting any language through.
        supportedLanguages: languages,
        harness: (record.harness as HarnessSpec | undefined) ?? undefined,
      };
    }
    default:
      return null;
  }
}

function mapAssignedStudent(value: unknown): AssignedStudent | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.email !== "string" || record.email.trim().length === 0) {
    return null;
  }
  return {
    email: record.email,
    name: mapNullableString(record.name),
    uid: mapNullableString(record.uid),
    rollNumber: mapNullableString(record.rollNumber),
    division: mapNullableString(record.division),
  };
}

function mapAudience(value: unknown): ClassTestAudienceFilter {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    department: normalizeDepartment(record.department),
    division: mapNullableString(record.division),
    semester: mapNullableNumber(record.semester),
    rollFrom: mapNullableNumber(record.rollFrom),
    rollTo: mapNullableNumber(record.rollTo),
  };
}

function mapClassTestRecord(id: string, data: Record<string, unknown>): ClassTestRecord {
  return {
    id,
    title: typeof data.title === "string" ? data.title : "",
    subject: typeof data.subject === "string" ? data.subject : "",
    instructions: mapNullableString(data.instructions),
    createdBy: typeof data.createdBy === "string" ? data.createdBy : "",
    createdByRole: normalizeRole(data.createdByRole),
    managerEmails: mapStringArray(data.managerEmails),
    startAt: toDate(data.startAt) ?? new Date(0),
    durationMinutes: normalizeNumber(data.durationMinutes, 5),
    audience: mapAudience(data.audience),
    assignedStudents: Array.isArray(data.assignedStudents)
      ? data.assignedStudents.map(mapAssignedStudent).filter((item): item is AssignedStudent => item !== null)
      : [],
    // Default 1: the first tab-switch ends the test unless faculty widened it.
    maxViolations: normalizeNumber(data.maxViolations, 1),
    questions: Array.isArray(data.questions)
      ? data.questions.map(mapQuestion).filter((item): item is ClassTestQuestion => item !== null)
      : [],
    lifecycleState:
      data.lifecycleState === "Published" || data.lifecycleState === "Archived" ? data.lifecycleState : "Draft",
    resultsPublished: data.resultsPublished === true,
    createdAt: toDate(data.createdAt) ?? new Date(0),
    updatedAt: toDate(data.updatedAt) ?? new Date(0),
  };
}

function mapQuestionState(value: unknown): ClassTestQuestionAttemptState | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.questionId !== "string") {
    return null;
  }
  const answer = record.submittedAnswer;
  return {
    questionId: record.questionId,
    questionType: (record.questionType as ClassTestQuestionAttemptState["questionType"]) ?? "MCQ",
    submittedAnswer:
      typeof answer === "string" || Array.isArray(answer) ? (answer as string | string[]) : null,
    awardedPoints: normalizeNumber(record.awardedPoints, 0),
    maxPoints: normalizeNumber(record.maxPoints, 0),
    lastSubmissionId: mapNullableString(record.lastSubmissionId),
    finalSubmissionLanguage: mapNullableString(record.finalSubmissionLanguage),
    finalSubmissionStatus: mapNullableString(record.finalSubmissionStatus),
    passedCount: normalizeNumber(record.passedCount, 0),
    totalCount: normalizeNumber(record.totalCount, 0),
    draftCode: mapNullableString(record.draftCode),
    draftLanguage: mapNullableString(record.draftLanguage),
    gradedBy: mapNullableString(record.gradedBy),
    gradedAt: toDate(record.gradedAt),
    graderNote: mapNullableString(record.graderNote),
  };
}

function mapAttemptRecord(id: string, data: Record<string, unknown>): ClassTestAttemptRecord {
  const gradingStatus = data.gradingStatus;
  return {
    id,
    classTestId: typeof data.classTestId === "string" ? data.classTestId : "",
    userEmail: typeof data.userEmail === "string" ? data.userEmail : "",
    userName: mapNullableString(data.userName),
    userUid: mapNullableString(data.userUid),
    userRollNumber: mapNullableString(data.userRollNumber),
    userDivision: mapNullableString(data.userDivision),
    userDepartment: normalizeDepartment(data.userDepartment),
    status:
      data.status === "SUBMITTED" || data.status === "AUTO_SUBMITTED" ? data.status : "ACTIVE",
    questionStates: Array.isArray(data.questionStates)
      ? data.questionStates
          .map(mapQuestionState)
          .filter((item): item is ClassTestQuestionAttemptState => item !== null)
      : [],
    autoScore: normalizeNumber(data.autoScore, 0),
    manualScore: normalizeNumber(data.manualScore, 0),
    finalScore: normalizeNumber(data.finalScore, 0),
    gradingStatus:
      gradingStatus === "PARTIAL" || gradingStatus === "COMPLETE"
        ? (gradingStatus as ClassTestGradingStatus)
        : "PENDING",
    violationCount: normalizeNumber(data.violationCount, 0),
    suspectedMalpractice: data.suspectedMalpractice === true,
    startedAt: toDate(data.startedAt) ?? new Date(0),
    deadlineAt: toDate(data.deadlineAt) ?? new Date(0),
    submittedAt: toDate(data.submittedAt),
    autoSubmittedAt: toDate(data.autoSubmittedAt),
    timeTakenMs: mapNullableNumber(data.timeTakenMs),
    createdAt: toDate(data.createdAt) ?? new Date(0),
    updatedAt: toDate(data.updatedAt) ?? new Date(0),
  };
}

async function getCollection(name: string): Promise<Collection> {
  const db = await getMongoDatabase();
  return db.collection(name);
}

export class MongoClassTestRepository implements ClassTestRepository {
  async getById(classTestId: string): Promise<ClassTestRecord | null> {
    const document = await (await getCollection("class_tests")).findOne({ id: classTestId });
    return document ? mapClassTestRecord(classTestId, document as Record<string, unknown>) : null;
  }

  async save(test: ClassTestRecord): Promise<ClassTestRecord> {
    await (await getCollection("class_tests")).updateOne({ id: test.id }, { $set: test }, { upsert: true });
    return test;
  }

  async list(): Promise<ClassTestRecord[]> {
    const documents = await (await getCollection("class_tests")).find({}).toArray();
    return documents.map((document) =>
      mapClassTestRecord(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>),
    );
  }
}

export class MongoClassTestAttemptRepository implements ClassTestAttemptRepository {
  async getById(attemptId: string): Promise<ClassTestAttemptRecord | null> {
    const document = await (await getCollection("class_test_attempts")).findOne({ id: attemptId });
    return document ? mapAttemptRecord(attemptId, document as Record<string, unknown>) : null;
  }

  async getByTestAndUser(classTestId: string, userEmail: string): Promise<ClassTestAttemptRecord | null> {
    const document = await (await getCollection("class_test_attempts")).findOne({ classTestId, userEmail });
    return document
      ? mapAttemptRecord(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>)
      : null;
  }

  async listByTest(classTestId: string): Promise<ClassTestAttemptRecord[]> {
    const documents = await (await getCollection("class_test_attempts")).find({ classTestId }).toArray();
    return documents.map((document) =>
      mapAttemptRecord(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>),
    );
  }

  async save(attempt: ClassTestAttemptRecord): Promise<ClassTestAttemptRecord> {
    await (await getCollection("class_test_attempts")).updateOne(
      { id: attempt.id },
      { $set: attempt },
      { upsert: true },
    );
    return attempt;
  }

  async listActiveExpired(now: Date): Promise<ClassTestAttemptRecord[]> {
    const documents = await (await getCollection("class_test_attempts"))
      .find({ status: "ACTIVE", deadlineAt: { $lte: now } })
      .toArray();
    return documents.map((document) =>
      mapAttemptRecord(String((document as Record<string, unknown>).id ?? ""), document as Record<string, unknown>),
    );
  }
}

export class MongoClassTestProctoringRepository implements ClassTestProctoringRepository {
  async create(event: ClassTestProctoringEventRecord): Promise<ClassTestProctoringEventRecord> {
    await (await getCollection("class_test_proctoring_events")).insertOne({ ...event });
    return event;
  }

  async listByAttempt(attemptId: string): Promise<ClassTestProctoringEventRecord[]> {
    const documents = await (await getCollection("class_test_proctoring_events")).find({ attemptId }).toArray();
    return documents.map((document) => {
      const record = document as Record<string, unknown>;
      return {
        id: String(record.id ?? ""),
        classTestId: String(record.classTestId ?? ""),
        attemptId: String(record.attemptId ?? ""),
        userEmail: String(record.userEmail ?? ""),
        type: String(record.type ?? ""),
        createdAt: toDate(record.createdAt) ?? new Date(0),
      };
    });
  }
}
