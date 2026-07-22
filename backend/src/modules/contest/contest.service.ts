import { randomUUID } from "node:crypto";
import { wrapSubmissionCode } from "../../execution/code-wrapper";
import type { ExecutionProvider } from "../../execution/execution-provider";
import { AppError } from "../../shared/errors/app-error";
import type { AuthenticatedUser } from "../../shared/types/auth";
import type { Department, ExecutableLanguage } from "../../shared/types/domain";
import { normalizeDepartment } from "../../shared/utils/normalize";
import { paginateArray, type PaginatedResult, type PaginationInput } from "../../shared/utils/pagination";
import { matchesStudentYearSemester, type StudentYear } from "../../shared/utils/student-year";
import type { SubmissionQueue } from "../../queue/submission-queue";
import type { SubmissionRepository } from "../submission/submission.repository";
import type { UserRepository } from "../user/user.repository";
import type {
  CodingContestQuestion,
  ContestAttemptRecord,
  ContestAttemptStatus,
  ContestAttemptSummary,
  ContestComputedStatus,
  ContestListItem,
  ContestProctoringEventRecord,
  ContestQuestion,
  ContestQuestionAttemptState,
  ContestQuestionReportItem,
  ContestRecord,
  ContestRegistrationItem,
  ContestRegistrationRecord,
  ContestStandingItem,
  FacultyContestAttemptQuestionReview,
  FacultyContestAttemptReview,
  FacultyContestDetailResponse,
  StudentContestDetailResponse,
  StudentContestQuestionEnvelope,
  StudentContestReport,
} from "./contest.model";
import {
  calculateAttemptScore,
  computeAttemptDeadline,
  computeAttemptTimeTakenMs,
  computeContestStatus,
  computeRegistrationStatus,
  computeViolationPenaltyPoints,
  toContestAttemptSummary,
  toContestListItem,
  toContestRegistrationItem,
  toContestStandingItem,
  toFacultyContestDetailResponse,
  toStudentContestDetailResponse,
  toStudentContestQuestionEnvelope,
} from "./contest.model";
import type {
  ContestAttemptRepository,
  ContestProctoringRepository,
  ContestRegistrationRepository,
  ContestRepository,
} from "./contest.repository";
import {
  normalizeCodingQuestion,
  type contestAnswerSchema,
  type contestCodingRunSchema,
  type contestCodingSubmissionSchema,
  type contestResultsSchema,
  type createContestSchema,
  type updateContestSchema,
} from "./contest.validator";

type ContestCreateInput = import("zod").infer<typeof createContestSchema>;
type ContestUpdateInput = Partial<ContestCreateInput>;
type ContestAnswerInput = import("zod").infer<typeof contestAnswerSchema>;
type ContestCodingSubmissionInput = import("zod").infer<typeof contestCodingSubmissionSchema>;
type ContestCodingRunInput = import("zod").infer<typeof contestCodingRunSchema>;
type ContestResultsInput = import("zod").infer<typeof contestResultsSchema>;

export interface ContestService {
  listContests(
    user: AuthenticatedUser,
    query: PaginationInput & { department?: Department },
  ): Promise<PaginatedResult<ContestListItem>>;
  getContestById(user: AuthenticatedUser, contestId: string): Promise<StudentContestDetailResponse | FacultyContestDetailResponse>;
  createContest(user: AuthenticatedUser, input: ContestCreateInput): Promise<FacultyContestDetailResponse>;
  updateContest(user: AuthenticatedUser, contestId: string, input: ContestUpdateInput): Promise<FacultyContestDetailResponse>;
  updateContestResults(user: AuthenticatedUser, contestId: string, input: ContestResultsInput): Promise<FacultyContestDetailResponse>;
  registerForContest(user: AuthenticatedUser, contestId: string): Promise<ContestRegistrationRecord>;
  unregisterFromContest(user: AuthenticatedUser, contestId: string): Promise<void>;
  listRegistrations(user: AuthenticatedUser, contestId: string): Promise<ContestRegistrationItem[]>;
  exportRegistrationsCsv(user: AuthenticatedUser, contestId: string): Promise<string>;
  startAttempt(user: AuthenticatedUser, contestId: string): Promise<ContestAttemptRecord>;
  submitAttempt(user: AuthenticatedUser, contestId: string): Promise<ContestAttemptRecord>;
  recordProctorEvent(user: AuthenticatedUser, contestId: string, type: ContestProctoringEventRecord["type"], details: string | null): Promise<ContestAttemptRecord>;
  answerObjectiveQuestion(user: AuthenticatedUser, contestId: string, input: ContestAnswerInput): Promise<ContestAttemptRecord>;
  getQuestionById(user: AuthenticatedUser, contestId: string, questionId: string): Promise<StudentContestQuestionEnvelope>;
  runCodingQuestion(user: AuthenticatedUser, contestId: string, input: ContestCodingRunInput): Promise<{
    problemId: string;
    language: ContestCodingRunInput["language"];
    status: string;
    runtimeMs: number;
    memoryKb: number;
    passedCount: number;
    totalCount: number;
    executionProvider: string;
    stdout?: string;
    stderr?: string;
  }>;
  submitCodingQuestion(user: AuthenticatedUser, contestId: string, input: ContestCodingSubmissionInput): Promise<{
    submissionId: string;
    status: string;
    practiceMode?: boolean;
    runtimeMs?: number;
    memoryKb?: number;
    passedCount?: number;
    totalCount?: number;
    stdout?: string;
    stderr?: string;
  }>;
  getStandings(user: AuthenticatedUser, contestId: string, query?: { department?: Department; year?: StudentYear }): Promise<ContestStandingItem[]>;
  exportStandingsCsv(user: AuthenticatedUser, contestId: string, query?: { department?: Department; year?: StudentYear }): Promise<string>;
  listAttempts(user: AuthenticatedUser, contestId: string): Promise<ContestAttemptSummary[]>;
  getAttemptReview(user: AuthenticatedUser, contestId: string, attemptId: string): Promise<FacultyContestAttemptReview>;
}

interface ContestServiceDependencies {
  contestRepository: ContestRepository;
  contestAttemptRepository: ContestAttemptRepository;
  contestProctoringRepository: ContestProctoringRepository;
  contestRegistrationRepository: ContestRegistrationRepository;
  submissionRepository: SubmissionRepository;
  submissionQueue: SubmissionQueue;
  userRepository: UserRepository;
  executionProvider: ExecutionProvider;
  now: () => Date;
}

function ensureFacultyOwnsContest(user: AuthenticatedUser, contest: ContestRecord | null): ContestRecord {
  if (!contest || contest.createdBy !== user.email) {
    throw new AppError(404, "Contest not found");
  }

  return contest;
}

/**
 * The student's department is whatever they saved during profile completion, so it has to be read
 * from the persisted user record. The authenticated request identity carries no department, so
 * relying on it silently hid every department-targeted contest from every student.
 */
async function resolveStudentDepartment(
  user: AuthenticatedUser,
  dependencies: ContestServiceDependencies,
): Promise<Department | null> {
  const userRecord = await dependencies.userRepository.getByEmail(user.email);
  return userRecord?.department ?? normalizeDepartment(user.department) ?? null;
}

function ensureStudentCanAccessContest(
  contest: ContestRecord | null,
  studentDepartment: Department | null,
): ContestRecord {
  if (!contest) {
    throw new AppError(404, "Contest not found");
  }

  if (contest.targetDepartment && contest.targetDepartment !== studentDepartment) {
    throw new AppError(403, "You are not eligible for this contest");
  }

  return contest;
}

function ensureContestQuestion(contest: ContestRecord, questionId: string): ContestQuestion {
  const question = contest.questions.find((item) => item.id === questionId);
  if (!question) {
    throw new AppError(404, "Contest question not found");
  }

  return question;
}

function createDefaultQuestionState(question: ContestQuestion): ContestQuestionAttemptState {
  return {
    questionId: question.id,
    questionType: question.type,
    status: "UNATTEMPTED",
    attemptsCount: 0,
    awardedPoints: 0,
    submittedAnswer: null,
    isCorrect: null,
    lastSubmissionId: null,
    passedCount: 0,
    totalCount: 0,
    hasFinalCodingSubmission: false,
    finalSubmissionLanguage: null,
    finalSubmissionStatus: null,
    finalRuntimeMs: 0,
    finalMemoryKb: 0,
    solvedAt: null,
  };
}

function buildAttemptQuestionStates(questions: ContestQuestion[]): ContestQuestionAttemptState[] {
  return questions.map(createDefaultQuestionState);
}

function normalizeContestQuestions(
  questions: ContestCreateInput["questions"] | ContestUpdateInput["questions"],
): ContestQuestion[] | undefined {
  if (!questions) {
    return undefined;
  }

  return questions.map((question) => {
    if (question.type !== "Coding") {
      return question as ContestQuestion;
    }

    const normalizedQuestion = normalizeCodingQuestion(question as Extract<ContestCreateInput["questions"][number], { type: "Coding" }>);
    if (normalizedQuestion.hiddenTestCases.length === 0) {
      throw new AppError(400, "Coding contest questions require at least one hidden testcase");
    }

    return normalizedQuestion;
  });
}

function ensureActiveAttempt(attempt: ContestAttemptRecord | null): ContestAttemptRecord {
  if (!attempt) {
    throw new AppError(409, "Contest attempt has not been started");
  }

  if (attempt.status !== "ACTIVE") {
    throw new AppError(409, "Contest attempt is no longer active");
  }

  return attempt;
}

function ensureContestIsLive(contest: ContestRecord, now: Date): void {
  if (computeContestStatus(contest, now) !== "Live") {
    throw new AppError(409, "Contest is not live");
  }
}

function ensureRegistrationOpen(contest: ContestRecord, now: Date): void {
  const status = computeRegistrationStatus(contest, now);
  if (status === "NOT_OPEN") {
    throw new AppError(409, "Registration for this contest has not opened yet");
  }

  if (status === "CLOSED") {
    throw new AppError(409, "Registration for this contest is closed");
  }
}

function ensureStudentIsRegistered(registration: ContestRegistrationRecord | null): void {
  if (!registration) {
    throw new AppError(403, "Register for this contest before attempting it");
  }
}

function ensureCoherentContestWindow(contest: ContestRecord): void {
  if (contest.endAt.getTime() <= contest.startAt.getTime()) {
    throw new AppError(400, "End time must be after the start time");
  }

  const windowMinutes = (contest.endAt.getTime() - contest.startAt.getTime()) / 60_000;
  if (contest.durationMinutes > windowMinutes) {
    throw new AppError(400, `Duration cannot exceed the contest window of ${Math.floor(windowMinutes)} minutes`);
  }

  if (contest.registrationCloseAt.getTime() > contest.endAt.getTime()) {
    throw new AppError(400, "Registration cannot close after the contest ends");
  }
}

function ensureContestHasEnded(contest: ContestRecord, now: Date): void {
  if (computeContestStatus(contest, now) !== "Ended") {
    throw new AppError(409, "Contest has not ended yet");
  }
}

/**
 * Every evasion the browser cannot hard-block is scored: leaving the tab, leaving fullscreen, and
 * screenshots. Clipboard and context-menu events are prevented outright client-side, so they are
 * logged for faculty review but cost the student nothing — the action never succeeded.
 */
function isViolationEvent(type: ContestProctoringEventRecord["type"]): boolean {
  return (
    type === "TAB_SWITCH" ||
    type === "VISIBILITY_LOSS" ||
    type === "FULLSCREEN_EXIT" ||
    type === "PRINT_SCREEN"
  );
}

function ensureStudentCanViewStandings(contest: ContestRecord): void {
  if (!contest.resultsPublished) {
    throw new AppError(403, "Standings are not available yet");
  }
}

function isCorrectObjectiveAnswer(question: ContestQuestion, answer: string | string[]): boolean {
  if (question.type === "MCQ") {
    return typeof answer === "string" && answer === question.correctAnswer;
  }

  if (question.type === "MSQ") {
    const provided = Array.isArray(answer) ? [...answer].sort() : [answer].sort();
    const expected = [...question.correctAnswers].sort();
    return provided.length === expected.length && provided.every((value, index) => value === expected[index]);
  }

  throw new AppError(400, "Question type requires code submission");
}

function getQuestionState(attempt: ContestAttemptRecord, questionId: string): ContestQuestionAttemptState {
  return attempt.questionStates.find((state) => state.questionId === questionId) ?? createDefaultQuestionState({
    id: questionId,
    type: "MCQ",
    points: 0,
    statement: "",
    options: [],
    correctAnswer: "",
  });
}

function updateQuestionState(
  attempt: ContestAttemptRecord,
  questionId: string,
  updater: (state: ContestQuestionAttemptState) => ContestQuestionAttemptState,
): ContestQuestionAttemptState[] {
  return attempt.questionStates.map((state) => (state.questionId === questionId ? updater(state) : state));
}

function withDerivedAttemptFields(attempt: ContestAttemptRecord): ContestAttemptRecord {
  const violationPenaltyPoints = computeViolationPenaltyPoints(attempt.violationCount);
  return {
    ...attempt,
    violationPenaltyPoints,
    score: calculateAttemptScore(attempt.questionStates, attempt.violationCount),
    timeTakenMs: computeAttemptTimeTakenMs(attempt),
  };
}

function sortStandings(left: ContestAttemptRecord, right: ContestAttemptRecord): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  const leftTime = left.timeTakenMs ?? Number.MAX_SAFE_INTEGER;
  const rightTime = right.timeTakenMs ?? Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  if (left.startedAt.getTime() !== right.startedAt.getTime()) {
    return left.startedAt.getTime() - right.startedAt.getTime();
  }

  return left.id.localeCompare(right.id);
}

function deriveParticipantsCount(attempts: ContestAttemptRecord[]): number {
  return new Set(attempts.map((attempt) => attempt.userEmail)).size;
}

function buildStudentReport(
  contest: ContestRecord,
  attempt: ContestAttemptRecord | null,
  standings: ContestStandingItem[],
): StudentContestReport {
  const standingEntry = attempt ? standings.find((entry) => entry.attemptId === attempt.id) : null;

  if (!attempt) {
    return {
      status: "NOT_ATTEMPTED",
      hasAttempted: false,
      rank: null,
      score: 0,
      solvedCount: 0,
      violationCount: 0,
      violationPenaltyPoints: 0,
      timeTakenMs: null,
      submittedAt: null,
      autoSubmittedAt: null,
      questionReports: [],
    };
  }

  return {
    status: attempt.status,
    hasAttempted: true,
    rank: standingEntry?.rank ?? null,
    score: attempt.score,
    solvedCount: attempt.questionStates.filter((state) => state.status === "SOLVED").length,
    violationCount: attempt.violationCount,
    violationPenaltyPoints: attempt.violationPenaltyPoints,
    timeTakenMs: attempt.timeTakenMs,
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    autoSubmittedAt: attempt.autoSubmittedAt?.toISOString() ?? null,
    questionReports: contest.questions.map((question, index) => {
      const state = attempt.questionStates.find((item) => item.questionId === question.id) ?? createDefaultQuestionState(question);
      const base = {
        questionId: question.id,
        questionNumber: index + 1,
        type: question.type,
        title: question.type === "Coding" ? question.problemTitle : question.statement,
        points: question.points,
        awardedPoints: state.awardedPoints,
        status: state.status,
        attemptsCount: state.attemptsCount,
      } satisfies Omit<ContestQuestionReportItem, "statement" | "options" | "submittedAnswer" | "correctAnswer" | "isCorrect" | "difficulty" | "problemStatement" | "constraints" | "inputFormat" | "outputFormat" | "sampleTestCases" | "passedCount" | "totalCount" | "finalSubmissionId" | "finalSubmissionLanguage" | "finalSubmissionStatus" | "finalRuntimeMs" | "finalMemoryKb">;

      if (question.type === "Coding") {
        return {
          ...base,
          type: "Coding",
          difficulty: question.difficulty,
          problemStatement: question.problemStatement,
          constraints: question.constraints,
          inputFormat: question.inputFormat,
          outputFormat: question.outputFormat,
          sampleTestCases: question.sampleTestCases,
          passedCount: state.passedCount,
          totalCount: state.totalCount,
          finalSubmissionId: state.lastSubmissionId,
          finalSubmissionLanguage: state.finalSubmissionLanguage,
          finalSubmissionStatus: state.finalSubmissionStatus,
          finalRuntimeMs: state.finalRuntimeMs,
          finalMemoryKb: state.finalMemoryKb,
        };
      }

      return {
        ...base,
        type: question.type,
        statement: question.statement,
        options: question.options,
        submittedAnswer: state.submittedAnswer,
        correctAnswer: question.type === "MCQ" ? question.correctAnswer : question.correctAnswers,
        isCorrect: state.isCorrect ?? false,
      };
    }),
  };
}

async function buildFacultyAttemptReview(
  contest: ContestRecord,
  attempt: ContestAttemptRecord,
  submissionRepository: SubmissionRepository,
): Promise<FacultyContestAttemptReview> {
  const submissions = await submissionRepository.list({
    contestId: contest.id,
    userEmail: attempt.userEmail,
  });

  const submissionsByQuestionId = new Map(
    submissions
      .filter((submission) => submission.contestQuestionId)
      .map((submission) => [submission.contestQuestionId!, submission]),
  );

  const questionReviews: FacultyContestAttemptQuestionReview[] = contest.questions.map((question, index) => {
    const state = attempt.questionStates.find((item) => item.questionId === question.id) ?? createDefaultQuestionState(question);
    const base = {
      questionId: question.id,
      questionNumber: index + 1,
      type: question.type,
      title: question.type === "Coding" ? question.problemTitle : question.statement,
      points: question.points,
      awardedPoints: state.awardedPoints,
      status: state.status,
      attemptsCount: state.attemptsCount,
    };

    if (question.type === "Coding") {
      const submission = submissionsByQuestionId.get(question.id) ?? null;
      return {
        ...base,
        type: "Coding",
        difficulty: question.difficulty,
        problemStatement: question.problemStatement,
        constraints: question.constraints,
        inputFormat: question.inputFormat,
        outputFormat: question.outputFormat,
        passedCount: state.passedCount,
        totalCount: state.totalCount,
        finalSubmissionId: state.lastSubmissionId,
        finalSubmissionLanguage: state.finalSubmissionLanguage,
        finalSubmissionStatus: state.finalSubmissionStatus,
        finalRuntimeMs: state.finalRuntimeMs,
        finalMemoryKb: state.finalMemoryKb,
        finalCode: submission?.code ?? null,
      };
    }

    return {
      ...base,
      type: question.type,
      statement: question.statement,
      options: question.options,
      submittedAnswer: state.submittedAnswer,
      correctAnswer: question.type === "MCQ" ? question.correctAnswer : question.correctAnswers,
      isCorrect: state.isCorrect,
    };
  });

  return {
    attemptId: attempt.id,
    contestId: contest.id,
    contestTitle: contest.title,
    student: {
      email: attempt.userEmail,
      name: attempt.userName,
      uid: attempt.userUid,
      department: attempt.userDepartment,
    },
    status: attempt.status,
    score: attempt.score,
    solvedCount: attempt.questionStates.filter((state) => state.status === "SOLVED").length,
    violationCount: attempt.violationCount,
    violationPenaltyPoints: attempt.violationPenaltyPoints,
    timeTakenMs: attempt.timeTakenMs,
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    autoSubmittedAt: attempt.autoSubmittedAt?.toISOString() ?? null,
    questionReviews,
  };
}

/**
 * Returns the caller's attempt only while it is both ACTIVE and inside its own deadline. An attempt
 * whose deadline has passed is finalised in place (as of the deadline, not "now") so an abandoned
 * tab can never keep scoring after the student's time ran out.
 */
async function resolveAttemptWithinDeadline(
  contestId: string,
  userEmail: string,
  now: Date,
  dependencies: ContestServiceDependencies,
): Promise<ContestAttemptRecord> {
  const attempt = ensureActiveAttempt(
    await dependencies.contestAttemptRepository.getByContestAndUser(contestId, userEmail),
  );

  if (now.getTime() <= attempt.deadlineAt.getTime()) {
    return attempt;
  }

  await dependencies.contestAttemptRepository.save(
    withDerivedAttemptFields({
      ...attempt,
      status: "AUTO_SUBMITTED",
      autoSubmittedAt: attempt.deadlineAt,
      submittedAt: attempt.submittedAt ?? attempt.deadlineAt,
      updatedAt: now,
    }),
  );

  throw new AppError(409, "Your contest time is over and the attempt was submitted automatically");
}

async function buildRegistrationItems(
  contestId: string,
  dependencies: ContestServiceDependencies,
): Promise<ContestRegistrationItem[]> {
  const [registrations, attempts] = await Promise.all([
    dependencies.contestRegistrationRepository.listByContest(contestId),
    dependencies.contestAttemptRepository.listByContest(contestId),
  ]);
  const attemptsByEmail = new Map(attempts.map((attempt) => [attempt.userEmail, attempt]));

  const items = await Promise.all(
    registrations.map(async (registration) => {
      const userRecord = await dependencies.userRepository.getByEmail(registration.userEmail);
      return toContestRegistrationItem(
        registration,
        attemptsByEmail.get(registration.userEmail) ?? null,
        userRecord?.semester ? (Math.ceil(userRecord.semester / 2) as StudentYear) : null,
      );
    }),
  );

  return items.sort((left, right) => left.registeredAt.localeCompare(right.registeredAt));
}

function toCsvValue(value: string | number | null): string {
  const normalized = value === null ? "" : String(value);
  if (normalized.includes(",") || normalized.includes("\"") || normalized.includes("\n")) {
    return `"${normalized.replace(/"/g, "\"\"")}"`;
  }

  return normalized;
}

export function createContestService(dependencies: ContestServiceDependencies): ContestService {
  return {
    async listContests(user, query) {
      const contests = await dependencies.contestRepository.list();
      const perContestEntries = await Promise.all(
        contests.map(async (contest) => {
          const [attempts, registrations] = await Promise.all([
            dependencies.contestAttemptRepository.listByContest(contest.id),
            dependencies.contestRegistrationRepository.listByContest(contest.id),
          ]);
          return [contest.id, { attempts, registrations }] as const;
        }),
      );
      const perContest = new Map(perContestEntries);
      const now = dependencies.now();
      const userDepartment =
        user.role === "STUDENT" ? await resolveStudentDepartment(user, dependencies) : null;

      const visible = contests
        .filter((contest) => (user.role === "FACULTY" ? contest.createdBy === user.email : true))
        .filter((contest) =>
          user.role === "STUDENT" ? !contest.targetDepartment || contest.targetDepartment === userDepartment : true,
        )
        .filter((contest) => (query.department ? contest.targetDepartment === query.department : true))
        .sort((left, right) => right.startAt.getTime() - left.startAt.getTime())
        .map((contest) => {
          const { attempts, registrations } = perContest.get(contest.id) ?? { attempts: [], registrations: [] };
          const studentAttempt =
            user.role === "STUDENT" ? attempts.find((attempt) => attempt.userEmail === user.email) ?? null : null;
          const isRegistered =
            user.role === "STUDENT" && registrations.some((registration) => registration.userEmail === user.email);
          return toContestListItem(
            contest,
            deriveParticipantsCount(attempts),
            now,
            studentAttempt,
            isRegistered,
            registrations.length,
          );
        });

      return paginateArray(visible, query);
    },

    async getContestById(user, contestId) {
      const contest = await dependencies.contestRepository.getById(contestId);
      const now = dependencies.now();

      if (user.role === "FACULTY") {
        const ownedContest = ensureFacultyOwnsContest(user, contest);
        const registrations = await dependencies.contestRegistrationRepository.listByContest(contestId);
        return toFacultyContestDetailResponse(ownedContest, now, registrations.length);
      }

      const visibleContest = ensureStudentCanAccessContest(
        contest,
        await resolveStudentDepartment(user, dependencies),
      );
      const [attempt, registrations] = await Promise.all([
        dependencies.contestAttemptRepository.getByContestAndUser(contestId, user.email),
        dependencies.contestRegistrationRepository.listByContest(contestId),
      ]);
      const contestEnded = computeContestStatus(visibleContest, now) === "Ended";
      const standings =
        visibleContest.resultsPublished
          ? (await dependencies.contestAttemptRepository.listByContest(contestId)).sort(sortStandings).map((item, index) => toContestStandingItem(item, index + 1))
          : [];
      const report = visibleContest.resultsPublished || contestEnded ? buildStudentReport(visibleContest, attempt, standings) : null;
      return toStudentContestDetailResponse(
        visibleContest,
        attempt,
        now,
        report,
        registrations.some((registration) => registration.userEmail === user.email),
        registrations.length,
      );
    },

    async createContest(user, input) {
      const now = dependencies.now();
      const startAt = new Date(input.startTime);
      const endAt = new Date(input.endTime);
      const contest: ContestRecord = {
        id: `contest_${randomUUID()}`,
        title: input.title.trim(),
        startAt,
        endAt,
        durationMinutes: Number(input.duration),
        // Default window: open immediately, close when the contest starts.
        registrationOpenAt: input.registrationOpenAt ? new Date(input.registrationOpenAt) : now,
        registrationCloseAt: input.registrationCloseAt ? new Date(input.registrationCloseAt) : startAt,
        type: input.type,
        lifecycleState: "Published",
        resultsPublished: false,
        targetDepartment: normalizeDepartment(input.targetDepartment) ?? null,
        maxViolations: input.maxViolations ?? 3,
        createdBy: user.email,
        createdByRole: user.role,
        questions: normalizeContestQuestions(input.questions) ?? [],
        createdAt: now,
        updatedAt: now,
      };

      await dependencies.contestRepository.save(contest);
      return toFacultyContestDetailResponse(contest, now, 0);
    },

    async updateContest(user, contestId, input) {
      const contest = ensureFacultyOwnsContest(user, await dependencies.contestRepository.getById(contestId));
      const now = dependencies.now();
      const updatedContest: ContestRecord = {
        ...contest,
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.startTime !== undefined ? { startAt: new Date(input.startTime) } : {}),
        ...(input.endTime !== undefined ? { endAt: new Date(input.endTime) } : {}),
        ...(input.duration !== undefined ? { durationMinutes: Number(input.duration) } : {}),
        ...(input.registrationOpenAt !== undefined ? { registrationOpenAt: new Date(input.registrationOpenAt) } : {}),
        ...(input.registrationCloseAt !== undefined ? { registrationCloseAt: new Date(input.registrationCloseAt) } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        lifecycleState: "Published",
        ...(input.targetDepartment !== undefined ? { targetDepartment: normalizeDepartment(input.targetDepartment) ?? null } : {}),
        ...(input.maxViolations !== undefined ? { maxViolations: input.maxViolations } : {}),
        ...(input.questions !== undefined ? { questions: normalizeContestQuestions(input.questions) ?? contest.questions } : {}),
        updatedAt: now,
      };

      // A partial update only validates the fields it carries, so re-check the merged window here.
      ensureCoherentContestWindow(updatedContest);

      await dependencies.contestRepository.save(updatedContest);
      return toFacultyContestDetailResponse(
        updatedContest,
        now,
        (await dependencies.contestRegistrationRepository.listByContest(contestId)).length,
      );
    },

    async updateContestResults(user, contestId, input) {
      const contest = ensureFacultyOwnsContest(user, await dependencies.contestRepository.getById(contestId));
      const now = dependencies.now();
      if (input.resultsPublished) {
        ensureContestHasEnded(contest, now);
      }
      const updatedContest: ContestRecord = {
        ...contest,
        resultsPublished: input.resultsPublished,
        updatedAt: now,
      };

      await dependencies.contestRepository.save(updatedContest);
      return toFacultyContestDetailResponse(
        updatedContest,
        now,
        (await dependencies.contestRegistrationRepository.listByContest(contestId)).length,
      );
    },

    async registerForContest(user, contestId) {
      const now = dependencies.now();
      const contest = ensureStudentCanAccessContest(
        await dependencies.contestRepository.getById(contestId),
        await resolveStudentDepartment(user, dependencies),
      );

      const existing = await dependencies.contestRegistrationRepository.getByContestAndUser(contestId, user.email);
      if (existing) {
        return existing;
      }

      ensureRegistrationOpen(contest, now);

      const currentUser = await dependencies.userRepository.getByEmail(user.email);
      const registration: ContestRegistrationRecord = {
        id: `registration_${randomUUID()}`,
        contestId: contest.id,
        userEmail: user.email,
        userName: currentUser?.name ?? user.name ?? null,
        userUid: currentUser?.uid ?? user.uid ?? null,
        userDepartment: currentUser?.department ?? normalizeDepartment(user.department) ?? null,
        registeredAt: now,
      };

      await dependencies.contestRegistrationRepository.save(registration);
      return registration;
    },

    async unregisterFromContest(user, contestId) {
      const now = dependencies.now();
      const contest = ensureStudentCanAccessContest(
        await dependencies.contestRepository.getById(contestId),
        await resolveStudentDepartment(user, dependencies),
      );
      const registration = await dependencies.contestRegistrationRepository.getByContestAndUser(contestId, user.email);
      if (!registration) {
        return;
      }

      const attempt = await dependencies.contestAttemptRepository.getByContestAndUser(contestId, user.email);
      if (attempt) {
        throw new AppError(409, "You cannot withdraw after starting the contest");
      }

      ensureRegistrationOpen(contest, now);
      await dependencies.contestRegistrationRepository.delete(contestId, user.email);
    },

    async listRegistrations(user, contestId) {
      ensureFacultyOwnsContest(user, await dependencies.contestRepository.getById(contestId));
      return buildRegistrationItems(contestId, dependencies);
    },

    async exportRegistrationsCsv(user, contestId) {
      ensureFacultyOwnsContest(user, await dependencies.contestRepository.getById(contestId));
      const items = await buildRegistrationItems(contestId, dependencies);
      const header = [
        "student_name",
        "student_uid",
        "student_email",
        "department",
        "year",
        "registered_at",
        "attempt_status",
      ];
      const rows = items.map((item) => [
        item.userName,
        item.userUid,
        item.userEmail,
        item.userDepartment,
        item.year,
        item.registeredAt,
        item.attemptStatus,
      ]);

      return [header, ...rows]
        .map((row) => row.map((value) => toCsvValue(value as string | number | null)).join(","))
        .join("\n");
    },

    async startAttempt(user, contestId) {
      const now = dependencies.now();
      const contest = ensureStudentCanAccessContest(
        await dependencies.contestRepository.getById(contestId),
        await resolveStudentDepartment(user, dependencies),
      );
      ensureContestIsLive(contest, now);
      ensureStudentIsRegistered(
        await dependencies.contestRegistrationRepository.getByContestAndUser(contestId, user.email),
      );

      const existing = await dependencies.contestAttemptRepository.getByContestAndUser(contestId, user.email);
      if (existing) {
        return existing;
      }

      const currentUser = await dependencies.userRepository.getByEmail(user.email);
      const attempt = withDerivedAttemptFields({
        id: `attempt_${randomUUID()}`,
        contestId: contest.id,
        contestTitleSnapshot: contest.title,
        userEmail: user.email,
        userName: currentUser?.name ?? user.name ?? null,
        userUid: currentUser?.uid ?? user.uid ?? null,
        userDepartment: currentUser?.department ?? normalizeDepartment(user.department) ?? null,
        status: "ACTIVE",
        score: 0,
        violationCount: 0,
        violationPenaltyPoints: 0,
        timeTakenMs: null,
        questionStates: buildAttemptQuestionStates(contest.questions),
        startedAt: now,
        deadlineAt: computeAttemptDeadline(contest, now),
        updatedAt: now,
        submittedAt: null,
        autoSubmittedAt: null,
        lastSolvedAt: null,
      });

      await dependencies.contestAttemptRepository.save(attempt);
      return attempt;
    },

    async submitAttempt(user, contestId) {
      const attempt = ensureActiveAttempt(await dependencies.contestAttemptRepository.getByContestAndUser(contestId, user.email));
      const now = dependencies.now();
      const updatedAttempt = withDerivedAttemptFields({
        ...attempt,
        status: "SUBMITTED",
        submittedAt: now,
        updatedAt: now,
      });
      await dependencies.contestAttemptRepository.save(updatedAttempt);
      return updatedAttempt;
    },

    async recordProctorEvent(user, contestId, type, details) {
      const now = dependencies.now();
      const contest = ensureStudentCanAccessContest(
        await dependencies.contestRepository.getById(contestId),
        await resolveStudentDepartment(user, dependencies),
      );
      const attempt = ensureActiveAttempt(await dependencies.contestAttemptRepository.getByContestAndUser(contestId, user.email));

      // Every event is logged for faculty review; only scored ones move the counter, and reaching
      // the contest's threshold ends the attempt.
      const isScored = isViolationEvent(type);
      const nextViolationCount = isScored ? attempt.violationCount + 1 : attempt.violationCount;
      const shouldAutoSubmit = isScored && nextViolationCount >= contest.maxViolations;
      const updatedAttempt = withDerivedAttemptFields({
        ...attempt,
        violationCount: nextViolationCount,
        status: shouldAutoSubmit ? "AUTO_SUBMITTED" : attempt.status,
        autoSubmittedAt: shouldAutoSubmit ? now : attempt.autoSubmittedAt,
        submittedAt: shouldAutoSubmit ? now : attempt.submittedAt,
        updatedAt: now,
      });

      await dependencies.contestProctoringRepository.create({
        id: `proctor_${randomUUID()}`,
        contestId,
        attemptId: attempt.id,
        userEmail: user.email,
        type,
        createdAt: now,
        details,
      });
      await dependencies.contestAttemptRepository.save(updatedAttempt);
      return updatedAttempt;
    },

    async getQuestionById(user, contestId, questionId) {
      const now = dependencies.now();
      const contest = ensureStudentCanAccessContest(
        await dependencies.contestRepository.getById(contestId),
        await resolveStudentDepartment(user, dependencies),
      );
      const status = computeContestStatus(contest, now);
      if (status === "Upcoming") {
        throw new AppError(409, "Contest questions are not available yet");
      }
      // Live contests require an active attempt that still has time left; ended contests open in
      // practice mode where any (or no) attempt is fine — the envelope mapper accepts a null attempt.
      const attempt =
        status === "Live"
          ? await resolveAttemptWithinDeadline(contestId, user.email, now, dependencies)
          : await dependencies.contestAttemptRepository.getByContestAndUser(contestId, user.email);
      const question = ensureContestQuestion(contest, questionId);
      return toStudentContestQuestionEnvelope(contest, question, attempt, now);
    },

    async answerObjectiveQuestion(user, contestId, input) {
      const now = dependencies.now();
      const contest = ensureStudentCanAccessContest(
        await dependencies.contestRepository.getById(contestId),
        await resolveStudentDepartment(user, dependencies),
      );
      ensureContestIsLive(contest, now);
      const attempt = await resolveAttemptWithinDeadline(contestId, user.email, now, dependencies);
      const question = ensureContestQuestion(contest, input.questionId);

      if (question.type === "Coding") {
        throw new AppError(400, "Use coding submission endpoint for coding questions");
      }

      const state = attempt.questionStates.find((item) => item.questionId === question.id);
      if (!state) {
        throw new AppError(404, "Contest question state not found");
      }

      if (state.status === "SOLVED") {
        return attempt;
      }

      const isCorrect = isCorrectObjectiveAnswer(question, input.answer);
      const questionStates = updateQuestionState(attempt, question.id, (current) => ({
        ...current,
        status: isCorrect ? "SOLVED" : "ATTEMPTED",
        attemptsCount: current.attemptsCount + 1,
        awardedPoints: isCorrect ? question.points : current.awardedPoints,
        submittedAnswer: input.answer,
        isCorrect,
        solvedAt: isCorrect ? now : current.solvedAt,
      }));

      const updatedAttempt = withDerivedAttemptFields({
        ...attempt,
        lastSolvedAt: isCorrect ? now : attempt.lastSolvedAt,
        questionStates,
        updatedAt: now,
      });

      await dependencies.contestAttemptRepository.save(updatedAttempt);
      return updatedAttempt;
    },

    async runCodingQuestion(user, contestId, input) {
      const now = dependencies.now();
      const contest = ensureStudentCanAccessContest(
        await dependencies.contestRepository.getById(contestId),
        await resolveStudentDepartment(user, dependencies),
      );
      const status = computeContestStatus(contest, now);
      if (status === "Upcoming") {
        throw new AppError(409, "Contest is not live yet");
      }
      if (status === "Live") {
        await resolveAttemptWithinDeadline(contestId, user.email, now, dependencies);
      }
      const question = ensureContestQuestion(contest, input.questionId);

      if (question.type !== "Coding") {
        throw new AppError(400, "Question does not accept code execution");
      }

      const result = await dependencies.executionProvider.executeRun({
        code: wrapSubmissionCode(input.language, input.code),
        language: input.language,
        testCases: question.sampleTestCases,
        problemId: `${contest.id}:${question.id}`,
        timeLimitSeconds: question.timeLimitSeconds,
        memoryLimitMb: question.memoryLimitMb,
      });

      return {
        problemId: question.id,
        language: input.language,
        status: result.status,
        runtimeMs: result.runtimeMs,
        memoryKb: result.memoryKb,
        passedCount: result.passedCount,
        totalCount: result.totalCount,
        executionProvider: result.provider,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    },

    async submitCodingQuestion(user, contestId, input) {
      const now = dependencies.now();
      const contest = ensureStudentCanAccessContest(
        await dependencies.contestRepository.getById(contestId),
        await resolveStudentDepartment(user, dependencies),
      );
      const status = computeContestStatus(contest, now);
      if (status === "Upcoming") {
        throw new AppError(409, "Contest is not live yet");
      }
      const question = ensureContestQuestion(contest, input.questionId);

      if (question.type !== "Coding") {
        throw new AppError(400, "Question does not accept code submissions");
      }

      if (status === "Ended") {
        const result = await dependencies.executionProvider.executeSubmission({
          code: wrapSubmissionCode(input.language, input.code),
          language: input.language,
          testCases: [...question.sampleTestCases, ...question.hiddenTestCases],
          problemId: `${contest.id}:${question.id}:practice`,
          timeLimitSeconds: question.timeLimitSeconds,
          memoryLimitMb: question.memoryLimitMb,
        });

        return {
          submissionId: `practice_${randomUUID()}`,
          status: result.status,
          practiceMode: true,
          runtimeMs: result.runtimeMs,
          memoryKb: result.memoryKb,
          passedCount: result.passedCount,
          totalCount: result.totalCount,
          stdout: result.stdout,
          stderr: result.stderr,
        };
      }

      const attempt = await resolveAttemptWithinDeadline(contestId, user.email, now, dependencies);

      const state = attempt.questionStates.find((item) => item.questionId === question.id);
      if (!state) {
        throw new AppError(404, "Contest question state not found");
      }
      if (state.hasFinalCodingSubmission) {
        throw new AppError(409, "Final submission has already been used for this coding question");
      }

      const userRecord = await dependencies.userRepository.getByEmail(user.email);
      const submissionId = `submission_${randomUUID()}`;
      await dependencies.submissionRepository.create({
        id: submissionId,
        queueJobId: null,
        judge0Token: null,
        sourceType: "contest_coding",
        userEmail: user.email,
        userRole: user.role,
        userDepartment: userRecord?.department ?? normalizeDepartment(user.department) ?? null,
        resourceOwnerEmail: contest.createdBy,
        resourceTargetDepartment: contest.targetDepartment,
        problemId: question.id,
        problemTitleSnapshot: question.problemTitle,
        problemDifficultySnapshot: question.difficulty,
        contestId: contest.id,
        contestTitleSnapshot: contest.title,
        contestQuestionId: question.id,
        code: input.code,
        language: input.language,
        status: "QUEUED",
        runtimeMs: 0,
        memoryKb: 0,
        passedCount: 0,
        totalCount: question.sampleTestCases.length + question.hiddenTestCases.length,
        executionProvider: "judge0",
        ratingAwarded: 0,
        stdout: null,
        stderr: null,
        createdAt: now,
        updatedAt: now,
        judgedAt: null,
        finalizationAppliedAt: null,
      });
      try {
        const queueJobId = await dependencies.submissionQueue.enqueue(submissionId);
        await dependencies.submissionRepository.save({
          ...(await dependencies.submissionRepository.getById(submissionId))!,
          queueJobId,
          updatedAt: dependencies.now(),
        });
      } catch (error) {
        const persisted = await dependencies.submissionRepository.getById(submissionId);
        if (persisted) {
          await dependencies.submissionRepository.save({
            ...persisted,
            status: "INTERNAL_ERROR",
            stderr: error instanceof Error ? error.message : "Failed to queue contest submission",
            updatedAt: dependencies.now(),
            judgedAt: dependencies.now(),
            finalizationAppliedAt: dependencies.now(),
          });
        }
        throw new AppError(500, "Failed to queue contest submission");
      }

      const questionStates = updateQuestionState(attempt, question.id, (current) => ({
        ...current,
        status: "ATTEMPTED",
        attemptsCount: current.attemptsCount + 1,
        lastSubmissionId: submissionId,
        totalCount: question.sampleTestCases.length + question.hiddenTestCases.length,
        hasFinalCodingSubmission: true,
        finalSubmissionLanguage: input.language,
        finalSubmissionStatus: "QUEUED",
        finalRuntimeMs: 0,
        finalMemoryKb: 0,
      }));

      const updatedAttempt = withDerivedAttemptFields({
        ...attempt,
        questionStates,
        updatedAt: now,
      });

      await dependencies.contestAttemptRepository.save(updatedAttempt);
      return {
        submissionId,
        status: "QUEUED",
      };
    },

    async getStandings(user, contestId, query = {}) {
      const contest = await dependencies.contestRepository.getById(contestId);
      if (user.role === "FACULTY") {
        ensureFacultyOwnsContest(user, contest);
      } else {
        const visibleContest = ensureStudentCanAccessContest(
          contest,
          await resolveStudentDepartment(user, dependencies),
        );
        ensureStudentCanViewStandings(visibleContest);
      }

      const attempts = await dependencies.contestAttemptRepository.listByContest(contestId);
      const userRecords = await Promise.all(
        attempts.map(async (attempt) => ({
          attempt,
          user: await dependencies.userRepository.getByEmail(attempt.userEmail),
        })),
      );
      return userRecords
        .filter(({ attempt }) => (query.department ? attempt.userDepartment === query.department : true))
        .filter(({ user }) => matchesStudentYearSemester(user?.semester, query.year))
        .map(({ attempt, user }) => ({
          attempt,
          year: user?.semester ? (Math.ceil(user.semester / 2) as StudentYear) : null,
        }))
        .sort((left, right) => sortStandings(left.attempt, right.attempt))
        .map(({ attempt, year }, index) => toContestStandingItem(attempt, index + 1, year));
    },

    async exportStandingsCsv(user, contestId, query = {}) {
      const contest = ensureFacultyOwnsContest(user, await dependencies.contestRepository.getById(contestId));
      const attempts = await dependencies.contestAttemptRepository.listByContest(contestId);
      const userRecords = await Promise.all(
        attempts.map(async (attempt) => ({
          attempt,
          user: await dependencies.userRepository.getByEmail(attempt.userEmail),
        })),
      );
      const filteredAttempts = userRecords
        .filter(({ attempt }) => (query.department ? attempt.userDepartment === query.department : true))
        .filter(({ user }) => matchesStudentYearSemester(user?.semester, query.year))
        .map(({ attempt, user }) => ({
          attempt,
          year: user?.semester ? (Math.ceil(user.semester / 2) as StudentYear) : null,
        }))
        .sort((left, right) => sortStandings(left.attempt, right.attempt));
      const rows = filteredAttempts.map(({ attempt }, index) => {
        const solvedCount = attempt.questionStates.filter((state) => state.status === "SOLVED").length;
        return [
          index + 1,
          attempt.userName,
          attempt.userUid,
          attempt.userEmail,
          attempt.userDepartment,
          attempt.status,
          attempt.score,
          attempt.timeTakenMs,
          solvedCount,
          attempt.violationCount,
          attempt.violationPenaltyPoints,
          attempt.submittedAt?.toISOString() ?? "",
          attempt.autoSubmittedAt?.toISOString() ?? "",
        ];
      });

      const header = [
        "rank",
        "student_name",
        "student_uid",
        "student_email",
        "department",
        "attempt_status",
        "score",
        "time_taken_ms",
        "solved_count",
        "violations",
        "violation_penalty_points",
        "submitted_at",
        "auto_submitted_at",
      ];

      const csv = [header, ...rows].map((row) => row.map((value) => toCsvValue(value as string | number | null)).join(",")).join("\n");
      return csv;
    },

    async listAttempts(user, contestId) {
      ensureFacultyOwnsContest(user, await dependencies.contestRepository.getById(contestId));
      const attempts = await dependencies.contestAttemptRepository.listByContest(contestId);
      return attempts.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()).map(toContestAttemptSummary);
    },

    async getAttemptReview(user, contestId, attemptId) {
      const contest = ensureFacultyOwnsContest(user, await dependencies.contestRepository.getById(contestId));
      const attempt = await dependencies.contestAttemptRepository.getById(attemptId);
      if (!attempt || attempt.contestId !== contest.id) {
        throw new AppError(404, "Contest attempt not found");
      }

      return buildFacultyAttemptReview(contest, attempt, dependencies.submissionRepository);
    },
  };
}
