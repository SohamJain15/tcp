import { apiRequest, getApiBaseUrl } from "./client";
import type {
  Department,
  FacultyLabExperiment,
  SqlResultSet,
  SqlScriptResult,
} from "./types";

/** UUIDs also work on HTTP lab-network origins, where randomUUID may be unavailable. */
export function newRequestKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface ClassroomStudent {
  email: string;
  name: string;
  rollNumber: string;
  batch: string;
  year: number;
}
export interface ClassroomGrade {
  email: string;
  experimentId: string;
  mark: number | null;
  updatedAt: string;
  updatedBy: string;
}
export interface ClassroomSession {
  id: string;
  title: string;
  startAt: string;
  durationMinutes: number;
  language: string;
  experiments: FacultyLabExperiment[];
  activatedAt: string | null;
  closedAt: string | null;
  computedStatus: "Upcoming" | "Ready" | "Active" | "Ended";
  roster?: ClassroomStudent[];
  attendance: Array<ClassroomStudent & { enteredAt: string }>;
}
export interface Classroom {
  selectedStudentEmails?: string[] | null;
  id: string;
  title: string;
  subject: string;
  batch: string;
  kind: "DBMS" | "DSA";
  department: Department;
  semester: number;
  description: string | null;
  lifecycleState: "Draft" | "Published" | "Archived";
  joinCode?: string;
  experiments: FacultyLabExperiment[];
  sessions: ClassroomSession[];
  members?: ClassroomStudent[];
  grades: ClassroomGrade[];
  average: number | null;
}
export interface WorkOutput {
  status: string;
  evaluationStatus?: string;
  stdout: string;
  stderr: string;
  table?: SqlResultSet;
  /** Script experiments only: per-statement outcomes, the resulting tables, and the checks. */
  script?: SqlScriptResult;
  truncated: boolean;
  runtimeMs: number;
}
export interface ClassroomWork {
  id: string;
  sessionId: string;
  experimentId: string;
  email: string;
  mode: "official" | "practice";
  action: "run" | "submit";
  code: string;
  language: string;
  createdAt: string;
  output: WorkOutput | null;
}
export interface ClassroomDetail {
  classroom: Classroom;
  work: ClassroomWork[];
  drafts: Array<{
    sessionId: string;
    experimentId: string;
    mode: "official" | "practice";
    code: string;
    updatedAt: string;
  }>;
}
export interface ScheduleDraft {
  id: string;
  title: string;
  startAt: string;
  durationMinutes: number;
  experimentIds: string[];
  language: string;
}
const base = "/api/classrooms";
export const classroomApi = {
  list: () =>
    apiRequest<{
      items: Array<
        Pick<
          Classroom,
          | "id"
          | "title"
          | "subject"
          | "batch"
          | "kind"
          | "semester"
          | "lifecycleState"
        > & { memberCount: number }
      >;
    }>(base),
  get: (id: string) => apiRequest<ClassroomDetail>(`${base}/${id}`),
  create: (body: unknown) =>
    apiRequest<{ classroom: Classroom }>(base, { method: "POST", body }),
  update: (id: string, body: unknown) =>
    apiRequest<{ classroom: Classroom }>(`${base}/${id}`, {
      method: "PATCH",
      body,
    }),
  join: (code: string) =>
    apiRequest<{ id: string }>(`${base}/join`, {
      method: "POST",
      body: { code },
    }),
  remove: (id: string, email: string) =>
    apiRequest(`${base}/${id}/members/${encodeURIComponent(email)}`, {
      method: "DELETE",
    }),
  schedule: (id: string, body: ScheduleDraft, editing = false) =>
    apiRequest(`${base}/${id}/sessions${editing ? `/${body.id}` : ""}`, {
      method: editing ? "PATCH" : "POST",
      body,
    }),
  sessionAction: (
    id: string,
    session: string,
    action: "activate" | "close" | "enter",
  ) =>
    apiRequest(`${base}/${id}/sessions/${session}/${action}`, {
      method: "POST",
      body: {},
    }),
  work: (id: string, session: string, body: unknown) =>
    apiRequest<{ work?: ClassroomWork; saved?: boolean }>(
      `${base}/${id}/sessions/${session}/work`,
      { method: "POST", body },
    ),
  grade: (
    id: string,
    email: string,
    experimentId: string,
    mark: number | null,
  ) =>
    apiRequest(`${base}/${id}/grades`, {
      method: "PATCH",
      body: { email, experimentId, mark },
    }),
  csvUrl: (id: string) => `${getApiBaseUrl()}${base}/${id}/gradebook.csv`,
  pdfUrl: (id: string, sessions: string[]) =>
    `${getApiBaseUrl()}${base}/${id}/history.pdf?${new URLSearchParams({ sessions: sessions.join(",") })}`,
};
export function averageMarks(marks: Array<number | null>): number | null {
  const graded = marks.filter((m): m is number => m !== null);
  return graded.length
    ? Math.round((graded.reduce((a, b) => a + b, 0) / graded.length) * 100) /
        100
    : null;
}
export function istInput(iso: string): string {
  return new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 16);
}
export function istToUtc(local: string): string {
  return new Date(`${local}:00+05:30`).toISOString();
}
