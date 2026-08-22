import { randomUUID } from "node:crypto";

import type { SqlExecutor, SqlResultSet } from "../../execution/sql/sql-executor";
import { AppError } from "../../shared/errors/app-error";
import type { AuthenticatedUser } from "../../shared/types/auth";
import type { UserRepository } from "../user/user.repository";
import {
  isLabVisibleToStudent,
  labTotalPoints,
  toStudentExperiment,
  type LabExperiment,
  type LabRecord,
  type LabSqlExperiment,
  type LabSqlSubmissionRecord,
  type StudentLabDetail,
  type StudentLabSummary,
} from "./lab.model";
import type { LabRepository, LabSqlSubmissionRepository } from "./lab.repository";
import type { CreateLabInput, LabSqlPreviewInput, UpdateLabInput } from "./lab.validator";

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

export interface LabService {
  // faculty
  listForFaculty(user: AuthenticatedUser): Promise<LabRecord[]>;
  getForFaculty(user: AuthenticatedUser, labId: string): Promise<LabRecord>;
  createLab(user: AuthenticatedUser, input: CreateLabInput): Promise<LabRecord>;
  updateLab(user: AuthenticatedUser, labId: string, input: UpdateLabInput): Promise<LabRecord>;
  previewSql(user: AuthenticatedUser, input: LabSqlPreviewInput): Promise<LabSqlPreviewResponse>;
  // student
  listForStudent(user: AuthenticatedUser): Promise<StudentLabSummary[]>;
  getForStudent(user: AuthenticatedUser, labId: string): Promise<StudentLabDetail>;
  runSql(user: AuthenticatedUser, labId: string, experimentId: string, sql: string): Promise<LabSqlRunResponse>;
  submitSql(user: AuthenticatedUser, labId: string, experimentId: string, sql: string): Promise<LabSqlSubmitResponse>;
}

interface LabServiceDependencies {
  labRepository: LabRepository;
  labSqlSubmissionRepository: LabSqlSubmissionRepository;
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
    const experiment = lab.experiments.find((item) => item.id === experimentId);
    if (!experiment || experiment.kind !== "sql") {
      throw new AppError(404, "Experiment not found");
    }
    return { lab, experiment };
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
      const submissions = await dependencies.labSqlSubmissionRepository.listByLabAndUser(labId, user.email);
      const byExperiment = new Map(submissions.map((submission) => [submission.experimentId, submission]));
      return {
        id: lab.id,
        title: lab.title,
        subject: lab.subject,
        kind: lab.kind,
        experimentCount: lab.experiments.length,
        totalPoints: labTotalPoints(lab.experiments),
        description: lab.description,
        experiments: lab.experiments.map(toStudentExperiment),
        progress: lab.experiments.map((experiment) => {
          const submission = byExperiment.get(experiment.id);
          return {
            experimentId: experiment.id,
            passed: submission?.passed ?? false,
            awardedPoints: submission?.awardedPoints ?? 0,
            status: submission?.status ?? "NOT_ATTEMPTED",
          };
        }),
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
  };
}
