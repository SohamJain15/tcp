import { randomUUID } from "node:crypto";
import { DEFAULT_PROBLEM_MEMORY_LIMIT_MB, DEFAULT_PROBLEM_TIME_LIMIT_SECONDS } from "../../shared/constants/domain";
import { AppError } from "../../shared/errors/app-error";
import type { AuthenticatedUser } from "../../shared/types/auth";
import type { UserRepository } from "../user/user.repository";
import type { SubmissionRepository } from "../submission/submission.repository";
import {
  classTestTotalPoints,
  computeClassTestEndAt,
  computeClassTestStatus,
  isAssignedToClassTest,
  matchesAudienceFilter,
  scoreObjectiveAnswer,
  toAssignedStudent,
  toStudentQuestion,
  type AssignedStudent,
  type ClassTestAttemptRecord,
  type ClassTestAudienceFilter,
  type ClassTestQuestion,
  type ClassTestRecord,
  type StudentClassTestQuestion,
} from "./classtest.model";
import type {
  ClassTestAttemptRepository,
  ClassTestProctoringRepository,
  ClassTestRepository,
} from "./classtest.repository";
import type {
  AudiencePreviewInput,
  CreateClassTestInput,
  GradeShortAnswerInput,
  UpdateClassTestInput,
} from "./classtest.validator";

/**
 * Evasions the browser cannot hard-block, so they count against the student. Clipboard and
 * context-menu attempts are logged for review but cost nothing — the browser already stopped
 * them, so the student gained no advantage.
 */
const SCORED_VIOLATIONS = new Set(["TAB_SWITCH", "VISIBILITY_LOSS", "FULLSCREEN_EXIT", "PRINT_SCREEN"]);

/**
 * Faculty-facing Class Test management.
 *
 * There is deliberately no ranking anywhere in this service — no standings, no rank, no
 * ordering of students by score. A CT is an assessment of individuals, not a competition.
 */

export interface ClassTestSummary {
  id: string;
  title: string;
  subject: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  computedStatus: string;
  lifecycleState: string;
  resultsPublished: boolean;
  questionCount: number;
  totalPoints: number;
  assignedCount: number;
  /** Only meaningful once students have started; kept off the student-facing shape. */
  attemptedCount?: number;
}

export interface AudiencePreviewItem extends AssignedStudent {
  semester: number | null;
}

/** A test as an assigned student sees it in their list / banner. */
export interface StudentClassTestSummary {
  id: string;
  title: string;
  subject: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  computedStatus: string;
  questionCount: number;
  totalPoints: number;
  attemptStatus: "NOT_STARTED" | "ACTIVE" | "SUBMITTED" | "AUTO_SUBMITTED";
  resultsPublished: boolean;
}

export interface StudentClassTestDetail extends StudentClassTestSummary {
  instructions: string | null;
  /** Empty until the test is live — an assigned student must not read the paper early. */
  questions: StudentClassTestQuestion[];
  /** Prefilled from the verified profile for the identity confirmation screen. */
  identity: { name: string | null; uid: string | null; rollNumber: string | null; division: string | null; department: string | null };
  answers: { questionId: string; submittedAnswer: string | string[] | null }[];
  deadlineAt: string | null;
}

export interface StudentClassTestResult {
  classTestId: string;
  title: string;
  subject: string;
  finalScore: number;
  totalPoints: number;
  questions: {
    questionId: string;
    statement: string;
    type: string;
    maxPoints: number;
    awardedPoints: number;
    submittedAnswer: string | string[] | null;
    graderNote: string | null;
  }[];
}

export interface ClassTestService {
  listForFaculty(user: AuthenticatedUser): Promise<ClassTestSummary[]>;
  getForFaculty(user: AuthenticatedUser, classTestId: string): Promise<ClassTestRecord>;
  previewAudience(user: AuthenticatedUser, filter: AudiencePreviewInput): Promise<AudiencePreviewItem[]>;
  createClassTest(user: AuthenticatedUser, input: CreateClassTestInput): Promise<ClassTestRecord>;
  updateClassTest(
    user: AuthenticatedUser,
    classTestId: string,
    input: UpdateClassTestInput,
  ): Promise<ClassTestRecord>;

  // --- student ---
  listAssigned(user: AuthenticatedUser): Promise<StudentClassTestSummary[]>;
  getForStudent(user: AuthenticatedUser, classTestId: string): Promise<StudentClassTestDetail>;
  startAttempt(user: AuthenticatedUser, classTestId: string): Promise<StudentClassTestDetail>;
  saveAnswer(
    user: AuthenticatedUser,
    classTestId: string,
    questionId: string,
    answer: string | string[],
  ): Promise<void>;
  submitAttempt(user: AuthenticatedUser, classTestId: string): Promise<void>;
  recordProctorEvent(user: AuthenticatedUser, classTestId: string, type: string): Promise<{ autoSubmitted: boolean; violationCount: number }>;
  getStudentResult(user: AuthenticatedUser, classTestId: string): Promise<StudentClassTestResult>;

  // --- grading ---
  listAttemptsForFaculty(user: AuthenticatedUser, classTestId: string): Promise<FacultyAttemptSummary[]>;
  getAttemptForGrading(user: AuthenticatedUser, classTestId: string, attemptId: string): Promise<FacultyAttemptDetail>;
  gradeShortAnswer(
    user: AuthenticatedUser,
    classTestId: string,
    attemptId: string,
    input: GradeShortAnswerInput,
  ): Promise<FacultyAttemptDetail>;
  publishResults(user: AuthenticatedUser, classTestId: string, published: boolean): Promise<ClassTestRecord>;
}

export interface FacultyAttemptSummary {
  attemptId: string;
  email: string;
  name: string | null;
  uid: string | null;
  rollNumber: string | null;
  division: string | null;
  status: string;
  violationCount: number;
  suspectedMalpractice: boolean;
  gradingStatus: string;
  /** Withheld while the test is still running — see the visibility rule in the plan. */
  autoScore: number | null;
  manualScore: number | null;
  finalScore: number | null;
  timeTakenMs: number | null;
}

export interface FacultyAttemptDetail extends FacultyAttemptSummary {
  answers: {
    questionId: string;
    type: string;
    statement: string;
    maxPoints: number;
    awardedPoints: number;
    submittedAnswer: string | string[] | null;
    /** Faculty-only reference while marking. */
    modelAnswer?: string;
    graderNote: string | null;
    requiresManualGrading: boolean;
  }[];
}

interface ClassTestServiceDependencies {
  classTestRepository: ClassTestRepository;
  classTestAttemptRepository: ClassTestAttemptRepository;
  classTestProctoringRepository: ClassTestProctoringRepository;
  userRepository: UserRepository;
  /** Read-only: coding marks are taken from the final judged verdict at scoring time. */
  submissionRepository: SubmissionRepository;
  now: () => Date;
}

/**
 * A faculty may manage a test they created, or one delegated to them.
 *
 * Returns 404 rather than 403 for someone else's test, matching the convention used by
 * problems and contests: the response must not confirm that the test exists.
 */
function ensureFacultyCanManage(user: AuthenticatedUser, test: ClassTestRecord | null): ClassTestRecord {
  const canManage =
    test !== null && (test.createdBy === user.email || test.managerEmails.includes(user.email));
  if (!canManage) {
    throw new AppError(404, "Class test not found");
  }
  return test;
}

function toSummary(test: ClassTestRecord, now: Date, attemptedCount?: number): ClassTestSummary {
  return {
    id: test.id,
    title: test.title,
    subject: test.subject,
    startAt: test.startAt.toISOString(),
    endAt: computeClassTestEndAt(test).toISOString(),
    durationMinutes: test.durationMinutes,
    computedStatus: computeClassTestStatus(test, now),
    lifecycleState: test.lifecycleState,
    resultsPublished: test.resultsPublished,
    questionCount: test.questions.length,
    totalPoints: classTestTotalPoints(test.questions),
    assignedCount: test.assignedStudents.length,
    ...(attemptedCount === undefined ? {} : { attemptedCount }),
  };
}

/** Gives every question a stable id, since ids anchor answers and grading. */
function normalizeQuestions(questions: CreateClassTestInput["questions"]): ClassTestQuestion[] {
  return questions.map((question) => {
    const id = question.id?.trim() || `q_${randomUUID()}`;
    if (question.type === "Coding") {
      return {
        ...question,
        id,
        timeLimitSeconds: question.timeLimitSeconds ?? DEFAULT_PROBLEM_TIME_LIMIT_SECONDS,
        memoryLimitMb: question.memoryLimitMb ?? DEFAULT_PROBLEM_MEMORY_LIMIT_MB,
      } satisfies ClassTestQuestion;
    }
    return { ...question, id } satisfies ClassTestQuestion;
  });
}

export function createClassTestService(dependencies: ClassTestServiceDependencies): ClassTestService {
  /** Students matching the filter, in roll order so faculty can scan the list like a register. */
  async function resolveCandidates(filter: ClassTestAudienceFilter): Promise<AudiencePreviewItem[]> {
    if (filter.department === null) {
      return [];
    }
    const roster = await dependencies.userRepository.listByDepartment(filter.department, "STUDENT");
    return roster
      .filter((student) => matchesAudienceFilter(student, filter))
      .map((student) => ({ ...toAssignedStudent(student), semester: student.semester }))
      .sort((left, right) => Number(left.rollNumber ?? 0) - Number(right.rollNumber ?? 0));
  }

  /**
   * Turn the faculty's ticked emails into the frozen assignment list.
   *
   * Only students the filter actually returned can be assigned, so a crafted request cannot
   * pull in someone from another division or department. An empty tick list means "everyone
   * the filter found" — the common case of assigning a whole class.
   */
  async function resolveAssignment(
    filter: ClassTestAudienceFilter,
    assignedEmails: string[],
  ): Promise<AssignedStudent[]> {
    const candidates = await resolveCandidates(filter);
    if (candidates.length === 0) {
      throw new AppError(400, "No students match this department, division and roll range");
    }

    if (assignedEmails.length === 0) {
      return candidates.map(({ semester: _semester, ...student }) => student);
    }

    const wanted = new Set(assignedEmails.map((email) => email.trim().toLowerCase()));
    const selected = candidates.filter((student) => wanted.has(student.email.toLowerCase()));
    if (selected.length === 0) {
      throw new AppError(400, "None of the selected students match this department, division and roll range");
    }
    return selected.map(({ semester: _semester, ...student }) => student);
  }

  return {
    async listForFaculty(user) {
      const now = dependencies.now();
      const tests = (await dependencies.classTestRepository.list()).filter(
        (test) => test.createdBy === user.email || test.managerEmails.includes(user.email),
      );

      return Promise.all(
        tests
          .sort((left, right) => right.startAt.getTime() - left.startAt.getTime())
          .map(async (test) => {
            const attempts = await dependencies.classTestAttemptRepository.listByTest(test.id);
            return toSummary(test, now, attempts.length);
          }),
      );
    },

    async getForFaculty(user, classTestId) {
      return ensureFacultyCanManage(user, await dependencies.classTestRepository.getById(classTestId));
    },

    async previewAudience(_user, filter) {
      return resolveCandidates(filter);
    },

    async createClassTest(user, input) {
      const now = dependencies.now();
      const startAt = new Date(input.startAt);
      const assignedStudents = await resolveAssignment(input.audience, input.assignedEmails);

      const test: ClassTestRecord = {
        id: `classtest_${randomUUID()}`,
        title: input.title,
        subject: input.subject,
        instructions: input.instructions,
        createdBy: user.email,
        createdByRole: user.role,
        managerEmails: [],
        startAt,
        durationMinutes: input.durationMinutes,
        audience: input.audience,
        assignedStudents,
        maxViolations: input.maxViolations,
        questions: normalizeQuestions(input.questions),
        lifecycleState: input.lifecycleState,
        resultsPublished: false,
        createdAt: now,
        updatedAt: now,
      };

      await dependencies.classTestRepository.save(test);
      return test;
    },

    async updateClassTest(user, classTestId, input) {
      const existing = ensureFacultyCanManage(
        user,
        await dependencies.classTestRepository.getById(classTestId),
      );
      const now = dependencies.now();

      // Once anyone has started, the paper and the timing are settled — changing them
      // mid-test would mean different students sat different assessments.
      const attempts = await dependencies.classTestAttemptRepository.listByTest(classTestId);
      const hasStarted = attempts.length > 0;
      if (hasStarted && (input.questions || input.startAt || input.durationMinutes)) {
        throw new AppError(409, "Students have already started this test");
      }

      const audience = input.audience ?? existing.audience;
      let assignedStudents = existing.assignedStudents;
      if (input.audience || input.assignedEmails) {
        assignedStudents = await resolveAssignment(audience, input.assignedEmails ?? []);

        // Removing someone who is already writing would discard their work.
        const startedEmails = new Set(attempts.map((attempt) => attempt.userEmail.toLowerCase()));
        const stillAssigned = new Set(assignedStudents.map((student) => student.email.toLowerCase()));
        const dropped = [...startedEmails].filter((email) => !stillAssigned.has(email));
        if (dropped.length > 0) {
          throw new AppError(409, "Cannot un-assign a student who has already started the test");
        }
      }

      const updated: ClassTestRecord = {
        ...existing,
        title: input.title ?? existing.title,
        subject: input.subject ?? existing.subject,
        instructions: input.instructions === undefined ? existing.instructions : input.instructions,
        startAt: input.startAt ? new Date(input.startAt) : existing.startAt,
        durationMinutes: input.durationMinutes ?? existing.durationMinutes,
        audience,
        assignedStudents,
        maxViolations: input.maxViolations ?? existing.maxViolations,
        questions: input.questions ? normalizeQuestions(input.questions) : existing.questions,
        lifecycleState: input.lifecycleState ?? existing.lifecycleState,
        updatedAt: now,
      };

      await dependencies.classTestRepository.save(updated);
      return updated;
    },

    // --- student ------------------------------------------------------------

    async listAssigned(user) {
      const now = dependencies.now();
      const tests = (await dependencies.classTestRepository.list()).filter(
        (test) => test.lifecycleState === "Published" && isAssignedToClassTest(test, user.email),
      );

      return Promise.all(
        tests
          .sort((left, right) => left.startAt.getTime() - right.startAt.getTime())
          .map(async (test) => {
            const attempt = await dependencies.classTestAttemptRepository.getByTestAndUser(
              test.id,
              user.email,
            );
            return toStudentSummary(test, attempt?.status ?? "NOT_STARTED", now);
          }),
      );
    },

    async getForStudent(user, classTestId) {
      const { test, attempt } = await loadForStudent(user, classTestId);
      return buildStudentDetail(test, attempt, user, dependencies.now());
    },

    async startAttempt(user, classTestId) {
      const now = dependencies.now();
      const { test } = await loadForStudent(user, classTestId);

      const status = computeClassTestStatus(test, now);
      if (status === "Scheduled") {
        throw new AppError(409, "This test has not started yet");
      }
      if (status === "Ended") {
        throw new AppError(409, "This test has ended");
      }

      const existing = await dependencies.classTestAttemptRepository.getByTestAndUser(
        classTestId,
        user.email,
      );
      if (existing) {
        // Re-entering after a refresh must resume, never restart — and never extend the clock.
        return buildStudentDetail(test, existing, user, now);
      }

      const profile = await dependencies.userRepository.getByEmail(user.email);
      const assigned = test.assignedStudents.find(
        (student) => student.email.toLowerCase() === user.email.toLowerCase(),
      );

      const attempt: ClassTestAttemptRecord = {
        id: `ct_attempt_${randomUUID()}`,
        classTestId,
        userEmail: user.email,
        userName: profile?.name ?? assigned?.name ?? null,
        userUid: profile?.uid ?? assigned?.uid ?? null,
        userRollNumber: profile?.rollNumber ?? assigned?.rollNumber ?? null,
        userDivision: assigned?.division ?? null,
        userDepartment: profile?.department ?? null,
        status: "ACTIVE",
        questionStates: test.questions.map((question) => ({
          questionId: question.id,
          questionType: question.type,
          submittedAnswer: null,
          awardedPoints: 0,
          maxPoints: question.points,
          lastSubmissionId: null,
          finalSubmissionLanguage: null,
          finalSubmissionStatus: null,
          passedCount: 0,
          totalCount: 0,
          draftCode: null,
          draftLanguage: null,
          gradedBy: null,
          gradedAt: null,
          graderNote: null,
        })),
        autoScore: 0,
        manualScore: 0,
        finalScore: 0,
        gradingStatus: "PENDING",
        violationCount: 0,
        suspectedMalpractice: false,
        startedAt: now,
        // The shared deadline — identical for everyone, so a late start buys no extra time.
        deadlineAt: computeClassTestEndAt(test),
        submittedAt: null,
        autoSubmittedAt: null,
        timeTakenMs: null,
        createdAt: now,
        updatedAt: now,
      };

      await dependencies.classTestAttemptRepository.save(attempt);
      return buildStudentDetail(test, attempt, user, now);
    },

    async saveAnswer(user, classTestId, questionId, answer) {
      const now = dependencies.now();
      const { test, attempt } = await loadForStudent(user, classTestId);
      const live = ensureWritableAttempt(test, attempt, now);

      const question = test.questions.find((item) => item.id === questionId);
      if (!question) {
        throw new AppError(404, "Question not found");
      }
      if (question.type === "Coding") {
        throw new AppError(400, "Use the coding submission endpoint for coding questions");
      }

      // Saved verbatim — never scored here, so nothing can leak correctness during the test.
      const questionStates = live.questionStates.map((state) =>
        state.questionId === questionId ? { ...state, submittedAnswer: answer } : state,
      );

      await dependencies.classTestAttemptRepository.save({
        ...live,
        questionStates,
        updatedAt: now,
      });
    },

    async submitAttempt(user, classTestId) {
      const now = dependencies.now();
      const { test, attempt } = await loadForStudent(user, classTestId);
      const live = ensureWritableAttempt(test, attempt, now);

      await dependencies.classTestAttemptRepository.save({
        ...live,
        status: "SUBMITTED",
        submittedAt: now,
        timeTakenMs: now.getTime() - live.startedAt.getTime(),
        updatedAt: now,
      });
    },

    async recordProctorEvent(user, classTestId, type) {
      const now = dependencies.now();
      const { test, attempt } = await loadForStudent(user, classTestId);
      if (!attempt || attempt.status !== "ACTIVE") {
        throw new AppError(409, "No active attempt");
      }

      await dependencies.classTestProctoringRepository.create({
        id: `ct_proctor_${randomUUID()}`,
        classTestId,
        attemptId: attempt.id,
        userEmail: user.email,
        type,
        createdAt: now,
      });

      // Clipboard and context-menu attempts are logged but cost nothing: the browser already
      // blocked them, so the student gained nothing.
      if (!SCORED_VIOLATIONS.has(type)) {
        return { autoSubmitted: false, violationCount: attempt.violationCount };
      }

      const violationCount = attempt.violationCount + 1;
      const shouldAutoSubmit = violationCount >= test.maxViolations;

      await dependencies.classTestAttemptRepository.save({
        ...attempt,
        violationCount,
        suspectedMalpractice: attempt.suspectedMalpractice || shouldAutoSubmit,
        status: shouldAutoSubmit ? "AUTO_SUBMITTED" : attempt.status,
        autoSubmittedAt: shouldAutoSubmit ? now : attempt.autoSubmittedAt,
        timeTakenMs: shouldAutoSubmit ? now.getTime() - attempt.startedAt.getTime() : attempt.timeTakenMs,
        updatedAt: now,
      });

      return { autoSubmitted: shouldAutoSubmit, violationCount };
    },

    async getStudentResult(user, classTestId) {
      const { test, attempt } = await loadForStudent(user, classTestId);
      if (!test.resultsPublished) {
        throw new AppError(409, "Results are not published yet");
      }
      if (!attempt) {
        throw new AppError(404, "You did not attempt this test");
      }

      const byId = new Map(test.questions.map((question) => [question.id, question]));
      return {
        classTestId: test.id,
        title: test.title,
        subject: test.subject,
        finalScore: attempt.finalScore,
        totalPoints: classTestTotalPoints(test.questions),
        questions: attempt.questionStates.map((state) => {
          const question = byId.get(state.questionId);
          return {
            questionId: state.questionId,
            statement:
              question && question.type === "Coding" ? question.problemTitle : question?.statement ?? "",
            type: state.questionType,
            maxPoints: state.maxPoints,
            awardedPoints: state.awardedPoints,
            submittedAnswer: state.submittedAnswer,
            graderNote: state.graderNote,
          };
        }),
      };
    },

    // --- grading ------------------------------------------------------------

    async listAttemptsForFaculty(user, classTestId) {
      const now = dependencies.now();
      const test = ensureFacultyCanManage(
        user,
        await dependencies.classTestRepository.getById(classTestId),
      );
      const attempts = await dependencies.classTestAttemptRepository.listByTest(classTestId);
      const scoresVisible = computeClassTestStatus(test, now) === "Ended";

      return attempts
        .sort((left, right) => Number(left.userRollNumber ?? 0) - Number(right.userRollNumber ?? 0))
        .map((attempt) => toFacultyAttemptSummary(attempt, scoresVisible));
    },

    async getAttemptForGrading(user, classTestId, attemptId) {
      const now = dependencies.now();
      const test = ensureFacultyCanManage(
        user,
        await dependencies.classTestRepository.getById(classTestId),
      );
      const attempt = await dependencies.classTestAttemptRepository.getById(attemptId);
      if (!attempt || attempt.classTestId !== classTestId) {
        throw new AppError(404, "Attempt not found");
      }

      // Auto-scores are computed the first time the paper is opened after the test ends, so a
      // human never has to grade against a blank sheet.
      const scored = await ensureAutoScored(test, attempt, now);
      return toFacultyAttemptDetail(test, scored, computeClassTestStatus(test, now) === "Ended");
    },

    async gradeShortAnswer(user, classTestId, attemptId, input) {
      const now = dependencies.now();
      const test = ensureFacultyCanManage(
        user,
        await dependencies.classTestRepository.getById(classTestId),
      );
      if (computeClassTestStatus(test, now) !== "Ended") {
        throw new AppError(409, "Grading opens once the test has ended");
      }

      const attempt = await dependencies.classTestAttemptRepository.getById(attemptId);
      if (!attempt || attempt.classTestId !== classTestId) {
        throw new AppError(404, "Attempt not found");
      }

      const question = test.questions.find((item) => item.id === input.questionId);
      if (!question || question.type !== "ShortAnswer") {
        throw new AppError(400, "That question is not manually graded");
      }
      if (input.awardedPoints > question.points) {
        throw new AppError(400, `Maximum for this question is ${question.points}`);
      }

      const scored = await ensureAutoScored(test, attempt, now);
      const questionStates = scored.questionStates.map((state) =>
        state.questionId === input.questionId
          ? {
              ...state,
              awardedPoints: input.awardedPoints,
              gradedBy: user.email,
              gradedAt: now,
              graderNote: input.graderNote,
            }
          : state,
      );

      const updated = withTotals({ ...scored, questionStates, updatedAt: now }, test);
      await dependencies.classTestAttemptRepository.save(updated);
      return toFacultyAttemptDetail(test, updated, true);
    },

    async publishResults(user, classTestId, published) {
      const now = dependencies.now();
      const test = ensureFacultyCanManage(
        user,
        await dependencies.classTestRepository.getById(classTestId),
      );

      if (published) {
        if (computeClassTestStatus(test, now) !== "Ended") {
          throw new AppError(409, "Results can be published once the test has ended");
        }

        const attempts = await dependencies.classTestAttemptRepository.listByTest(classTestId);
        const scored = await Promise.all(attempts.map((attempt) => ensureAutoScored(test, attempt, now)));

        // Half-marked results must never go out: one ungraded written answer means every
        // student's total is still provisional.
        const ungraded = scored.filter((attempt) => attempt.gradingStatus !== "COMPLETE");
        if (ungraded.length > 0) {
          throw new AppError(
            409,
            `Grade every written answer first — ${ungraded.length} attempt(s) still pending`,
          );
        }
      }

      const updated: ClassTestRecord = { ...test, resultsPublished: published, updatedAt: now };
      await dependencies.classTestRepository.save(updated);
      return updated;
    },
  };

  // --- shared helpers -------------------------------------------------------

  /** Loads a test the caller is actually assigned to, or 404s without confirming it exists. */
  async function loadForStudent(
    user: AuthenticatedUser,
    classTestId: string,
  ): Promise<{ test: ClassTestRecord; attempt: ClassTestAttemptRecord | null }> {
    const test = await dependencies.classTestRepository.getById(classTestId);
    if (!test || test.lifecycleState !== "Published" || !isAssignedToClassTest(test, user.email)) {
      throw new AppError(404, "Class test not found");
    }
    const attempt = await dependencies.classTestAttemptRepository.getByTestAndUser(
      classTestId,
      user.email,
    );
    return { test, attempt };
  }

  function ensureWritableAttempt(
    test: ClassTestRecord,
    attempt: ClassTestAttemptRecord | null,
    now: Date,
  ): ClassTestAttemptRecord {
    if (!attempt) {
      throw new AppError(409, "Start the test first");
    }
    if (attempt.status !== "ACTIVE") {
      throw new AppError(409, "This attempt has already been submitted");
    }
    if (now.getTime() >= attempt.deadlineAt.getTime()) {
      throw new AppError(409, "The test has ended");
    }
    return attempt;
  }

  function toStudentSummary(
    test: ClassTestRecord,
    attemptStatus: StudentClassTestSummary["attemptStatus"],
    now: Date,
  ): StudentClassTestSummary {
    return {
      id: test.id,
      title: test.title,
      subject: test.subject,
      startAt: test.startAt.toISOString(),
      endAt: computeClassTestEndAt(test).toISOString(),
      durationMinutes: test.durationMinutes,
      computedStatus: computeClassTestStatus(test, now),
      questionCount: test.questions.length,
      totalPoints: classTestTotalPoints(test.questions),
      attemptStatus,
      resultsPublished: test.resultsPublished,
    };
  }

  async function buildStudentDetail(
    test: ClassTestRecord,
    attempt: ClassTestAttemptRecord | null,
    user: AuthenticatedUser,
    now: Date,
  ): Promise<StudentClassTestDetail> {
    const status = computeClassTestStatus(test, now);
    const profile = await dependencies.userRepository.getByEmail(user.email);
    const assigned = test.assignedStudents.find(
      (student) => student.email.toLowerCase() === user.email.toLowerCase(),
    );

    return {
      ...toStudentSummary(test, attempt?.status ?? "NOT_STARTED", now),
      instructions: test.instructions,
      // The paper stays sealed until the test is live, even for an assigned student.
      questions: status === "Live" && attempt ? test.questions.map(toStudentQuestion) : [],
      identity: {
        name: profile?.name ?? assigned?.name ?? null,
        uid: profile?.uid ?? assigned?.uid ?? null,
        rollNumber: profile?.rollNumber ?? assigned?.rollNumber ?? null,
        division: assigned?.division ?? null,
        department: profile?.department ?? null,
      },
      answers:
        attempt?.questionStates.map((state) => ({
          questionId: state.questionId,
          submittedAnswer: state.submittedAnswer,
        })) ?? [],
      deadlineAt: attempt?.deadlineAt.toISOString() ?? null,
    };
  }

  /**
   * Fill in the machine-markable scores once, after the test has ended.
   *
   * Never runs while the test is live, so no score exists to leak mid-test. Idempotent: it
   * recomputes objective marks from the saved answers and reads coding marks from the final
   * judged verdict, so calling it again cannot drift.
   */
  async function ensureAutoScored(
    test: ClassTestRecord,
    attempt: ClassTestAttemptRecord,
    now: Date,
  ): Promise<ClassTestAttemptRecord> {
    if (computeClassTestStatus(test, now) !== "Ended") {
      return attempt;
    }

    const byId = new Map(test.questions.map((question) => [question.id, question]));
    const questionStates = await Promise.all(
      attempt.questionStates.map(async (state) => {
        const question = byId.get(state.questionId);
        if (!question) {
          return state;
        }

        if (question.type === "MCQ" || question.type === "MSQ") {
          return { ...state, awardedPoints: scoreObjectiveAnswer(question, state.submittedAnswer) };
        }

        if (question.type === "Coding") {
          if (!state.lastSubmissionId) {
            return { ...state, awardedPoints: 0 };
          }
          const submission = await dependencies.submissionRepository.getById(state.lastSubmissionId);
          if (!submission || submission.totalCount === 0) {
            return { ...state, awardedPoints: 0 };
          }
          // Proportional to passed test cases, matching how contests score coding.
          const awarded = Math.round((question.points * submission.passedCount) / submission.totalCount);
          return {
            ...state,
            awardedPoints: Math.max(0, awarded),
            passedCount: submission.passedCount,
            totalCount: submission.totalCount,
            finalSubmissionStatus: submission.status,
            finalSubmissionLanguage: submission.language,
          };
        }

        // ShortAnswer keeps whatever a human awarded.
        return state;
      }),
    );

    const updated = withTotals({ ...attempt, questionStates, updatedAt: now }, test);
    const changed = JSON.stringify(updated.questionStates) !== JSON.stringify(attempt.questionStates)
      || updated.gradingStatus !== attempt.gradingStatus
      || updated.finalScore !== attempt.finalScore;
    if (changed) {
      await dependencies.classTestAttemptRepository.save(updated);
    }
    return updated;
  }

  /** Recomputes the three totals and the grading status from the question states. */
  function withTotals(attempt: ClassTestAttemptRecord, test: ClassTestRecord): ClassTestAttemptRecord {
    const byId = new Map(test.questions.map((question) => [question.id, question]));
    let autoScore = 0;
    let manualScore = 0;
    let shortAnswers = 0;
    let graded = 0;

    for (const state of attempt.questionStates) {
      const question = byId.get(state.questionId);
      if (!question) {
        continue;
      }
      if (question.type === "ShortAnswer") {
        shortAnswers += 1;
        if (state.gradedAt) {
          graded += 1;
          manualScore += state.awardedPoints;
        }
      } else {
        autoScore += state.awardedPoints;
      }
    }

    const gradingStatus =
      shortAnswers === 0 || graded === shortAnswers ? "COMPLETE" : graded === 0 ? "PENDING" : "PARTIAL";

    return { ...attempt, autoScore, manualScore, finalScore: autoScore + manualScore, gradingStatus };
  }

  function toFacultyAttemptSummary(
    attempt: ClassTestAttemptRecord,
    scoresVisible: boolean,
  ): FacultyAttemptSummary {
    return {
      attemptId: attempt.id,
      email: attempt.userEmail,
      name: attempt.userName,
      uid: attempt.userUid,
      rollNumber: attempt.userRollNumber,
      division: attempt.userDivision,
      status: attempt.status,
      violationCount: attempt.violationCount,
      suspectedMalpractice: attempt.suspectedMalpractice,
      gradingStatus: attempt.gradingStatus,
      // Faculty need marks to grade, but only once the test is over — never while it runs.
      autoScore: scoresVisible ? attempt.autoScore : null,
      manualScore: scoresVisible ? attempt.manualScore : null,
      finalScore: scoresVisible ? attempt.finalScore : null,
      timeTakenMs: attempt.timeTakenMs,
    };
  }

  function toFacultyAttemptDetail(
    test: ClassTestRecord,
    attempt: ClassTestAttemptRecord,
    scoresVisible: boolean,
  ): FacultyAttemptDetail {
    const byId = new Map(test.questions.map((question) => [question.id, question]));
    return {
      ...toFacultyAttemptSummary(attempt, scoresVisible),
      answers: attempt.questionStates.map((state) => {
        const question = byId.get(state.questionId);
        const isShortAnswer = question?.type === "ShortAnswer";
        return {
          questionId: state.questionId,
          type: state.questionType,
          statement:
            question && question.type === "Coding" ? question.problemTitle : question?.statement ?? "",
          maxPoints: state.maxPoints,
          awardedPoints: state.awardedPoints,
          submittedAnswer: state.submittedAnswer,
          ...(isShortAnswer && question.modelAnswer ? { modelAnswer: question.modelAnswer } : {}),
          graderNote: state.graderNote,
          requiresManualGrading: isShortAnswer,
        };
      }),
    };
  }
}
