import { randomUUID } from "node:crypto";

import { env } from "../../config/env";
import type { ExecutionProvider } from "../../execution/execution-provider";
import { generateSubmissionProgram } from "../../execution/harness";
import type { SqlExecutor, SqlResultSet } from "../../execution/sql/sql-executor";
import type { SubmissionQueue } from "../../queue/submission-queue";
import { AppError } from "../../shared/errors/app-error";
import type { AuthenticatedUser } from "../../shared/types/auth";
import type { ExecutableLanguage } from "../../shared/types/domain";
import {
  computeClassTestEndAt,
  computeClassTestStatus,
  matchesAudienceFilter,
  toAssignedStudent,
  type AssignedStudent,
  type ClassTestAudienceFilter,
} from "../classtest/classtest.model";
import { redactFailedTest, type SubmissionRunResponse } from "../submission/submission.model";
import type { SubmissionRepository } from "../submission/submission.repository";
import type { UserRepository } from "../user/user.repository";
import {
  isLanguageAllowedForExperiment,
  toStudentExperiment,
  type LabCodingExperiment,
  type LabExperiment,
  type LabSqlExperiment,
  type StudentLabExperiment,
} from "./lab.model";
import type { LabRepository } from "./lab.repository";
import {
  isAssignedToSession,
  labSessionTotalPoints,
  type LabSessionAttemptRecord,
  type LabSessionExperimentState,
  type LabSessionRecord,
} from "./lab-session.model";
import type { LabSessionAttemptRepository, LabSessionRepository } from "./lab-session.repository";
import type { CreateLabSessionInput, UpdateLabSessionInput } from "./lab-session.validator";
import type { LabCodingRunInput } from "./lab.service";

export interface StudentLabSessionSummary {
  id: string;
  title: string;
  subject: string;
  kind: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  computedStatus: string;
  experimentCount: number;
  totalPoints: number;
  attemptStatus: "NOT_STARTED" | "ACTIVE" | "SUBMITTED" | "AUTO_SUBMITTED";
  resultsPublished: boolean;
}

export interface StudentLabSessionDetail extends StudentLabSessionSummary {
  experiments: StudentLabExperiment[];
  deadlineAt: string | null;
  maxViolations: number;
  violationCount: number;
  answers: { experimentId: string; submittedSql: string | null; draftCode: string | null; draftLanguage: string | null }[];
}

export interface FacultyLabSessionAttempt {
  attemptId: string;
  email: string;
  name: string | null;
  uid: string | null;
  rollNumber: string | null;
  division: string | null;
  status: string;
  violationCount: number;
  suspectedMalpractice: boolean;
  autoScore: number | null;
  finalScore: number | null;
  totalPoints: number;
  timeTakenMs: number | null;
}

export interface LabSessionService {
  // faculty
  listForFaculty(user: AuthenticatedUser): Promise<LabSessionRecord[]>;
  getForFaculty(user: AuthenticatedUser, sessionId: string): Promise<LabSessionRecord>;
  createSession(user: AuthenticatedUser, input: CreateLabSessionInput): Promise<LabSessionRecord>;
  updateSession(user: AuthenticatedUser, sessionId: string, input: UpdateLabSessionInput): Promise<LabSessionRecord>;
  listAttempts(user: AuthenticatedUser, sessionId: string): Promise<FacultyLabSessionAttempt[]>;
  publishResults(user: AuthenticatedUser, sessionId: string, published: boolean): Promise<LabSessionRecord>;
  // student
  listAssigned(user: AuthenticatedUser): Promise<StudentLabSessionSummary[]>;
  getForStudent(user: AuthenticatedUser, sessionId: string): Promise<StudentLabSessionDetail>;
  startAttempt(user: AuthenticatedUser, sessionId: string): Promise<StudentLabSessionDetail>;
  runSql(user: AuthenticatedUser, sessionId: string, experimentId: string, sql: string): Promise<{ ok: boolean; result?: SqlResultSet; error?: string; timedOut: boolean }>;
  saveSql(user: AuthenticatedUser, sessionId: string, experimentId: string, sql: string): Promise<void>;
  runCoding(user: AuthenticatedUser, sessionId: string, input: LabCodingRunInput): Promise<SubmissionRunResponse>;
  submitCoding(user: AuthenticatedUser, sessionId: string, input: LabCodingRunInput): Promise<{ submissionId: string; status: "queued" }>;
  saveCodingDraft(user: AuthenticatedUser, sessionId: string, input: LabCodingRunInput): Promise<void>;
  submitAttempt(user: AuthenticatedUser, sessionId: string): Promise<void>;
  recordProctorEvent(user: AuthenticatedUser, sessionId: string, type: string): Promise<{ autoSubmitted: boolean; violationCount: number }>;
  getResult(user: AuthenticatedUser, sessionId: string): Promise<{ sessionId: string; title: string; finalScore: number; totalPoints: number; experiments: { experimentId: string; title: string; kind: string; maxPoints: number; awardedPoints: number }[] }>;
  finalizeExpiredAttempts(): Promise<{ finalizedCount: number }>;
}

interface LabSessionServiceDependencies {
  labSessionRepository: LabSessionRepository;
  labSessionAttemptRepository: LabSessionAttemptRepository;
  labRepository: LabRepository;
  userRepository: UserRepository;
  submissionRepository: SubmissionRepository;
  submissionQueue: SubmissionQueue;
  executionProvider: ExecutionProvider;
  sqlExecutor: SqlExecutor;
  now: () => Date;
}

const SCORED_VIOLATIONS = new Set(["TAB_SWITCH", "VISIBILITY_LOSS", "FULLSCREEN_EXIT", "PRINT_SCREEN"]);

function ensureFacultyCanManage(user: AuthenticatedUser, session: LabSessionRecord | null): LabSessionRecord {
  const canManage =
    session !== null && (session.createdBy === user.email || session.managerEmails.includes(user.email));
  if (!canManage) {
    throw new AppError(404, "Lab session not found");
  }
  return session;
}

export function createLabSessionService(dependencies: LabSessionServiceDependencies): LabSessionService {
  async function resolveAssignment(
    filter: ClassTestAudienceFilter,
    assignedEmails: string[],
  ): Promise<AssignedStudent[]> {
    if (filter.department === null) {
      throw new AppError(400, "Choose a department for this session");
    }
    const roster = await dependencies.userRepository.listByDepartment(filter.department, "STUDENT");
    const candidates = roster
      .filter((student) => matchesAudienceFilter(student, filter))
      .map((student) => toAssignedStudent(student));
    if (candidates.length === 0) {
      throw new AppError(400, "No students match this department, division and roll range");
    }
    if (assignedEmails.length === 0) {
      return candidates;
    }
    const wanted = new Set(assignedEmails.map((email) => email.trim().toLowerCase()));
    const selected = candidates.filter((student) => wanted.has(student.email.toLowerCase()));
    if (selected.length === 0) {
      throw new AppError(400, "None of the selected students match this department, division and roll range");
    }
    return selected;
  }

  function newExperimentState(experiment: LabExperiment): LabSessionExperimentState {
    return {
      experimentId: experiment.id,
      kind: experiment.kind,
      awardedPoints: 0,
      maxPoints: experiment.points,
      submittedSql: null,
      lastSubmissionId: null,
      passedCount: 0,
      totalCount: 0,
      finalSubmissionStatus: null,
      finalSubmissionLanguage: null,
      draftCode: null,
      draftLanguage: null,
    };
  }

  async function loadForStudent(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<{ session: LabSessionRecord; attempt: LabSessionAttemptRecord | null }> {
    const session = await dependencies.labSessionRepository.getById(sessionId);
    if (!session || session.lifecycleState !== "Published" || !isAssignedToSession(session, user.email)) {
      throw new AppError(404, "Lab session not found");
    }
    const attempt = await dependencies.labSessionAttemptRepository.getBySessionAndUser(sessionId, user.email);
    return { session, attempt };
  }

  function ensureWritableAttempt(
    session: LabSessionRecord,
    attempt: LabSessionAttemptRecord | null,
    now: Date,
  ): LabSessionAttemptRecord {
    if (!attempt || attempt.status !== "ACTIVE") {
      throw new AppError(409, "This session is not open for you");
    }
    if (computeClassTestStatus(session, now) !== "Live" || now.getTime() > attempt.deadlineAt.getTime()) {
      throw new AppError(409, "The session window has closed");
    }
    return attempt;
  }

  function studentSummary(
    session: LabSessionRecord,
    attemptStatus: StudentLabSessionSummary["attemptStatus"],
    now: Date,
  ): StudentLabSessionSummary {
    return {
      id: session.id,
      title: session.title,
      subject: session.subject,
      kind: session.kind,
      startAt: session.startAt.toISOString(),
      endAt: computeClassTestEndAt(session).toISOString(),
      durationMinutes: session.durationMinutes,
      computedStatus: computeClassTestStatus(session, now),
      experimentCount: session.experiments.length,
      totalPoints: labSessionTotalPoints(session.experiments),
      attemptStatus,
      resultsPublished: session.resultsPublished,
    };
  }

  async function buildStudentDetail(
    session: LabSessionRecord,
    attempt: LabSessionAttemptRecord | null,
    now: Date,
  ): Promise<StudentLabSessionDetail> {
    const status = computeClassTestStatus(session, now);
    const sealed = !(status === "Live" && attempt);
    return {
      ...studentSummary(session, attempt?.status ?? "NOT_STARTED", now),
      experiments: sealed ? [] : session.experiments.map(toStudentExperiment),
      deadlineAt: attempt?.deadlineAt.toISOString() ?? null,
      maxViolations: session.maxViolations,
      violationCount: attempt?.violationCount ?? 0,
      answers:
        attempt?.experimentStates.map((state) => ({
          experimentId: state.experimentId,
          submittedSql: state.submittedSql,
          draftCode: state.draftCode,
          draftLanguage: state.draftLanguage,
        })) ?? [],
    };
  }

  function findExperiment(session: LabSessionRecord, experimentId: string): LabExperiment {
    const experiment = session.experiments.find((item) => item.id === experimentId);
    if (!experiment) {
      throw new AppError(404, "Experiment not found");
    }
    return experiment;
  }

  async function ensureAutoScored(
    session: LabSessionRecord,
    attempt: LabSessionAttemptRecord,
    now: Date,
  ): Promise<LabSessionAttemptRecord> {
    if (computeClassTestStatus(session, now) !== "Ended") {
      return attempt;
    }
    const byId = new Map(session.experiments.map((experiment) => [experiment.id, experiment]));
    const experimentStates = await Promise.all(
      attempt.experimentStates.map(async (state) => {
        const experiment = byId.get(state.experimentId);
        if (!experiment) {
          return state;
        }
        if (experiment.kind === "sql") {
          const sqlExperiment = experiment as LabSqlExperiment;
          if (!state.submittedSql) {
            return { ...state, awardedPoints: 0 };
          }
          const graded = await dependencies.sqlExecutor.grade({
            studentSql: state.submittedSql,
            context: { schemaSql: sqlExperiment.schemaSql, solutionSql: sqlExperiment.solutionSql, ordered: sqlExperiment.ordered },
          });
          return { ...state, awardedPoints: graded.passed ? experiment.points : 0 };
        }
        // coding
        if (!state.lastSubmissionId) {
          return { ...state, awardedPoints: 0 };
        }
        const submission = await dependencies.submissionRepository.getById(state.lastSubmissionId);
        if (!submission || submission.totalCount === 0) {
          return { ...state, awardedPoints: 0 };
        }
        return {
          ...state,
          awardedPoints: Math.max(0, Math.round((experiment.points * submission.passedCount) / submission.totalCount)),
          passedCount: submission.passedCount,
          totalCount: submission.totalCount,
          finalSubmissionStatus: submission.status,
          finalSubmissionLanguage: submission.language,
        };
      }),
    );
    const autoScore = experimentStates.reduce((total, state) => total + state.awardedPoints, 0);
    const updated: LabSessionAttemptRecord = {
      ...attempt,
      experimentStates,
      autoScore,
      finalScore: autoScore,
      gradingStatus: "COMPLETE",
      updatedAt: now,
    };
    if (JSON.stringify(updated.experimentStates) !== JSON.stringify(attempt.experimentStates) || updated.gradingStatus !== attempt.gradingStatus) {
      await dependencies.labSessionAttemptRepository.save(updated);
    }
    return updated;
  }

  return {
    async listForFaculty(user) {
      const sessions = await dependencies.labSessionRepository.list();
      return sessions
        .filter((session) => session.createdBy === user.email || session.managerEmails.includes(user.email))
        .sort((left, right) => right.startAt.getTime() - left.startAt.getTime());
    },

    async getForFaculty(user, sessionId) {
      return ensureFacultyCanManage(user, await dependencies.labSessionRepository.getById(sessionId));
    },

    async createSession(user, input) {
      const now = dependencies.now();
      const lab = await dependencies.labRepository.getById(input.labId);
      if (!lab) {
        throw new AppError(404, "Lab not found");
      }
      // Snapshot the chosen experiments, preserving the order the faculty selected.
      const byId = new Map(lab.experiments.map((experiment) => [experiment.id, experiment]));
      const experiments = input.experimentIds
        .map((id) => byId.get(id))
        .filter((experiment): experiment is LabExperiment => experiment !== undefined);
      if (experiments.length === 0) {
        throw new AppError(400, "None of the chosen experiments belong to this lab");
      }
      const assignedStudents = await resolveAssignment(input.audience, input.assignedEmails);

      const session: LabSessionRecord = {
        id: `labsession_${randomUUID()}`,
        labId: lab.id,
        title: input.title ?? lab.title,
        subject: lab.subject,
        kind: lab.kind,
        experiments,
        startAt: new Date(input.startAt),
        durationMinutes: input.durationMinutes,
        audience: input.audience,
        assignedStudents,
        maxViolations: input.maxViolations,
        lifecycleState: input.lifecycleState,
        resultsPublished: false,
        createdBy: user.email,
        createdByRole: user.role,
        managerEmails: [],
        createdAt: now,
        updatedAt: now,
      };
      return dependencies.labSessionRepository.save(session);
    },

    async updateSession(user, sessionId, input) {
      const existing = ensureFacultyCanManage(user, await dependencies.labSessionRepository.getById(sessionId));
      const attempts = await dependencies.labSessionAttemptRepository.listBySession(sessionId);
      // Once anyone has started, the paper is settled — changing it would mean students sat
      // different assessments. Adjusting the window (e.g. extending time) stays allowed.
      if (attempts.length > 0 && input.experimentIds) {
        throw new AppError(409, "Students have already started this session");
      }
      const now = dependencies.now();
      let experiments = existing.experiments;
      if (input.experimentIds) {
        const lab = await dependencies.labRepository.getById(existing.labId);
        const byId = new Map((lab?.experiments ?? existing.experiments).map((experiment) => [experiment.id, experiment]));
        experiments = input.experimentIds
          .map((id) => byId.get(id))
          .filter((experiment): experiment is LabExperiment => experiment !== undefined);
      }
      let assignedStudents = existing.assignedStudents;
      if (input.audience || input.assignedEmails) {
        assignedStudents = await resolveAssignment(input.audience ?? existing.audience, input.assignedEmails ?? []);
      }
      const updated: LabSessionRecord = {
        ...existing,
        title: input.title ?? existing.title,
        experiments,
        startAt: input.startAt ? new Date(input.startAt) : existing.startAt,
        durationMinutes: input.durationMinutes ?? existing.durationMinutes,
        audience: input.audience ?? existing.audience,
        assignedStudents,
        maxViolations: input.maxViolations ?? existing.maxViolations,
        lifecycleState: input.lifecycleState ?? existing.lifecycleState,
        updatedAt: now,
      };
      return dependencies.labSessionRepository.save(updated);
    },

    async listAttempts(user, sessionId) {
      const session = ensureFacultyCanManage(user, await dependencies.labSessionRepository.getById(sessionId));
      const now = dependencies.now();
      const ended = computeClassTestStatus(session, now) === "Ended";
      const attempts = await dependencies.labSessionAttemptRepository.listBySession(sessionId);
      const scored = await Promise.all(attempts.map((attempt) => ensureAutoScored(session, attempt, now)));
      const totalPoints = labSessionTotalPoints(session.experiments);
      return scored.map((attempt) => ({
        attemptId: attempt.id,
        email: attempt.userEmail,
        name: attempt.userName,
        uid: attempt.userUid,
        rollNumber: attempt.userRollNumber,
        division: attempt.userDivision,
        status: attempt.status,
        violationCount: attempt.violationCount,
        suspectedMalpractice: attempt.suspectedMalpractice,
        autoScore: ended ? attempt.autoScore : null,
        finalScore: ended ? attempt.finalScore : null,
        totalPoints,
        timeTakenMs: attempt.timeTakenMs,
      }));
    },

    async publishResults(user, sessionId, published) {
      const existing = ensureFacultyCanManage(user, await dependencies.labSessionRepository.getById(sessionId));
      // Results can only go out once the shared window has closed — otherwise a student still
      // writing could see marks, and grading (which reads final submissions) has not run yet.
      if (published && computeClassTestStatus(existing, dependencies.now()) !== "Ended") {
        throw new AppError(409, "Results can be published only after the session window ends");
      }
      const updated = { ...existing, resultsPublished: published, updatedAt: dependencies.now() };
      return dependencies.labSessionRepository.save(updated);
    },

    async listAssigned(user) {
      const now = dependencies.now();
      const sessions = (await dependencies.labSessionRepository.list()).filter(
        (session) => session.lifecycleState === "Published" && isAssignedToSession(session, user.email),
      );
      return Promise.all(
        sessions.map(async (session) => {
          const attempt = await dependencies.labSessionAttemptRepository.getBySessionAndUser(session.id, user.email);
          return studentSummary(session, attempt?.status ?? "NOT_STARTED", now);
        }),
      );
    },

    async getForStudent(user, sessionId) {
      const now = dependencies.now();
      const { session, attempt } = await loadForStudent(user, sessionId);
      return buildStudentDetail(session, attempt, now);
    },

    async startAttempt(user, sessionId) {
      const now = dependencies.now();
      const { session, attempt } = await loadForStudent(user, sessionId);
      if (attempt) {
        return buildStudentDetail(session, attempt, now);
      }
      if (computeClassTestStatus(session, now) !== "Live") {
        throw new AppError(409, "The session is not live");
      }
      const profile = await dependencies.userRepository.getByEmail(user.email);
      const assigned = session.assignedStudents.find((student) => student.email.toLowerCase() === user.email.toLowerCase());
      const created: LabSessionAttemptRecord = {
        id: `labsession_attempt_${randomUUID()}`,
        sessionId,
        userEmail: user.email,
        userName: profile?.name ?? assigned?.name ?? null,
        userUid: profile?.uid ?? assigned?.uid ?? null,
        userRollNumber: profile?.rollNumber ?? assigned?.rollNumber ?? null,
        userDivision: assigned?.division ?? null,
        userDepartment: profile?.department ?? null,
        status: "ACTIVE",
        experimentStates: session.experiments.map(newExperimentState),
        autoScore: 0,
        finalScore: 0,
        gradingStatus: "PENDING",
        violationCount: 0,
        suspectedMalpractice: false,
        startedAt: now,
        deadlineAt: computeClassTestEndAt(session),
        submittedAt: null,
        autoSubmittedAt: null,
        timeTakenMs: null,
        createdAt: now,
        updatedAt: now,
      };
      await dependencies.labSessionAttemptRepository.save(created);
      return buildStudentDetail(session, created, now);
    },

    async runSql(user, sessionId, experimentId, sql) {
      const now = dependencies.now();
      const { session, attempt } = await loadForStudent(user, sessionId);
      ensureWritableAttempt(session, attempt, now);
      const experiment = findExperiment(session, experimentId);
      if (experiment.kind !== "sql") {
        throw new AppError(400, "Not a SQL experiment");
      }
      const ran = await dependencies.sqlExecutor.run({
        studentSql: sql,
        context: { schemaSql: experiment.schemaSql, solutionSql: experiment.solutionSql, ordered: experiment.ordered },
      });
      return { ok: ran.ok, result: ran.result, error: ran.error, timedOut: ran.timedOut };
    },

    async saveSql(user, sessionId, experimentId, sql) {
      const now = dependencies.now();
      const { session, attempt } = await loadForStudent(user, sessionId);
      const live = ensureWritableAttempt(session, attempt, now);
      findExperiment(session, experimentId);
      const experimentStates = live.experimentStates.map((state) =>
        state.experimentId === experimentId ? { ...state, submittedSql: sql } : state,
      );
      await dependencies.labSessionAttemptRepository.save({ ...live, experimentStates, updatedAt: now });
    },

    async runCoding(user, sessionId, input) {
      const now = dependencies.now();
      const { session, attempt } = await loadForStudent(user, sessionId);
      ensureWritableAttempt(session, attempt, now);
      const experiment = findExperiment(session, input.experimentId);
      if (experiment.kind !== "coding") {
        throw new AppError(400, "Not a coding experiment");
      }
      const coding = experiment as LabCodingExperiment;
      if (!isLanguageAllowedForExperiment(coding, input.language)) {
        throw new AppError(400, "That language is not allowed for this experiment");
      }
      const program = generateSubmissionProgram(input.language, input.code, coding.harness);
      const result = await dependencies.executionProvider.executeRun({
        code: program.source,
        comparison: program.comparison,
        language: input.language,
        testCases: coding.sampleTestCases,
        sampleCaseCount: coding.sampleTestCases.length,
        problemId: `${session.id}:${coding.id}`,
        timeLimitSeconds: coding.timeLimitSeconds,
        memoryLimitMb: coding.memoryLimitMb,
      });
      return {
        problemId: coding.id,
        language: input.language,
        status: result.status,
        runtimeMs: result.runtimeMs,
        memoryKb: result.memoryKb,
        passedCount: result.passedCount,
        totalCount: result.totalCount,
        executionProvider: result.provider,
        stdout: result.stdout,
        stderr: result.stderr,
        failedTest: redactFailedTest(result.failedTest, "full"),
      };
    },

    async submitCoding(user, sessionId, input) {
      const now = dependencies.now();
      const { session, attempt } = await loadForStudent(user, sessionId);
      const live = ensureWritableAttempt(session, attempt, now);
      const experiment = findExperiment(session, input.experimentId);
      if (experiment.kind !== "coding") {
        throw new AppError(400, "Not a coding experiment");
      }
      const coding = experiment as LabCodingExperiment;
      if (!isLanguageAllowedForExperiment(coding, input.language)) {
        throw new AppError(400, "That language is not allowed for this experiment");
      }
      const profile = await dependencies.userRepository.getByEmail(user.email);
      const submissionId = `submission_${randomUUID()}`;
      await dependencies.submissionRepository.create({
        id: submissionId,
        queueJobId: null,
        judge0Token: null,
        sourceType: "lab_coding",
        userEmail: user.email,
        userRole: profile?.role ?? "STUDENT",
        userDepartment: profile?.department ?? live.userDepartment ?? null,
        resourceOwnerEmail: session.createdBy,
        resourceTargetDepartment: session.audience.department,
        problemId: coding.id,
        problemTitleSnapshot: coding.title,
        problemDifficultySnapshot: coding.difficulty,
        contestId: null,
        contestTitleSnapshot: null,
        contestQuestionId: null,
        classTestId: null,
        classTestQuestionId: null,
        labId: session.labId,
        labExperimentId: coding.id,
        labSessionId: session.id,
        code: input.code,
        language: input.language,
        status: "QUEUED",
        runtimeMs: 0,
        memoryKb: 0,
        passedCount: 0,
        totalCount: coding.sampleTestCases.length + coding.hiddenTestCases.length,
        executionProvider: env.EXECUTION_PROVIDER,
        ratingAwarded: 0,
        stdout: null,
        stderr: null,
        failedTest: null,
        createdAt: now,
        updatedAt: now,
        judgedAt: null,
        finalizationAppliedAt: null,
      });
      const queueJobId = await dependencies.submissionQueue.enqueue(submissionId);
      const experimentStates = live.experimentStates.map((state) =>
        state.experimentId === coding.id
          ? { ...state, lastSubmissionId: submissionId, draftCode: input.code, draftLanguage: input.language }
          : state,
      );
      await dependencies.labSessionAttemptRepository.save({ ...live, experimentStates, updatedAt: dependencies.now() });
      void queueJobId;
      return { submissionId, status: "queued" };
    },

    async saveCodingDraft(user, sessionId, input) {
      const now = dependencies.now();
      const { session, attempt } = await loadForStudent(user, sessionId);
      const live = ensureWritableAttempt(session, attempt, now);
      findExperiment(session, input.experimentId);
      const experimentStates = live.experimentStates.map((state) =>
        state.experimentId === input.experimentId
          ? { ...state, draftCode: input.code, draftLanguage: input.language }
          : state,
      );
      await dependencies.labSessionAttemptRepository.save({ ...live, experimentStates, updatedAt: now });
    },

    async submitAttempt(user, sessionId) {
      const now = dependencies.now();
      const { session, attempt } = await loadForStudent(user, sessionId);
      const live = ensureWritableAttempt(session, attempt, now);
      await dependencies.labSessionAttemptRepository.save({
        ...live,
        status: "SUBMITTED",
        submittedAt: now,
        timeTakenMs: now.getTime() - live.startedAt.getTime(),
        updatedAt: now,
      });
    },

    async recordProctorEvent(user, sessionId, type) {
      const now = dependencies.now();
      const { session, attempt } = await loadForStudent(user, sessionId);
      if (!attempt || attempt.status !== "ACTIVE") {
        return { autoSubmitted: false, violationCount: attempt?.violationCount ?? 0 };
      }
      if (!SCORED_VIOLATIONS.has(type)) {
        return { autoSubmitted: false, violationCount: attempt.violationCount };
      }
      const violationCount = attempt.violationCount + 1;
      const shouldAutoSubmit = violationCount >= session.maxViolations;
      await dependencies.labSessionAttemptRepository.save({
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

    async getResult(user, sessionId) {
      const now = dependencies.now();
      const { session, attempt } = await loadForStudent(user, sessionId);
      if (!session.resultsPublished) {
        throw new AppError(409, "Results are not published yet");
      }
      if (!attempt) {
        throw new AppError(404, "You did not attempt this session");
      }
      const scored = await ensureAutoScored(session, attempt, now);
      const byId = new Map(session.experiments.map((experiment) => [experiment.id, experiment]));
      return {
        sessionId: session.id,
        title: session.title,
        finalScore: scored.finalScore,
        totalPoints: labSessionTotalPoints(session.experiments),
        experiments: scored.experimentStates.map((state) => {
          const experiment = byId.get(state.experimentId);
          return {
            experimentId: state.experimentId,
            title: experiment?.title ?? "",
            kind: state.kind,
            maxPoints: state.maxPoints,
            awardedPoints: state.awardedPoints,
          };
        }),
      };
    },

    async finalizeExpiredAttempts() {
      const now = dependencies.now();
      const expired = await dependencies.labSessionAttemptRepository.listActiveExpired(now);
      let finalizedCount = 0;
      for (const attempt of expired) {
        const session = await dependencies.labSessionRepository.getById(attempt.sessionId);
        if (!session) {
          continue;
        }
        await dependencies.labSessionAttemptRepository.save({
          ...attempt,
          status: attempt.status === "ACTIVE" ? "AUTO_SUBMITTED" : attempt.status,
          autoSubmittedAt: attempt.autoSubmittedAt ?? now,
          timeTakenMs: attempt.timeTakenMs ?? now.getTime() - attempt.startedAt.getTime(),
          updatedAt: now,
        });
        await ensureAutoScored(session, attempt, now);
        finalizedCount += 1;
      }
      return { finalizedCount };
    },
  };
}
