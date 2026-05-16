import type { UserRole } from "../../shared/types/auth";
import type { Department, Difficulty, ExecutableLanguage } from "../../shared/types/domain";
import { toIsoString } from "../../shared/utils/date";

export type ContestType = "Rated" | "Practice";
export type ContestLifecycleState = "Published";
export type ContestComputedStatus = "Live" | "Upcoming" | "Ended";
export type ContestStudentListStatus = "Live" | "Upcoming" | "Past";
export type ContestQuestionType = "MCQ" | "MSQ" | "Coding";
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
  durationMinutes: number;
  type: ContestType;
  lifecycleState: ContestLifecycleState;
  resultsPublished: boolean;
  targetDepartment: Department | null;
  maxViolations: number;
  createdBy: string;
  createdByRole: UserRole;
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
  finalSubmissionLanguage: ExecutableLanguage | null;
  finalSubmissionStatus: string | null;
  finalRuntimeMs: number;
  finalMemoryKb: number;
  solvedAt: Date | null;
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
  startTime: string;
  durationMinutes: number;
  duration: string;
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
  durationMinutes: number;
  targetDepartment: Department | null;
  maxViolations: number;
  studentListStatus: ContestStudentListStatus;
  attemptStatus: ContestStudentAttemptStatus;
  hasAttempted: boolean;
  attempt: ContestAttemptRecord | null;
  questions: StudentContestQuestionSummary[];
  report: StudentContestReport | null;
}

export interface FacultyContestDetailResponse {
  id: string;
  title: string;
  type: ContestType;
  lifecycleState: ContestLifecycleState;
  resultsPublished: boolean;
  startAt: string;
  durationMinutes: number;
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
  userName: string | null;
  userUid: string | null;
  userEmail: string;
  userDepartment: Department | null;
  score: number;
  solvedCount: number;
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
  const endsAt = startsAt + contest.durationMinutes * 60_000;
  const nowMs = now.getTime();

  if (nowMs < startsAt) {
    return "Upcoming";
  }

  if (nowMs <= endsAt) {
    return "Live";
  }

  return "Ended";
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

export function deriveStudentListStatus(
  contest: ContestRecord,
  attempt: ContestAttemptRecord | null,
  now: Date,
): ContestStudentListStatus {
  const computedStatus = computeContestStatus(contest, now);
  const attemptStatus = attempt?.status;

  if (
    contest.resultsPublished ||
    computedStatus === "Ended" ||
    attemptStatus === "SUBMITTED" ||
    attemptStatus === "AUTO_SUBMITTED" ||
    attemptStatus === "DISQUALIFIED"
  ) {
    return "Past";
  }

  return computedStatus;
}

export function toContestListItem(
  contest: ContestRecord,
  participantsCount: number,
  now: Date,
  attempt: ContestAttemptRecord | null = null,
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
    startTime: contest.startAt.toLocaleString(),
    durationMinutes: contest.durationMinutes,
    duration: `${contest.durationMinutes} mins`,
    participantsCount,
    targetDepartment: contest.targetDepartment,
    createdBy: contest.createdBy,
  };
}

export function toStudentContestDetailResponse(
  contest: ContestRecord,
  attempt: ContestAttemptRecord | null,
  now: Date,
  report: StudentContestReport | null = null,
): StudentContestDetailResponse {
  const computedStatus = computeContestStatus(contest, now);
  const includeQuestions = computedStatus === "Live" && attempt?.status === "ACTIVE";

  return {
    id: contest.id,
    title: contest.title,
    type: contest.type,
    lifecycleState: contest.lifecycleState,
    resultsPublished: contest.resultsPublished,
    computedStatus,
    startAt: toIsoString(contest.startAt) ?? new Date(0).toISOString(),
    durationMinutes: contest.durationMinutes,
    targetDepartment: contest.targetDepartment,
    maxViolations: contest.maxViolations,
    studentListStatus: deriveStudentListStatus(contest, attempt, now),
    attemptStatus: attempt?.status ?? "NOT_ATTEMPTED",
    hasAttempted: Boolean(attempt),
    attempt,
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
          };
        })
      : [],
    report,
  };
}

export function toFacultyContestDetailResponse(contest: ContestRecord): FacultyContestDetailResponse {
  return {
    id: contest.id,
    title: contest.title,
    type: contest.type,
    lifecycleState: contest.lifecycleState,
    resultsPublished: contest.resultsPublished,
    startAt: toIsoString(contest.startAt) ?? new Date(0).toISOString(),
    durationMinutes: contest.durationMinutes,
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
): StudentContestQuestionDetailResponse {
  const questionIndex = contest.questions.findIndex((item) => item.id === question.id);
  const state = attempt?.questionStates.find((item) => item.questionId === question.id);
  const status = state?.status ?? "UNATTEMPTED";
  const awardedPoints = state?.awardedPoints ?? 0;

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
      durationMinutes: contest.durationMinutes,
      maxViolations: contest.maxViolations,
      resultsPublished: contest.resultsPublished,
    },
    attempt,
    question: toStudentContestQuestionDetailResponse(contest, question, attempt),
  };
}

export function toContestStandingItem(
  attempt: ContestAttemptRecord,
  rank: number,
): ContestStandingItem {
  return {
    rank,
    attemptId: attempt.id,
    userName: attempt.userName,
    userUid: attempt.userUid,
    userEmail: attempt.userEmail,
    userDepartment: attempt.userDepartment,
    score: attempt.score,
    solvedCount: attempt.questionStates.filter((state) => state.status === "SOLVED").length,
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
