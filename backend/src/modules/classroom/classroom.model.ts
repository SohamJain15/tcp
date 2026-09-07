import type { LabExperiment, LabKind } from "../lab/lab.model";
import type { Department, ExecutableLanguage } from "../../shared/types/domain";
import type { SqlResultSet, SqlScriptResult } from "../../execution/sql/sql-executor";

export interface ClassroomStudent {
  email: string;
  name: string;
  rollNumber: string;
  batch: string;
  year: number;
}
export interface ClassroomSession {
  id: string;
  title: string;
  startAt: string;
  durationMinutes: number;
  language: ExecutableLanguage | "sql";
  experiments: LabExperiment[];
  activatedAt: string | null;
  closedAt: string | null;
  network: string | null;
  roster: ClassroomStudent[];
  attendance: Array<ClassroomStudent & { enteredAt: string }>;
}
export interface ClassroomGrade {
  email: string;
  experimentId: string;
  mark: number | null;
  updatedBy: string;
  updatedAt: string;
}
export interface ClassroomRecord {
  /** Null/absent keeps cohort-wide code enrollment; a list restricts the batch. */
  selectedStudentEmails?: string[] | null;
  id: string;
  revision: number;
  requestKey: string;
  joinCode: string;
  createdBy: string;
  title: string;
  subject: string;
  kind: LabKind;
  department: Department;
  semester: number;
  batch: string;
  description: string | null;
  lifecycleState: "Draft" | "Published" | "Archived";
  experiments: LabExperiment[];
  sessions: ClassroomSession[];
  members: ClassroomStudent[];
  grades: ClassroomGrade[];
  gradeAudit: ClassroomGrade[];
  createdAt: string;
}
export interface ClassroomOutput {
  evaluationStatus?: string;
  status: string;
  stdout: string;
  stderr: string;
  table?: SqlResultSet;
  /**
   * Script-mode payload: per-statement outcomes, the resulting tables, and the check results. It is
   * persisted on the work record rather than recomputed, so the faculty sees in the gradebook
   * exactly the database the student built at submission time.
   */
  script?: SqlScriptResult;
  truncated: boolean;
  runtimeMs: number;
}
export interface ClassroomWork {
  id: string;
  classroomId: string;
  sessionId: string;
  experimentId: string;
  email: string;
  mode: "official" | "practice";
  action: "run" | "submit";
  code: string;
  language: ExecutableLanguage | "sql";
  createdAt: string;
  output: ClassroomOutput | null;
}
export interface ClassroomDraft {
  id: string;
  classroomId: string;
  sessionId: string;
  experimentId: string;
  email: string;
  mode: "official" | "practice";
  code: string;
  updatedAt: string;
}
export function sessionEnd(
  session: Pick<ClassroomSession, "startAt" | "durationMinutes">,
): number {
  return Date.parse(session.startAt) + session.durationMinutes * 60_000;
}
export function sessionStatus(
  session: Pick<
    ClassroomSession,
    "startAt" | "durationMinutes" | "activatedAt" | "closedAt"
  >,
  now: number,
): "Upcoming" | "Ready" | "Active" | "Ended" {
  if (session.closedAt || now >= sessionEnd(session)) return "Ended";
  if (now < Date.parse(session.startAt)) return "Upcoming";
  return session.activatedAt ? "Active" : "Ready";
}
export function gradeAverage(
  grades: Array<{ mark: number | null }>,
): number | null {
  const marks = grades.flatMap((g) => (g.mark === null ? [] : [g.mark]));
  return marks.length
    ? Math.round((marks.reduce((a, b) => a + b, 0) / marks.length) * 100) / 100
    : null;
}
