import type { UserRole } from "../../shared/types/auth";
import type { Department, Difficulty, ExecutableLanguage } from "../../shared/types/domain";
import { toIsoString } from "../../shared/utils/date";
import type { StudentYear } from "../../shared/utils/student-year";

export type ContestType = "Rated" | "Practice";
export type ContestLifecycleState = "Published";
export type ContestComputedStatus = "Live" | "Upcoming" | "Ended";
export type ContestStudentListStatus = "Live" | "Upcoming" | "Past";
export type ContestQuestionType = "MCQ" | "MSQ" | "Coding";
export type ContestRegistrationStatus = "NOT_OPEN" | "OPEN" | "CLOSED";
export type ContestAttemptStatus = "NOT_STARTED" | "ACTIVE" | "SUBMITTED" | "AUTO_SUBMITTED" | "DISQUALIFIED";
export type ContestStudentAttemptStatus = ContestAttemptStatus | "NOT_ATTEMPTED";
export type ContestQuestionAttemptStatus = "UNATTEMPTED" | "ATTEMPTED" | "SOLVED";
export type ContestProctoringEventType =
  | "TAB_SWITCH"
  | "VISIBILITY_LOSS"
  | "FULLSCREEN_EXIT"
  | "COPY"
  | "CUT"
  | "PASTE"
  | "CONTEXT_MENU"
  | "PRINT_SCREEN";

export interface ContestTestCase {
  input: string;
  output: string;
  explanation?: string;
}

export interface ContestQuestionBase {
  id: string;
  type: ContestQuestionType;
  points: number;
}

export interface McqQuestion extends ContestQuestionBase {
  type: "MCQ";
  statement: string;
  options: string[];
  correctAnswer: string;
}

export interface MsqQuestion extends ContestQuestionBase {
  type: "MSQ";
  statement: string;
  options: string[];
  correctAnswers: string[];
}

export interface CodingContestQuestion extends ContestQuestionBase {
  type: "Coding";
  problemTitle: string;
  difficulty: Difficulty;
  problemStatement: string;
  constraints: string;
  inputFormat: string;
  outputFormat: string;
  timeLimitSeconds: number;
  memoryLimitMb: number;
  sampleTestCases: ContestTestCase[];
  hiddenTestCases: ContestTestCase[];
  supportedLanguages: ExecutableLanguage[];
}

export type ContestQuestion = McqQuestion | MsqQuestion | CodingContestQuestion;

export interface ContestRecord {
  id: string;
  title: string;
  startAt: Date;
  /** Close of the contest window. Attempts can be started any time between startAt and endAt. */
  endAt: Date;
  /** Length of a single student's attempt, always capped by endAt. */
  durationMinutes: number;
  registrationOpenAt: Date;
  registrationCloseAt: Date;
  type: ContestType;
  lifecycleState: ContestLifecycleState;
  resultsPublished: boolean;
  targetDepartment: Department | null;
  maxViolations: number;
  createdBy: string;
  createdByRole: UserRole;
  /**
   * Faculty (besides the creator) the HOD has delegated management of this contest to.
   * A manager can do everything the creator can on the contest; only the creator/HOD
   * can change this list.
   */
  managerEmails: string[];
  questions: ContestQuestion[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ContestQuestionAttemptState {
  questionId: string;
  questionType: ContestQuestionType;
  status: ContestQuestionAttemptStatus;
  attemptsCount: number;
  awardedPoints: number;
  submittedAnswer: string | string[] | null;
  isCorrect: boolean | null;
  lastSubmissionId: string | null;
  passedCount: number;
  totalCount: number;
  hasFinalCodingSubmission: boolean;
  /** Latest editor content auto-saved by the student, submitted for them when the attempt ends. */
  draftCode: string | null;
  draftLanguage: ExecutableLanguage | null;
  finalSubmissionLanguage: ExecutableLanguage | null;
  finalSubmissionStatus: string | null;
  finalRuntimeMs: number;
  finalMemoryKb: number;
  solvedAt: Date | null;
}

export interface ContestRegistrationRecord {
  id: string;
  contestId: string;
  userEmail: string;
  userName: string | null;
  userUid: string | null;
  userDepartment: Department | null;
  registeredAt: Date;
}

export interface ContestRegistrationItem {
  id: string;
  userEmail: string;
  userName: string | null;
  userUid: string | null;
  userDepartment: Department | null;
  year: StudentYear | null;
  registeredAt: string;
  hasAttempted: boolean;
  attemptStatus: ContestStudentAttemptStatus;
}

export interface ContestAttemptRecord {
  id: string;
  contestId: string;
  contestTitleSnapshot: string;
  userEmail: string;
  userName: string | null;
  userUid: string | null;
  userDepartment: Department | null;
  status: ContestAttemptStatus;
  score: number;
  violationCount: number;
  violationPenaltyPoints: number;
  timeTakenMs: number | null;
  questionStates: ContestQuestionAttemptState[];
  startedAt: Date;
  /** min(startedAt + contest duration, contest.endAt) — frozen when the attempt starts. */
  deadlineAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  autoSubmittedAt: Date | null;
  lastSolvedAt: Date | null;
}

export interface ContestProctoringEventRecord {
  id: string;
  contestId: string;
  attemptId: string;
  userEmail: string;
  type: ContestProctoringEventType;
  createdAt: Date;
  details: string | null;
}

export type InterfaceReadabilityAnswer = "Yes" | "No" | "Need improvement";
export type ProblemStatementClarityAnswer = "Yes" | "No" | "Needs improvement";

/**
 * One student's feedback for one contest, collected once per unique (contestId, userEmail) before
 * that contest's published results are released to them. Persisted in the `contest_feedback`
 * collection; the presence of a record is what unlocks the report and standings.
 */
export interface ContestFeedbackRecord {
  id: string;
  contestId: string;
  userEmail: string;
  name: string;
  uid: string;
  navigationEase: number;
  visualDesignRating: number;
  interfaceReadability: InterfaceReadabilityAnswer;
  editorResponsiveness: number;
  compilationLag: number;
  errorMessageClarity: number;
  problemStatementClarity: ProblemStatementClarityAnswer;
  bugsOrBrokenLinks: string;
  oneNewFeature: string;
  recommendLikelihood: number;
  overallRating: number | null;
  createdAt: Date;
}

export interface ContestListItem {
  id: string;
  title: string;
  type: ContestType;
  lifecycleState: ContestLifecycleState;
  resultsPublished: boolean;
  computedStatus: ContestComputedStatus;
  studentListStatus: ContestStudentListStatus;
  attemptStatus: ContestStudentAttemptStatus;
  hasAttempted: boolean;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  duration: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
  registrationStatus: ContestRegistrationStatus;
  isRegistered: boolean;
  registeredCount: number;
  participantsCount: number;
  targetDepartment: Department | null;
  createdBy: string;
}

export interface StudentContestQuestionSummary {
  id: string;
  questionNumber: number;
  type: ContestQuestionType;
  title: string;
  points: number;
  difficulty?: Difficulty;
  statement?: string;
  options?: string[];
  correctAnswer?: string | string[];
  problemStatement?: string;
  constraints?: string;
  inputFormat?: string;
  outputFormat?: string;
  sampleTestCases?: ContestTestCase[];
  supportedLanguages?: ExecutableLanguage[];
}

export interface ContestQuestionReportItemBase {
  questionId: string;
  questionNumber: number;
  type: ContestQuestionType;
  title: string;
  points: number;
  awardedPoints: number;
  status: ContestQuestionAttemptStatus;
  attemptsCount: number;
}

export interface ObjectiveContestQuestionReportItem extends ContestQuestionReportItemBase {
  type: "MCQ" | "MSQ";
  statement: string;
  options: string[];
  submittedAnswer: string | string[] | null;
  correctAnswer: string | string[];
  isCorrect: boolean;
}

export interface CodingContestQuestionReportItem extends ContestQuestionReportItemBase {
  type: "Coding";
  difficulty: Difficulty;
  problemStatement: string;
  constraints: string;
  inputFormat: string;
  outputFormat: string;
  sampleTestCases: ContestTestCase[];
  passedCount: number;
  totalCount: number;
  finalSubmissionId: string | null;
  finalSubmissionLanguage: ExecutableLanguage | null;
  finalSubmissionStatus: string | null;
  finalRuntimeMs: number;
  finalMemoryKb: number;
}

export type ContestQuestionReportItem =
  | ObjectiveContestQuestionReportItem
  | CodingContestQuestionReportItem;

export interface StudentContestReport {
  status: ContestStudentAttemptStatus;
  hasAttempted: boolean;
  rank: number | null;
  score: number;
  solvedCount: number;
  violationCount: number;
  violationPenaltyPoints: number;
  timeTakenMs: number | null;
  submittedAt: string | null;
  autoSubmittedAt: string | null;
  questionReports: ContestQuestionReportItem[];
}

export interface StudentContestDetailResponse {
  id: string;
  title: string;
  type: ContestType;
  lifecycleState: ContestLifecycleState;
  resultsPublished: boolean;
  computedStatus: ContestComputedStatus;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  registrationOpenAt: string;
  registrationCloseAt: string;
  registrationStatus: ContestRegistrationStatus;
  isRegistered: boolean;
  registeredCount: number;
  targetDepartment: Department | null;
  maxViolations: number;
  studentListStatus: ContestStudentListStatus;
  attemptStatus: ContestStudentAttemptStatus;
  hasAttempted: boolean;
  attempt: ContestAttemptRecord | null;
  questions: StudentContestQuestionSummary[];
  report: StudentContestReport | null;
  /** Whether this student has already submitted feedback for this contest. Gates the report/standings. */
  feedbackSubmitted: boolean;
}

export interface FacultyContestDetailResponse {
  id: string;
  title: string;
  type: ContestType;
  lifecycleState: ContestLifecycleState;
  resultsPublished: boolean;
  computedStatus: ContestComputedStatus;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  registrationOpenAt: string;
  registrationCloseAt: string;
  registrationStatus: ContestRegistrationStatus;
  registeredCount: number;
  targetDepartment: Department | null;
  maxViolations: number;
  questions: ContestQuestion[];
  createdBy: string;
  createdByRole: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface ContestStandingItem {
  rank: number;
  attemptId: string;
  email: string;
  name: string | null;
  uid: string | null;
  department: Department | null;
  userName: string | null;
  userUid: string | null;
  userEmail: string;
  userDepartment: Department | null;
  year: StudentYear | null;
  score: number;
  solvedCount: number;
  /** Number of questions in the contest, so the UI can show "solved / total". */
  totalQuestions: number;
  status: ContestAttemptStatus;
  violationCount: number;
  violationPenaltyPoints: number;
  timeTakenMs: number | null;
  startedAt: string;
  submittedAt: string | null;
  autoSubmittedAt: string | null;
  lastSolvedAt: string | null;
}

export interface ContestAttemptSummary {
  id: string;
  userEmail: string;
  userName: string | null;
  userUid: string | null;
  userDepartment: Department | null;
  year: StudentYear | null;
  status: ContestAttemptStatus;
  score: number;
  violationCount: number;
  violationPenaltyPoints: number;
  timeTakenMs: number | null;
  startedAt: string;
  submittedAt: string | null;
  autoSubmittedAt: string | null;
  lastSolvedAt: string | null;
}

export interface ObjectiveContestQuestionDetail {
  id: string;
  questionNumber: number;
  type: "MCQ" | "MSQ";
  title: string;
  points: number;
  status: ContestQuestionAttemptStatus;
  awardedPoints: number;
  statement: string;
  options: string[];
  correctAnswer?: string | string[];
}

export interface CodingContestQuestionDetail {
  id: string;
  questionNumber: number;
  type: "Coding";
  title: string;
  points: number;
  status: ContestQuestionAttemptStatus;
  awardedPoints: number;
  difficulty: Difficulty;
  problemStatement: string;
  constraints: string;
  inputFormat: string;
  outputFormat: string;
  timeLimitSeconds: number;
  memoryLimitMb: number;
  sampleTestCases: ContestTestCase[];
  supportedLanguages: ExecutableLanguage[];
}

export type StudentContestQuestionDetailResponse =
  | ObjectiveContestQuestionDetail
  | CodingContestQuestionDetail;

export interface StudentContestQuestionEnvelope {
  contest: {
    id: string;
    title: string;
    type: ContestType;
    computedStatus: ContestComputedStatus;
    startAt: string;
    endAt: string;
    durationMinutes: number;
    maxViolations: number;
    resultsPublished: boolean;
  };
  attempt: ContestAttemptRecord | null;
  question: StudentContestQuestionDetailResponse;
}

export interface FacultyContestAttemptQuestionReviewBase {
  questionId: string;
  questionNumber: number;
  type: ContestQuestionType;
  title: string;
  points: number;
  awardedPoints: number;
  status: ContestQuestionAttemptStatus;
  attemptsCount: number;
}

export interface FacultyObjectiveQuestionReview extends FacultyContestAttemptQuestionReviewBase {
  type: "MCQ" | "MSQ";
  statement: string;
  options: string[];
  submittedAnswer: string | string[] | null;
  correctAnswer: string | string[];
  isCorrect: boolean | null;
}

export interface FacultyCodingQuestionReview extends FacultyContestAttemptQuestionReviewBase {
  type: "Coding";
  difficulty: Difficulty;
  problemStatement: string;
  constraints: string;
  inputFormat: string;
  outputFormat: string;
  passedCount: number;
  totalCount: number;
  finalSubmissionId: string | null;
  finalSubmissionLanguage: ExecutableLanguage | null;
  finalSubmissionStatus: string | null;
  finalRuntimeMs: number;
  finalMemoryKb: number;
  finalCode: string | null;
}

export type FacultyContestAttemptQuestionReview =
  | FacultyObjectiveQuestionReview
  | FacultyCodingQuestionReview;

export interface FacultyContestAttemptReview {
  attemptId: string;
  contestId: string;
  contestTitle: string;
  student: {
    email: string;
    name: string | null;
    uid: string | null;
    department: Department | null;
  };
  status: ContestAttemptStatus;
  score: number;
  solvedCount: number;
  violationCount: number;
  violationPenaltyPoints: number;
  timeTakenMs: number | null;
  startedAt: string;
  submittedAt: string | null;
  autoSubmittedAt: string | null;
  questionReviews: FacultyContestAttemptQuestionReview[];
}

export function computeContestStatus(contest: ContestRecord, now: Date): ContestComputedStatus {
  const startsAt = contest.startAt.getTime();
  const endsAt = contest.endAt.getTime();
  const nowMs = now.getTime();

  if (nowMs < startsAt) {
    return "Upcoming";
  }

  if (nowMs <= endsAt) {
    return "Live";
  }

  return "Ended";
}

export function computeContestDeadline(contest: ContestRecord): Date {
  return contest.endAt;
}

/**
 * A student attempt never outlives the contest window: whoever starts late gets whatever is
 * left of it rather than the full duration.
 */
export function computeAttemptDeadline(contest: ContestRecord, startedAt: Date): Date {
  return new Date(
    Math.min(startedAt.getTime() + contest.durationMinutes * 60_000, contest.endAt.getTime()),
  );
}

export function computeRegistrationStatus(
  contest: ContestRecord,
  now: Date,
): ContestRegistrationStatus {
  const nowMs = now.getTime();

  if (nowMs < contest.registrationOpenAt.getTime()) {
    return "NOT_OPEN";
  }

  if (nowMs > contest.registrationCloseAt.getTime() || nowMs > contest.endAt.getTime()) {
    return "CLOSED";
  }

  return "OPEN";
}

export function computeViolationPenaltyPoints(violationCount: number): number {
  return Math.max(0, violationCount) * 5;
}

export function calculateAttemptScore(
  questionStates: ContestQuestionAttemptState[],
  violationCount: number,
): number {
  const awardedPoints = questionStates.reduce((total, state) => total + Math.max(state.awardedPoints, 0), 0);
  return Math.max(0, awardedPoints - computeViolationPenaltyPoints(violationCount));
}

/**
 * Turns a judged coding verdict (passedCount / totalCount / finalSubmissionStatus) into the scored
 * question state: awarded points (proportional to passed test cases), SOLVED/ATTEMPTED status, and
 * solvedAt. This is the single source of truth for coding scoring — used both by the publish-time
 * grading pass and by the async judge worker so the two paths can never diverge. Deterministic and
 * idempotent: re-running it on an already-scored state yields the same result and never clears an
 * earlier solvedAt.
 */
export function scoreCodingQuestionState(
  state: ContestQuestionAttemptState,
  points: number,
  now: Date,
): ContestQuestionAttemptState {
  const fullPass =
    state.totalCount > 0 &&
    state.passedCount >= state.totalCount &&
    state.finalSubmissionStatus === "ACCEPTED";
  const awardedPoints =
    state.totalCount > 0 ? Math.max(0, Math.round((points * state.passedCount) / state.totalCount)) : 0;
  return {
    ...state,
    status: state.lastSubmissionId ? (fullPass ? "SOLVED" : "ATTEMPTED") : "UNATTEMPTED",
    awardedPoints,
    isCorrect: null,
    solvedAt: fullPass ? (state.solvedAt ?? now) : null,
  };
}

export function computeAttemptTimeTakenMs(attempt: ContestAttemptRecord): number | null {
  const terminalTime = attempt.submittedAt ?? attempt.autoSubmittedAt;
  if (!terminalTime) {
    return null;
  }

  return Math.max(0, terminalTime.getTime() - attempt.startedAt.getTime());
}

export function buildStudentQuestionTitle(question: ContestQuestion): string {
  if (question.type === "Coding") {
    return question.problemTitle;
  }

  return question.statement;
}

/**
 * A submitted attempt no longer moves the contest to "Past": a live contest stays in the Live
 * section (rendered as "Attempted") until its window actually closes.
 */
export function deriveStudentListStatus(
  contest: ContestRecord,
  _attempt: ContestAttemptRecord | null,
  now: Date,
): ContestStudentListStatus {
  const computedStatus = computeContestStatus(contest, now);

  if (contest.resultsPublished || computedStatus === "Ended") {
    return "Past";
  }

  return computedStatus;
}

export function toContestListItem(
  contest: ContestRecord,
  participantsCount: number,
  now: Date,
  attempt: ContestAttemptRecord | null = null,
  isRegistered = false,
  registeredCount = 0,
): ContestListItem {
  return {
    id: contest.id,
    title: contest.title,
    type: contest.type,
    lifecycleState: contest.lifecycleState,
    resultsPublished: contest.resultsPublished,
    computedStatus: computeContestStatus(contest, now),
    studentListStatus: deriveStudentListStatus(contest, attempt, now),
    attemptStatus: attempt?.status ?? "NOT_ATTEMPTED",
    hasAttempted: Boolean(attempt),
    startAt: toIsoString(contest.startAt) ?? new Date(0).toISOString(),
    endAt: toIsoString(contest.endAt) ?? new Date(0).toISOString(),
    durationMinutes: contest.durationMinutes,
    duration: `${contest.durationMinutes} mins`,
    registrationOpenAt: toIsoString(contest.registrationOpenAt) ?? new Date(0).toISOString(),
    registrationCloseAt: toIsoString(contest.registrationCloseAt) ?? new Date(0).toISOString(),
    registrationStatus: computeRegistrationStatus(contest, now),
    isRegistered,
    registeredCount,
    participantsCount,
    targetDepartment: contest.targetDepartment,
    createdBy: contest.createdBy,
  };
}

/**
 * Returns a student-safe copy of an attempt with every scoring outcome neutralised: awarded points,
 * correctness flags, solved status/timestamps, and the aggregate score. Used whenever results are
 * unpublished so scores that were graded onto the record (by publish, the worker, or a faculty
 * preview) never leak to the student. Does not mutate the stored attempt.
 */
function redactAttemptScoringForStudent(attempt: ContestAttemptRecord): ContestAttemptRecord {
  return {
    ...attempt,
    score: 0,
    questionStates: attempt.questionStates.map((state) => ({
      ...state,
      awardedPoints: 0,
      isCorrect: null,
      solvedAt: null,
      status: state.status === "SOLVED" ? "ATTEMPTED" : state.status,
    })),
  };
}

export function toStudentContestDetailResponse(
  contest: ContestRecord,
  attempt: ContestAttemptRecord | null,
  now: Date,
  report: StudentContestReport | null = null,
  isRegistered = false,
  registeredCount = 0,
  feedbackSubmitted = false,
): StudentContestDetailResponse {
  const computedStatus = computeContestStatus(contest, now);
  // Questions are visible while actively attempting, or after results are published for review.
  // The ended-but-unpublished window shows nothing — no questions, no answers.
  const includeQuestions = (computedStatus === "Live" && attempt?.status === "ACTIVE") || contest.resultsPublished;
  // Correct answers are never revealed until faculty publishes results.
  const revealSolutions = contest.resultsPublished;
  // Scores may be graded onto the attempt (by publish, the judge worker, or an out-of-band faculty
  // preview) before results are published. Students must never see any scoring outcome until then,
  // so the copy returned to them is redacted while unpublished. Live-contest fields (drafts,
  // submitted answers, per-test pass counts, judged verdict) are preserved so resume keeps working.
  const visibleAttempt = attempt && !contest.resultsPublished ? redactAttemptScoringForStudent(attempt) : attempt;

  return {
    id: contest.id,
    title: contest.title,
    type: contest.type,
    lifecycleState: contest.lifecycleState,
    resultsPublished: contest.resultsPublished,
    computedStatus,
    startAt: toIsoString(contest.startAt) ?? new Date(0).toISOString(),
    endAt: toIsoString(contest.endAt) ?? new Date(0).toISOString(),
    durationMinutes: contest.durationMinutes,
    registrationOpenAt: toIsoString(contest.registrationOpenAt) ?? new Date(0).toISOString(),
    registrationCloseAt: toIsoString(contest.registrationCloseAt) ?? new Date(0).toISOString(),
    registrationStatus: computeRegistrationStatus(contest, now),
    isRegistered,
    registeredCount,
    targetDepartment: contest.targetDepartment,
    maxViolations: contest.maxViolations,
    studentListStatus: deriveStudentListStatus(contest, attempt, now),
    attemptStatus: attempt?.status ?? "NOT_ATTEMPTED",
    hasAttempted: Boolean(attempt),
    attempt: visibleAttempt,
    questions: includeQuestions
      ? contest.questions.map((question, index) => {
          if (question.type === "Coding") {
            return {
              id: question.id,
              questionNumber: index + 1,
              type: question.type,
              title: buildStudentQuestionTitle(question),
              points: question.points,
              difficulty: question.difficulty,
              problemStatement: question.problemStatement,
              constraints: question.constraints,
              inputFormat: question.inputFormat,
              outputFormat: question.outputFormat,
              sampleTestCases: question.sampleTestCases,
              supportedLanguages: question.supportedLanguages,
            };
          }

          return {
            id: question.id,
            questionNumber: index + 1,
            type: question.type,
            title: buildStudentQuestionTitle(question),
            points: question.points,
            statement: question.statement,
            options: question.options,
            ...(revealSolutions
              ? {
                  correctAnswer:
                    question.type === "MCQ" ? question.correctAnswer : question.correctAnswers,
                }
              : {}),
          };
        })
      : [],
    report,
    feedbackSubmitted,
  };
}

export function toFacultyContestDetailResponse(
  contest: ContestRecord,
  now: Date = new Date(),
  registeredCount = 0,
): FacultyContestDetailResponse {
  return {
    id: contest.id,
    title: contest.title,
    type: contest.type,
    lifecycleState: contest.lifecycleState,
    resultsPublished: contest.resultsPublished,
    computedStatus: computeContestStatus(contest, now),
    startAt: toIsoString(contest.startAt) ?? new Date(0).toISOString(),
    endAt: toIsoString(contest.endAt) ?? new Date(0).toISOString(),
    durationMinutes: contest.durationMinutes,
    registrationOpenAt: toIsoString(contest.registrationOpenAt) ?? new Date(0).toISOString(),
    registrationCloseAt: toIsoString(contest.registrationCloseAt) ?? new Date(0).toISOString(),
    registrationStatus: computeRegistrationStatus(contest, now),
    registeredCount,
    targetDepartment: contest.targetDepartment,
    maxViolations: contest.maxViolations,
    questions: contest.questions,
    createdBy: contest.createdBy,
    createdByRole: contest.createdByRole,
    createdAt: toIsoString(contest.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIsoString(contest.updatedAt) ?? new Date(0).toISOString(),
  };
}

export function toContestAttemptSummary(attempt: ContestAttemptRecord): ContestAttemptSummary {
  return {
    id: attempt.id,
    userEmail: attempt.userEmail,
    userName: attempt.userName,
    userUid: attempt.userUid,
    userDepartment: attempt.userDepartment,
    year: null,
    status: attempt.status,
    score: attempt.score,
    violationCount: attempt.violationCount,
    violationPenaltyPoints: attempt.violationPenaltyPoints,
    timeTakenMs: attempt.timeTakenMs,
    startedAt: toIsoString(attempt.startedAt) ?? new Date(0).toISOString(),
    submittedAt: toIsoString(attempt.submittedAt),
    autoSubmittedAt: toIsoString(attempt.autoSubmittedAt),
    lastSolvedAt: toIsoString(attempt.lastSolvedAt),
  };
}

export function toStudentContestQuestionDetailResponse(
  contest: ContestRecord,
  question: ContestQuestion,
  attempt: ContestAttemptRecord | null,
  now: Date,
): StudentContestQuestionDetailResponse {
  const questionIndex = contest.questions.findIndex((item) => item.id === question.id);
  const state = attempt?.questionStates.find((item) => item.questionId === question.id);
  const status = state?.status ?? "UNATTEMPTED";
  const awardedPoints = state?.awardedPoints ?? 0;
  const revealSolutions = contest.resultsPublished;

  if (question.type === "Coding") {
    return {
      id: question.id,
      questionNumber: questionIndex + 1,
      type: "Coding",
      title: question.problemTitle,
      points: question.points,
      status,
      awardedPoints,
      difficulty: question.difficulty,
      problemStatement: question.problemStatement,
      constraints: question.constraints,
      inputFormat: question.inputFormat,
      outputFormat: question.outputFormat,
      timeLimitSeconds: question.timeLimitSeconds,
      memoryLimitMb: question.memoryLimitMb,
      sampleTestCases: question.sampleTestCases,
      supportedLanguages: question.supportedLanguages,
    };
  }

  return {
    id: question.id,
    questionNumber: questionIndex + 1,
    type: question.type,
    title: buildStudentQuestionTitle(question),
    points: question.points,
    status,
    awardedPoints,
    statement: question.statement,
    options: question.options,
    ...(revealSolutions
      ? {
          correctAnswer:
            question.type === "MCQ" ? question.correctAnswer : question.correctAnswers,
        }
      : {}),
  };
}

export function toStudentContestQuestionEnvelope(
  contest: ContestRecord,
  question: ContestQuestion,
  attempt: ContestAttemptRecord | null,
  now: Date,
): StudentContestQuestionEnvelope {
  return {
    contest: {
      id: contest.id,
      title: contest.title,
      type: contest.type,
      computedStatus: computeContestStatus(contest, now),
      startAt: toIsoString(contest.startAt) ?? new Date(0).toISOString(),
      endAt: toIsoString(contest.endAt) ?? new Date(0).toISOString(),
      durationMinutes: contest.durationMinutes,
      maxViolations: contest.maxViolations,
      resultsPublished: contest.resultsPublished,
    },
    attempt,
    question: toStudentContestQuestionDetailResponse(contest, question, attempt, now),
  };
}

export function toContestRegistrationItem(
  registration: ContestRegistrationRecord,
  attempt: ContestAttemptRecord | null = null,
  year: StudentYear | null = null,
): ContestRegistrationItem {
  return {
    id: registration.id,
    userEmail: registration.userEmail,
    userName: registration.userName,
    userUid: registration.userUid,
    userDepartment: registration.userDepartment,
    year,
    registeredAt: toIsoString(registration.registeredAt) ?? new Date(0).toISOString(),
    hasAttempted: Boolean(attempt),
    attemptStatus: attempt?.status ?? "NOT_ATTEMPTED",
  };
}

export function toContestStandingItem(
  attempt: ContestAttemptRecord,
  rank: number,
  year: StudentYear | null = null,
): ContestStandingItem {
  return {
    rank,
    attemptId: attempt.id,
    email: attempt.userEmail,
    name: attempt.userName,
    uid: attempt.userUid,
    department: attempt.userDepartment,
    userName: attempt.userName,
    userUid: attempt.userUid,
    userEmail: attempt.userEmail,
    userDepartment: attempt.userDepartment,
    year,
    score: attempt.score,
    solvedCount: attempt.questionStates.filter((state) => state.status === "SOLVED").length,
    // questionStates holds one entry per contest question, so its length is the total.
    totalQuestions: attempt.questionStates.length,
    status: attempt.status,
    violationCount: attempt.violationCount,
    violationPenaltyPoints: attempt.violationPenaltyPoints,
    timeTakenMs: attempt.timeTakenMs,
    startedAt: toIsoString(attempt.startedAt) ?? new Date(0).toISOString(),
    submittedAt: toIsoString(attempt.submittedAt),
    autoSubmittedAt: toIsoString(attempt.autoSubmittedAt),
    lastSolvedAt: toIsoString(attempt.lastSolvedAt),
  };
}
