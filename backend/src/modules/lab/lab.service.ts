import { randomUUID } from "node:crypto";

import { env } from "../../config/env";
import type { ExecutionProvider } from "../../execution/execution-provider";
import { generateSubmissionProgram } from "../../execution/harness";
import type { SqlExecutor, SqlResultSet } from "../../execution/sql/sql-executor";
import type { SubmissionQueue } from "../../queue/submission-queue";
import { AppError } from "../../shared/errors/app-error";
import type { AuthenticatedUser } from "../../shared/types/auth";
import type { StudentAttendanceState } from "./lab-attendance.model";
import { deriveDivisionFromUid } from "../../shared/utils/uid-department";
import type { ExecutableLanguage } from "../../shared/types/domain";
import { redactFailedTest, type SubmissionRunResponse } from "../submission/submission.model";
import type { SubmissionRepository } from "../submission/submission.repository";
import type { UserRecord } from "../user/user.model";
import type { UserRepository } from "../user/user.repository";
import {
  isLabVisibleToStudent,
  isLanguageAllowedForExperiment,
  labTotalPoints,
  toStudentExperiment,
  type LabCodingExperiment,
  type LabExperiment,
  type LabRecord,
  type LabExperimentKind,
  type LabSqlExperiment,
  type LabSqlSubmissionRecord,
  type StudentLabDetail,
  type StudentLabSummary,
} from "./lab.model";
import { isOnAttendanceRoster } from "./lab-attendance.model";
import type { LabAdmissionRepository, LabAttendanceSessionRepository } from "./lab-attendance.repository";
import type { LabRepository, LabSqlSubmissionRepository } from "./lab.repository";
import type { CreateLabInput, LabSqlPreviewInput, UpdateLabInput } from "./lab.validator";

export interface LabCodingRunInput {
  experimentId: string;
  code: string;
  language: ExecutableLanguage;
}

export interface LabSqlRunResponse {
  ok: boolean;
  result?: SqlResultSet;
  error?: string;
  timedOut: boolean;
}

export interface LabSqlSubmitResponse {
  status: string;
  passed: boolean;
  awardedPoints: number;
  maxPoints: number;
  result?: SqlResultSet;
  message?: string;
}

export interface LabSqlPreviewResponse {
  expected: SqlResultSet;
  /** Present only when the caller supplied a `studentSql` to preview. */
  studentResult?: SqlResultSet;
  studentError?: string;
}

/**
 * One row of the faculty responses grid: who, which experiment, and how it went.
 *
 * Deliberately carries no answer body. Source code and SQL appear only on the detail endpoint,
 * mirroring the projection discipline the submission repository already applies to analytics
 * reads — so leaking an answer from a list view would have to be a visible change to this type.
 */
export interface FacultyLabResponseRow {
  userEmail: string;
  userName: string | null;
  userUid: string | null;
  rollNumber: string | null;
  division: string | null;
  experimentId: string;
  experimentNumber: number;
  experimentTitle: string;
  kind: LabExperimentKind;
  status: string;
  passed: boolean;
  awardedPoints: number;
  maxPoints: number;
  attemptCount: number;
  lastSubmittedAt: Date | null;
}

export interface FacultyLabCodingAttempt {
  submissionId: string;
  status: string;
  language: string;
  passedCount: number;
  totalCount: number;
  runtimeMs: number;
  memoryKb: number;
  createdAt: Date;
}

/** The bodies. Only ever returned by the per-student detail endpoint. */
export type FacultyLabResponseDetail =
  | {
      kind: "sql";
      experimentId: string;
      experimentTitle: string;
      userEmail: string;
      studentSql: string | null;
      status: string;
      passed: boolean;
      awardedPoints: number;
      maxPoints: number;
      runtimeMs: number;
      updatedAt: Date | null;
    }
  | {
      kind: "coding";
      experimentId: string;
      experimentTitle: string;
      userEmail: string;
      maxPoints: number;
      latest: (FacultyLabCodingAttempt & { code: string }) | null;
      history: FacultyLabCodingAttempt[];
    };

export interface LabService {
  // faculty
  listForFaculty(user: AuthenticatedUser): Promise<LabRecord[]>;
  getForFaculty(user: AuthenticatedUser, labId: string): Promise<LabRecord>;
  createLab(user: AuthenticatedUser, input: CreateLabInput): Promise<LabRecord>;
  updateLab(user: AuthenticatedUser, labId: string, input: UpdateLabInput): Promise<LabRecord>;
  previewSql(user: AuthenticatedUser, input: LabSqlPreviewInput): Promise<LabSqlPreviewResponse>;
  listResponses(
    user: AuthenticatedUser,
    labId: string,
    options?: { experimentId?: string },
  ): Promise<FacultyLabResponseRow[]>;
  getResponse(
    user: AuthenticatedUser,
    labId: string,
    experimentId: string,
    studentEmail: string,
  ): Promise<FacultyLabResponseDetail>;
  // student
  listForStudent(user: AuthenticatedUser): Promise<StudentLabSummary[]>;
  getForStudent(user: AuthenticatedUser, labId: string): Promise<StudentLabDetail>;
  runSql(user: AuthenticatedUser, labId: string, experimentId: string, sql: string): Promise<LabSqlRunResponse>;
  submitSql(user: AuthenticatedUser, labId: string, experimentId: string, sql: string): Promise<LabSqlSubmitResponse>;
  runCoding(user: AuthenticatedUser, labId: string, input: LabCodingRunInput): Promise<SubmissionRunResponse>;
  submitCoding(user: AuthenticatedUser, labId: string, input: LabCodingRunInput): Promise<{ submissionId: string; status: "queued" }>;
  saveCodingDraft(user: AuthenticatedUser, labId: string, input: LabCodingRunInput): Promise<{ saved: true }>;
}

interface LabServiceDependencies {
  labRepository: LabRepository;
  labSqlSubmissionRepository: LabSqlSubmissionRepository;
  labAttendanceSessionRepository: LabAttendanceSessionRepository;
  labAdmissionRepository: LabAdmissionRepository;
  submissionRepository: SubmissionRepository;
  submissionQueue: SubmissionQueue;
  executionProvider: ExecutionProvider;
  userRepository: UserRepository;
  sqlExecutor: SqlExecutor;
  now: () => Date;
}

function ensureFacultyCanManage(user: AuthenticatedUser, lab: LabRecord | null): LabRecord {
  const canManage =
    lab !== null && (lab.createdBy === user.email || lab.managerEmails.includes(user.email));
  if (!canManage) {
    // 404 rather than 403 — do not confirm a lab exists to someone who cannot manage it.
    throw new AppError(404, "Lab not found");
  }
  return lab;
}

function assignExperimentIds(experiments: CreateLabInput["experiments"]): LabExperiment[] {
  return experiments.map((experiment) => ({
    ...experiment,
    id: experiment.id && experiment.id.trim() !== "" ? experiment.id : `exp_${randomUUID()}`,
  })) as LabExperiment[];
}

function sqlContextOf(experiment: LabSqlExperiment) {
  return { schemaSql: experiment.schemaSql, solutionSql: experiment.solutionSql, ordered: experiment.ordered };
}

export function createLabService(dependencies: LabServiceDependencies): LabService {
  /**
   * The attendance gate.
   *
   * Deliberately permissive in two places. With no session running the lab stays self-paced, which
   * is what it is outside a lab period. And a student who is *not* on the running session's roster
   * is not blocked by it — opening Batch 1's session must not lock Batch 2 out of their own
   * practice. A lab that should never be open unattended sets `requiresAttendance`.
   */
  async function ensureAdmitted(user: AuthenticatedUser, lab: LabRecord): Promise<void> {
    const session = await dependencies.labAttendanceSessionRepository.findOpenByLab(lab.id, dependencies.now());

    if (!session) {
      if (lab.requiresAttendance) {
        throw new AppError(403, "Your lab teacher has not opened this lab yet", { code: "LAB_NO_SESSION" });
      }
      return;
    }

    if (!isOnAttendanceRoster(session, user.email)) {
      return;
    }

    const admission = await dependencies.labAdmissionRepository.getBySessionAndUser(session.id, user.email);
    if (admission?.status !== "ADMITTED") {
      throw new AppError(403, "Ask your lab teacher to admit you", {
        code: "LAB_ADMISSION_REQUIRED",
        sessionId: session.id,
      });
    }
  }

  /** What the student page needs to render the join gate instead of the experiments. */
  async function attendanceStateFor(
    user: AuthenticatedUser,
    lab: LabRecord,
  ): Promise<StudentAttendanceState | null> {
    const session = await dependencies.labAttendanceSessionRepository.findOpenByLab(lab.id, dependencies.now());
    if (!session || !isOnAttendanceRoster(session, user.email)) {
      return null;
    }
    const admission = await dependencies.labAdmissionRepository.getBySessionAndUser(session.id, user.email);
    return {
      sessionId: session.id,
      status: admission?.status ?? null,
      denialReason: admission?.denialReason ?? null,
      gates: session.gates,
    };
  }

  async function loadSqlExperiment(
    user: AuthenticatedUser,
    labId: string,
    experimentId: string,
  ): Promise<{ lab: LabRecord; experiment: LabSqlExperiment }> {
    const lab = await dependencies.labRepository.getById(labId);
    const profile = await dependencies.userRepository.getByEmail(user.email);
    if (!lab || !isLabVisibleToStudent(lab, { department: profile?.department ?? null, semester: profile?.semester ?? null })) {
      throw new AppError(404, "Lab not found");
    }
    await ensureAdmitted(user, lab);
    const experiment = lab.experiments.find((item) => item.id === experimentId);
    if (!experiment || experiment.kind !== "sql") {
      throw new AppError(404, "Experiment not found");
    }
    return { lab, experiment };
  }

  async function loadCodingExperiment(
    user: AuthenticatedUser,
    labId: string,
    experimentId: string,
  ): Promise<{ lab: LabRecord; experiment: LabCodingExperiment }> {
    const lab = await dependencies.labRepository.getById(labId);
    const profile = await dependencies.userRepository.getByEmail(user.email);
    if (!lab || !isLabVisibleToStudent(lab, { department: profile?.department ?? null, semester: profile?.semester ?? null })) {
      throw new AppError(404, "Lab not found");
    }
    await ensureAdmitted(user, lab);
    const experiment = lab.experiments.find((item) => item.id === experimentId);
    if (!experiment || experiment.kind !== "coding") {
      throw new AppError(404, "Experiment not found");
    }
    return { lab, experiment };
  }

  /** Derives one student's coding-experiment progress from their lab_coding submissions. */
  async function codingProgress(
    labId: string,
    experiment: LabCodingExperiment,
    userEmail: string,
  ): Promise<{ passed: boolean; awardedPoints: number; status: string }> {
    const submissions = await dependencies.submissionRepository.list({
      userEmail,
      sourceType: "lab_coding",
      problemId: experiment.id,
    });
    const forThisLab = submissions.filter((submission) => submission.labId === labId);
    if (forThisLab.length === 0) {
      return { passed: false, awardedPoints: 0, status: "NOT_ATTEMPTED" };
    }
    let passed = false;
    let best = 0;
    for (const submission of forThisLab) {
      if (submission.totalCount > 0) {
        best = Math.max(best, Math.round((experiment.points * submission.passedCount) / submission.totalCount));
        if (submission.passedCount === submission.totalCount) {
          passed = true;
        }
      }
    }
    const latest = forThisLab.reduce((newest, item) => (item.createdAt > newest.createdAt ? item : newest));
    return { passed, awardedPoints: passed ? experiment.points : best, status: passed ? "SOLVED" : latest.status };
  }

  return {
    async listForFaculty(user) {
      const labs = await dependencies.labRepository.list();
      return labs.filter((lab) => lab.createdBy === user.email || lab.managerEmails.includes(user.email));
    },

    async getForFaculty(user, labId) {
      return ensureFacultyCanManage(user, await dependencies.labRepository.getById(labId));
    },

    async createLab(user, input) {
      const now = dependencies.now();
      const lab: LabRecord = {
        id: `lab_${randomUUID()}`,
        title: input.title,
        subject: input.subject,
        kind: input.kind,
        department: input.department,
        semester: input.semester,
        description: input.description,
        lifecycleState: input.lifecycleState,
        requiresAttendance: input.requiresAttendance,
        experiments: assignExperimentIds(input.experiments),
        createdBy: user.email,
        createdByRole: user.role,
        managerEmails: [],
        createdAt: now,
        updatedAt: now,
      };
      return dependencies.labRepository.save(lab);
    },

    async updateLab(user, labId, input) {
      const existing = ensureFacultyCanManage(user, await dependencies.labRepository.getById(labId));
      const now = dependencies.now();
      const updated: LabRecord = {
        ...existing,
        title: input.title ?? existing.title,
        subject: input.subject ?? existing.subject,
        kind: input.kind ?? existing.kind,
        department: input.department === undefined ? existing.department : input.department,
        semester: input.semester === undefined ? existing.semester : input.semester,
        description: input.description === undefined ? existing.description : input.description,
        lifecycleState: input.lifecycleState ?? existing.lifecycleState,
        requiresAttendance: input.requiresAttendance ?? existing.requiresAttendance,
        experiments: input.experiments ? assignExperimentIds(input.experiments) : existing.experiments,
        updatedAt: now,
      };
      return dependencies.labRepository.save(updated);
    },

    async previewSql(_user, input) {
      const context = { schemaSql: input.schemaSql, solutionSql: input.solutionSql, ordered: input.ordered };
      const expected = await dependencies.sqlExecutor.run({ studentSql: input.solutionSql, context });
      if (!expected.ok || !expected.result) {
        throw new AppError(400, expected.error ?? "The reference query failed to run");
      }
      if (input.studentSql && input.studentSql.trim() !== "") {
        const student = await dependencies.sqlExecutor.run({ studentSql: input.studentSql, context });
        return {
          expected: expected.result,
          studentResult: student.ok ? student.result : undefined,
          studentError: student.ok ? undefined : student.error,
        };
      }
      return { expected: expected.result };
    },

    /**
     * Every student's result for this lab, one row per (student, experiment) that has an answer.
     *
     * Non-attempters are absent by design: the roster of who *should* have attempted belongs to the
     * attendance session, not to the lab itself, so inventing empty rows here would misrepresent
     * students who were never in this batch.
     */
    async listResponses(user, labId, options) {
      const lab = ensureFacultyCanManage(user, await dependencies.labRepository.getById(labId));
      const experiments = options?.experimentId
        ? lab.experiments.filter((experiment) => experiment.id === options.experimentId)
        : lab.experiments;

      const rows: FacultyLabResponseRow[] = [];
      // One profile lookup per student across the whole grid, not per row.
      const profileCache = new Map<string, UserRecord | null>();
      const profileOf = async (email: string) => {
        if (!profileCache.has(email)) {
          profileCache.set(email, await dependencies.userRepository.getByEmail(email));
        }
        return profileCache.get(email) ?? null;
      };

      for (const experiment of experiments) {
        if (experiment.kind === "sql") {
          const submissions = await dependencies.labSqlSubmissionRepository.listByExperiment(labId, experiment.id);
          for (const submission of submissions) {
            const profile = await profileOf(submission.userEmail);
            rows.push({
              userEmail: submission.userEmail,
              userName: submission.userName ?? profile?.name ?? null,
              userUid: submission.userUid ?? profile?.uid ?? null,
              rollNumber: profile?.rollNumber ?? null,
              division: deriveDivisionFromUid(submission.userUid ?? profile?.uid ?? ""),
              experimentId: experiment.id,
              experimentNumber: experiment.number,
              experimentTitle: experiment.title,
              kind: "sql",
              status: submission.status,
              passed: submission.passed,
              awardedPoints: submission.awardedPoints,
              maxPoints: experiment.points,
              // One upserted row per student, so the count is simply the fact that they answered.
              attemptCount: 1,
              lastSubmittedAt: submission.updatedAt,
            });
          }
          continue;
        }

        const submissions = await dependencies.submissionRepository.list({
          sourceType: "lab_coding",
          labId,
          labExperimentId: experiment.id,
        });
        const byStudent = new Map<string, typeof submissions>();
        for (const submission of submissions) {
          const bucket = byStudent.get(submission.userEmail) ?? [];
          bucket.push(submission);
          byStudent.set(submission.userEmail, bucket);
        }
        for (const [email, studentSubmissions] of byStudent) {
          const profile = await profileOf(email);
          const passed = studentSubmissions.some(
            (submission) => submission.totalCount > 0 && submission.passedCount === submission.totalCount,
          );
          const best = studentSubmissions.reduce(
            (highest, submission) =>
              submission.totalCount > 0
                ? Math.max(highest, Math.round((experiment.points * submission.passedCount) / submission.totalCount))
                : highest,
            0,
          );
          const latest = studentSubmissions.reduce((newest, item) =>
            item.createdAt > newest.createdAt ? item : newest,
          );
          rows.push({
            userEmail: email,
            userName: profile?.name ?? null,
            userUid: profile?.uid ?? null,
            rollNumber: profile?.rollNumber ?? null,
            division: deriveDivisionFromUid(profile?.uid ?? ""),
            experimentId: experiment.id,
            experimentNumber: experiment.number,
            experimentTitle: experiment.title,
            kind: "coding",
            status: passed ? "SOLVED" : latest.status,
            passed,
            awardedPoints: passed ? experiment.points : best,
            maxPoints: experiment.points,
            attemptCount: studentSubmissions.length,
            lastSubmittedAt: latest.createdAt,
          });
        }
      }

      return rows.sort(
        (left, right) =>
          left.experimentNumber - right.experimentNumber ||
          Number(left.rollNumber ?? 0) - Number(right.rollNumber ?? 0),
      );
    },

    /** The one endpoint that returns a student's actual answer. Faculty-only, one student at a time. */
    async getResponse(user, labId, experimentId, studentEmail) {
      const lab = ensureFacultyCanManage(user, await dependencies.labRepository.getById(labId));
      const experiment = lab.experiments.find((item) => item.id === experimentId);
      if (!experiment) {
        throw new AppError(404, "Experiment not found");
      }
      const email = studentEmail.trim().toLowerCase();

      if (experiment.kind === "sql") {
        const submission = await dependencies.labSqlSubmissionRepository.getByExperimentAndUser(
          labId,
          experimentId,
          email,
        );
        return {
          kind: "sql",
          experimentId,
          experimentTitle: experiment.title,
          userEmail: email,
          studentSql: submission?.studentSql ?? null,
          status: submission?.status ?? "NOT_ATTEMPTED",
          passed: submission?.passed ?? false,
          awardedPoints: submission?.awardedPoints ?? 0,
          maxPoints: experiment.points,
          runtimeMs: submission?.runtimeMs ?? 0,
          updatedAt: submission?.updatedAt ?? null,
        };
      }

      const submissions = await dependencies.submissionRepository.list({
        userEmail: email,
        sourceType: "lab_coding",
        labId,
        labExperimentId: experimentId,
      });
      const ordered = [...submissions].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
      const toAttempt = (submission: (typeof ordered)[number]): FacultyLabCodingAttempt => ({
        submissionId: submission.id,
        status: submission.status,
        language: submission.language,
        passedCount: submission.passedCount,
        totalCount: submission.totalCount,
        runtimeMs: submission.runtimeMs,
        memoryKb: submission.memoryKb,
        createdAt: submission.createdAt,
      });

      return {
        kind: "coding",
        experimentId,
        experimentTitle: experiment.title,
        userEmail: email,
        maxPoints: experiment.points,
        latest: ordered[0] ? { ...toAttempt(ordered[0]), code: ordered[0].code } : null,
        history: ordered.slice(1).map(toAttempt),
      };
    },

    async listForStudent(user) {
      const profile = await dependencies.userRepository.getByEmail(user.email);
      const labs = await dependencies.labRepository.list();
      return labs
        .filter((lab) => isLabVisibleToStudent(lab, { department: profile?.department ?? null, semester: profile?.semester ?? null }))
        .map(
          (lab): StudentLabSummary => ({
            id: lab.id,
            title: lab.title,
            subject: lab.subject,
            kind: lab.kind,
            experimentCount: lab.experiments.length,
            totalPoints: labTotalPoints(lab.experiments),
          }),
        );
    },

    async getForStudent(user, labId) {
      const profile = await dependencies.userRepository.getByEmail(user.email);
      const lab = await dependencies.labRepository.getById(labId);
      if (!lab || !isLabVisibleToStudent(lab, { department: profile?.department ?? null, semester: profile?.semester ?? null })) {
        throw new AppError(404, "Lab not found");
      }
      // Not admitted yet: hand back the shell plus the join state, never the experiments. Without
      // this the gate is defeated by simply reading this payload, which carries every statement,
      // the schema DDL and the sample cases.
      const attendance = await attendanceStateFor(user, lab);
      if (attendance && attendance.status !== "ADMITTED") {
        return {
          id: lab.id,
          title: lab.title,
          subject: lab.subject,
          kind: lab.kind,
          experimentCount: lab.experiments.length,
          totalPoints: labTotalPoints(lab.experiments),
          description: lab.description,
          experiments: [],
          progress: [],
          attendance,
        };
      }

      const sqlSubmissions = await dependencies.labSqlSubmissionRepository.listByLabAndUser(labId, user.email);
      const sqlByExperiment = new Map(sqlSubmissions.map((submission) => [submission.experimentId, submission]));
      const progress = await Promise.all(
        lab.experiments.map(async (experiment) => {
          if (experiment.kind === "coding") {
            const coding = await codingProgress(labId, experiment, user.email);
            return { experimentId: experiment.id, ...coding };
          }
          const submission = sqlByExperiment.get(experiment.id);
          return {
            experimentId: experiment.id,
            passed: submission?.passed ?? false,
            awardedPoints: submission?.awardedPoints ?? 0,
            status: submission?.status ?? "NOT_ATTEMPTED",
          };
        }),
      );
      return {
        id: lab.id,
        title: lab.title,
        subject: lab.subject,
        kind: lab.kind,
        experimentCount: lab.experiments.length,
        totalPoints: labTotalPoints(lab.experiments),
        description: lab.description,
        experiments: lab.experiments.map(toStudentExperiment),
        progress,
        attendance,
      };
    },

    async runSql(user, labId, experimentId, sql) {
      const { experiment } = await loadSqlExperiment(user, labId, experimentId);
      const ran = await dependencies.sqlExecutor.run({ studentSql: sql, context: sqlContextOf(experiment) });
      return { ok: ran.ok, result: ran.result, error: ran.error, timedOut: ran.timedOut };
    },

    async submitSql(user, labId, experimentId, sql) {
      const { experiment } = await loadSqlExperiment(user, labId, experimentId);
      const now = dependencies.now();
      const graded = await dependencies.sqlExecutor.grade({ studentSql: sql, context: sqlContextOf(experiment) });
      const profile = await dependencies.userRepository.getByEmail(user.email);

      const existing = await dependencies.labSqlSubmissionRepository.getByExperimentAndUser(labId, experimentId, user.email);
      // `passed` is sticky and points keep the best, so a later wrong query never un-solves an experiment.
      const passed = (existing?.passed ?? false) || graded.passed;
      const awardedPoints = Math.max(existing?.awardedPoints ?? 0, graded.passed ? experiment.points : 0);

      await dependencies.labSqlSubmissionRepository.save({
        id: existing?.id ?? `lab_sql_${randomUUID()}`,
        labId,
        experimentId,
        userEmail: user.email,
        userName: profile?.name ?? null,
        userUid: profile?.uid ?? null,
        userDepartment: profile?.department ?? null,
        studentSql: sql,
        status: graded.status,
        passed,
        awardedPoints,
        runtimeMs: graded.runtimeMs,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });

      // The student sees their own grid and the verdict, never the reference result.
      return {
        status: graded.status,
        passed: graded.passed,
        awardedPoints,
        maxPoints: experiment.points,
        result: graded.studentResult,
        message: graded.message,
      };
    },

    async runCoding(user, labId, input) {
      const { lab, experiment } = await loadCodingExperiment(user, labId, input.experimentId);
      if (!isLanguageAllowedForExperiment(experiment, input.language)) {
        throw new AppError(400, "That language is not allowed for this experiment");
      }

      // Sample cases only — "Run" checks your own work, so hidden cases stay hidden.
      const program = generateSubmissionProgram(input.language, input.code, experiment.harness);
      const result = await dependencies.executionProvider.executeRun({
        code: program.source,
        comparison: program.comparison,
        language: input.language,
        testCases: experiment.sampleTestCases,
        sampleCaseCount: experiment.sampleTestCases.length,
        problemId: `${lab.id}:${experiment.id}`,
        timeLimitSeconds: experiment.timeLimitSeconds,
        memoryLimitMb: experiment.memoryLimitMb,
      });

      return {
        problemId: experiment.id,
        language: input.language,
        status: result.status,
        runtimeMs: result.runtimeMs,
        memoryKb: result.memoryKb,
        passedCount: result.passedCount,
        totalCount: result.totalCount,
        executionProvider: result.provider,
        stdout: result.stdout,
        stderr: result.stderr,
        // Run judges only the sample cases, which the experiment already shows in full.
        failedTest: redactFailedTest(result.failedTest, "full"),
      };
    },

    async submitCoding(user, labId, input) {
      const { lab, experiment } = await loadCodingExperiment(user, labId, input.experimentId);
      if (!isLanguageAllowedForExperiment(experiment, input.language)) {
        throw new AppError(400, "That language is not allowed for this experiment");
      }

      const now = dependencies.now();
      const profile = await dependencies.userRepository.getByEmail(user.email);
      const submissionId = `submission_${randomUUID()}`;

      await dependencies.submissionRepository.create({
        id: submissionId,
        queueJobId: null,
        judge0Token: null,
        sourceType: "lab_coding",
        userEmail: user.email,
        userRole: profile?.role ?? "STUDENT",
        userDepartment: profile?.department ?? null,
        resourceOwnerEmail: lab.createdBy,
        resourceTargetDepartment: lab.department,
        problemId: experiment.id,
        problemTitleSnapshot: experiment.title,
        problemDifficultySnapshot: experiment.difficulty,
        contestId: null,
        contestTitleSnapshot: null,
        contestQuestionId: null,
        classTestId: null,
        classTestQuestionId: null,
        labId: lab.id,
        labExperimentId: experiment.id,
        code: input.code,
        language: input.language,
        status: "QUEUED",
        runtimeMs: 0,
        memoryKb: 0,
        passedCount: 0,
        totalCount: experiment.sampleTestCases.length + experiment.hiddenTestCases.length,
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
      const stored = await dependencies.submissionRepository.getById(submissionId);
      if (stored) {
        await dependencies.submissionRepository.save({ ...stored, queueJobId, updatedAt: dependencies.now() });
      }

      return { submissionId, status: "queued" };
    },

    /**
     * The shared coding workspace auto-saves; labs keep the draft in the browser, so there is
     * nothing to store. The load still runs: the endpoint previously accepted any body from any
     * student without ever looking at the lab, which also meant it bypassed the attendance gate.
     */
    async saveCodingDraft(user, labId, input) {
      await loadCodingExperiment(user, labId, input.experimentId);
      return { saved: true };
    },
  };
}
