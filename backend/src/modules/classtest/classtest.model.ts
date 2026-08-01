import type { HarnessSpec } from "../../execution/harness/contract";
import type { UserRole } from "../../shared/types/auth";
import type { Department, Difficulty, ExecutableLanguage, ProblemLifecycleState } from "../../shared/types/domain";
import { deriveDivisionFromUid } from "../../shared/utils/uid-department";
import type { UserRecord } from "../user/user.model";

/**
 * Class Test: a synchronised, closed-book, proctored assessment for one specific group of
 * students.
 *
 * Deliberately *not* a contest. There is no ranking anywhere in this module — no standings,
 * no rank, no leaderboard, no rating. A student only ever sees their own result, and only
 * after faculty publish it. Anything that would order students by score does not belong here.
 */

export type ClassTestQuestionType = "MCQ" | "MSQ" | "Coding" | "ShortAnswer";

/** Marks come from the judge for the first three; a human awards them for ShortAnswer. */
export type ClassTestScoringMode = "AUTO" | "MANUAL";

export interface ClassTestTestCase {
  input: string;
  output: string;
  explanation?: string;
}

export interface ClassTestQuestionBase {
  id: string;
  type: ClassTestQuestionType;
  points: number;
  /**
   * Reserved for paper sets (roll ending 1/6 -> Set A, ...). Unset today means "every student
   * gets this question"; adding sets later is a filter on this field, not a migration.
   */
  setLabel?: string;
}

export interface ClassTestMcqQuestion extends ClassTestQuestionBase {
  type: "MCQ";
  statement: string;
  options: string[];
  correctAnswer: string;
}

export interface ClassTestMsqQuestion extends ClassTestQuestionBase {
  type: "MSQ";
  statement: string;
  options: string[];
  correctAnswers: string[];
}

export interface ClassTestCodingQuestion extends ClassTestQuestionBase {
  type: "Coding";
  problemTitle: string;
  difficulty: Difficulty;
  problemStatement: string;
  constraints: string;
  inputFormat: string;
  outputFormat: string;
  timeLimitSeconds: number;
  memoryLimitMb: number;
  sampleTestCases: ClassTestTestCase[];
  hiddenTestCases: ClassTestTestCase[];
  /**
   * Languages this question may be answered in — a DSA question can be restricted to Java
   * only, or C/C++ only. Never empty. Unlike contests, this is enforced server-side at run and
   * submit time, so it cannot be bypassed by calling the API directly.
   */
  supportedLanguages: ExecutableLanguage[];
  harness?: HarnessSpec;
}

export interface ClassTestShortAnswerQuestion extends ClassTestQuestionBase {
  type: "ShortAnswer";
  statement: string;
  /** Guidance shown to the student, e.g. 3-4 sentences. */
  expectedSentences?: number;
  /** Faculty-only reference while grading. Never included in a student-facing response. */
  modelAnswer?: string;
}

export type ClassTestQuestion =
  | ClassTestMcqQuestion
  | ClassTestMsqQuestion
  | ClassTestCodingQuestion
  | ClassTestShortAnswerQuestion;

/** A student frozen onto the test at assignment time. */
export interface AssignedStudent {
  email: string;
  name: string | null;
  uid: string | null;
  rollNumber: string | null;
  division: string | null;
}

/** The filter faculty use to find a class; the result is then ticked down to the final list. */
export interface ClassTestAudienceFilter {
  /**
   * Null only when a stored document is unreadable. The validator always writes a real
   * department, and a null one matches no student — failing closed rather than widening.
   */
  department: Department | null;
  division: string | null;
  semester: number | null;
  rollFrom: number | null;
  rollTo: number | null;
}

export interface ClassTestRecord {
  id: string;
  title: string;
  /** Any technical subject — free text, not a fixed list. */
  subject: string;
  instructions: string | null;
  createdBy: string;
  createdByRole: UserRole;
  /** Faculty the creator delegated management to, mirroring contest delegation. */
  managerEmails: string[];

  /**
   * Everyone sits the test in the same window: the deadline is `startAt + durationMinutes`
   * for every student, so starting late buys no extra time and cannot be used to look up
   * answers while others are still writing.
   */
  startAt: Date;
  durationMinutes: number;

  /** The filter that produced {@link assignedStudents}; kept so faculty can re-run it. */
  audience: ClassTestAudienceFilter;
  /**
   * The authority on who may sit this test. Frozen at assignment time so a later profile
   * change (corrected UID, moved division) cannot silently grant or revoke access mid-test.
   */
  assignedStudents: AssignedStudent[];

  /** Scored violations before the attempt is auto-submitted. Defaults to 1. */
  maxViolations: number;

  questions: ClassTestQuestion[];
  lifecycleState: ProblemLifecycleState;
  resultsPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ClassTestComputedStatus = "Scheduled" | "Live" | "Ended";

export type ClassTestAttemptStatus = "ACTIVE" | "SUBMITTED" | "AUTO_SUBMITTED";

export type ClassTestGradingStatus = "PENDING" | "PARTIAL" | "COMPLETE";

export interface ClassTestQuestionAttemptState {
  questionId: string;
  questionType: ClassTestQuestionType;
  /** MCQ: string. MSQ: string[]. ShortAnswer: string. Coding: null (see coding fields). */
  submittedAnswer: string | string[] | null;
  awardedPoints: number;
  maxPoints: number;

  // Coding only — mirrors the contest coding state so the judge worker can fill it in.
  lastSubmissionId: string | null;
  finalSubmissionLanguage: string | null;
  finalSubmissionStatus: string | null;
  passedCount: number;
  totalCount: number;
  draftCode: string | null;
  draftLanguage: string | null;

  // ShortAnswer only — filled in when a human marks it.
  gradedBy: string | null;
  gradedAt: Date | null;
  graderNote: string | null;
}

export interface ClassTestAttemptRecord {
  id: string;
  classTestId: string;
  userEmail: string;
  userName: string | null;
  userUid: string | null;
  userRollNumber: string | null;
  userDivision: string | null;
  userDepartment: Department | null;

  status: ClassTestAttemptStatus;
  questionStates: ClassTestQuestionAttemptState[];

  /** MCQ + MSQ + Coding, computed by the platform. */
  autoScore: number;
  /** ShortAnswer only, awarded by faculty. */
  manualScore: number;
  /** autoScore + manualScore. Meaningful only once grading is COMPLETE. */
  finalScore: number;
  gradingStatus: ClassTestGradingStatus;

  violationCount: number;
  /** Set when proctoring auto-submitted the attempt. Advisory — faculty decide. */
  suspectedMalpractice: boolean;

  startedAt: Date;
  /** Shared across every attempt: startAt + durationMinutes. */
  deadlineAt: Date;
  submittedAt: Date | null;
  autoSubmittedAt: Date | null;
  timeTakenMs: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClassTestProctoringEventRecord {
  id: string;
  classTestId: string;
  attemptId: string;
  userEmail: string;
  type: string;
  createdAt: Date;
}

// --- derivations -------------------------------------------------------------

export function computeClassTestEndAt(test: Pick<ClassTestRecord, "startAt" | "durationMinutes">): Date {
  return new Date(test.startAt.getTime() + test.durationMinutes * 60_000);
}

export function computeClassTestStatus(
  test: Pick<ClassTestRecord, "startAt" | "durationMinutes">,
  now: Date,
): ClassTestComputedStatus {
  const nowMs = now.getTime();
  if (nowMs < test.startAt.getTime()) {
    return "Scheduled";
  }
  return nowMs < computeClassTestEndAt(test).getTime() ? "Live" : "Ended";
}

/** Points available for a question, used for both the paper total and per-question caps. */
export function questionMaxPoints(question: ClassTestQuestion): number {
  return Math.max(0, question.points);
}

export function classTestTotalPoints(questions: readonly ClassTestQuestion[]): number {
  return questions.reduce((total, question) => total + questionMaxPoints(question), 0);
}

export function scoringModeFor(type: ClassTestQuestionType): ClassTestScoringMode {
  return type === "ShortAnswer" ? "MANUAL" : "AUTO";
}

/**
 * Whether a student matches the audience *filter*.
 *
 * This only narrows the candidate pool that faculty tick down from — it is never the access
 * check. Access is decided solely by {@link isAssignedToClassTest}, because the assignment is
 * frozen and must not shift when a profile changes.
 */
export function matchesAudienceFilter(student: UserRecord, filter: ClassTestAudienceFilter): boolean {
  if (filter.department === null) {
    return false;
  }

  if (student.role !== "STUDENT" || student.department !== filter.department) {
    return false;
  }

  if (filter.semester !== null && student.semester !== filter.semester) {
    return false;
  }

  if (filter.division !== null && deriveDivisionFromUid(student.uid) !== filter.division) {
    return false;
  }

  if (filter.rollFrom !== null || filter.rollTo !== null) {
    const roll = Number(student.rollNumber);
    if (!Number.isFinite(roll)) {
      return false;
    }
    if (filter.rollFrom !== null && roll < filter.rollFrom) {
      return false;
    }
    if (filter.rollTo !== null && roll > filter.rollTo) {
      return false;
    }
  }

  return true;
}

/** The only access check that matters at attempt time. */
export function isAssignedToClassTest(test: ClassTestRecord, email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return test.assignedStudents.some((student) => student.email.toLowerCase() === normalized);
}

export function toAssignedStudent(student: UserRecord): AssignedStudent {
  return {
    email: student.email,
    name: student.name,
    uid: student.uid,
    rollNumber: student.rollNumber,
    division: deriveDivisionFromUid(student.uid),
  };
}

/** Whether a language may be used for a coding question. Enforced server-side, not just in the UI. */
export function isLanguageAllowed(question: ClassTestCodingQuestion, language: string): boolean {
  return question.supportedLanguages.includes(language as ExecutableLanguage);
}

// --- student-facing shapes ---------------------------------------------------

/**
 * A question as the student sees it.
 *
 * Built field by field on purpose: there is no member here for a correct answer, a model
 * answer or a hidden test case, so none of them can reach a student by someone spreading a
 * record. Adding one would be an obvious, reviewable change to this file.
 */
export interface StudentClassTestQuestion {
  id: string;
  type: ClassTestQuestionType;
  points: number;
  statement: string;
  options?: string[];
  expectedSentences?: number;
  /** Coding only. */
  problemTitle?: string;
  difficulty?: Difficulty;
  constraints?: string;
  inputFormat?: string;
  outputFormat?: string;
  sampleTestCases?: ClassTestTestCase[];
  supportedLanguages?: ExecutableLanguage[];
  timeLimitSeconds?: number;
  memoryLimitMb?: number;
}

export function toStudentQuestion(question: ClassTestQuestion): StudentClassTestQuestion {
  switch (question.type) {
    case "MCQ":
    case "MSQ":
      return {
        id: question.id,
        type: question.type,
        points: question.points,
        statement: question.statement,
        options: question.options,
      };
    case "ShortAnswer":
      return {
        id: question.id,
        type: question.type,
        points: question.points,
        statement: question.statement,
        expectedSentences: question.expectedSentences,
      };
    case "Coding":
      return {
        id: question.id,
        type: question.type,
        points: question.points,
        statement: question.problemStatement,
        problemTitle: question.problemTitle,
        difficulty: question.difficulty,
        constraints: question.constraints,
        inputFormat: question.inputFormat,
        outputFormat: question.outputFormat,
        // Samples only — hidden test cases are never sent to a student.
        sampleTestCases: question.sampleTestCases,
        supportedLanguages: question.supportedLanguages,
        timeLimitSeconds: question.timeLimitSeconds,
        memoryLimitMb: question.memoryLimitMb,
      };
  }
}

/** Grades an objective answer. Coding and ShortAnswer are scored elsewhere. */
export function scoreObjectiveAnswer(
  question: ClassTestMcqQuestion | ClassTestMsqQuestion,
  submittedAnswer: string | string[] | null,
): number {
  if (question.type === "MCQ") {
    return typeof submittedAnswer === "string" && submittedAnswer === question.correctAnswer
      ? question.points
      : 0;
  }

  if (!Array.isArray(submittedAnswer)) {
    return 0;
  }
  // All-or-nothing: every correct option and no incorrect ones.
  const chosen = new Set(submittedAnswer);
  const expected = new Set(question.correctAnswers);
  const exact =
    chosen.size === expected.size && [...expected].every((option) => chosen.has(option));
  return exact ? question.points : 0;
}
