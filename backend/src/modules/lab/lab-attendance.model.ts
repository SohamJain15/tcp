import type { UserRole } from "../../shared/types/auth";
import type { Department } from "../../shared/types/domain";
import type { AssignedStudent, ClassTestAudienceFilter } from "../classtest/classtest.model";

/**
 * Lab attendance: the live session a teacher opens while standing in the lab.
 *
 * Deliberately *not* a lab session (`lab-session.model.ts`). That entity is a scheduled, timed,
 * auto-graded assessment — it snapshots its own copy of the experiments, owns attempts with scores
 * and violations, and decides access from a list frozen days in advance. An attendance session has
 * none of that: there is no content (students work the live lab), no deadline, no grading. What it
 * has instead is a *live admission ledger* — a roster plus a per-student decision the teacher makes
 * in the room, which is the whole point.
 *
 * Three gates, each independently togglable, because no single one is sufficient on its own:
 * the lobby depends on a teacher looking up, the network check cannot see who is holding the
 * laptop, and a code can be relayed over a phone. Together they make attending from home
 * meaningfully hard.
 */

export type LabAttendanceSessionState = "OPEN" | "CLOSED";

export type LabAdmissionStatus = "PENDING" | "ADMITTED" | "DENIED" | "REVOKED";

export interface LabAttendanceGates {
  /** Meet-style lobby: a request waits until the teacher admits it. */
  requireAdmission: boolean;
  /** The join must originate from the same network the teacher opened the session on. */
  requireNetworkMatch: boolean;
  /** A rotating six-digit code, readable only from the teacher's screen. */
  requireJoinCode: boolean;
}

export interface LabAttendanceSessionRecord {
  id: string;
  /** The regular, self-paced lab this session admits students into. */
  labId: string;
  labTitle: string;
  subject: string;
  /** A division is split into two lab batches of ~35; this names which one is in the room. */
  batchLabel: string | null;
  audience: ClassTestAudienceFilter;
  /**
   * Who this batch is. Frozen when the session opens, so a profile edit mid-session cannot silently
   * add or remove someone. Emails are stored lowercased — `findOpenForStudent` queries this array
   * directly and a mixed-case address would simply not match.
   */
  roster: AssignedStudent[];
  gates: LabAttendanceGates;
  /** Never serialised into any response. The code is derived from it on demand. */
  joinCodeSecret: string;
  /** The teacher's address when the session opened, and the network derived from it. */
  hostIp: string | null;
  hostIpCidr: string | null;
  state: LabAttendanceSessionState;
  openedBy: string;
  openedByRole: UserRole;
  managerEmails: string[];
  openedAt: Date;
  closedAt: Date | null;
  /**
   * Hard stop. Without it, a session a teacher forgot to close would keep the lab gated overnight
   * and lock out every student in the batch.
   */
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LabAdmissionRecord {
  id: string;
  sessionId: string;
  labId: string;
  userEmail: string;
  userName: string | null;
  userUid: string | null;
  userRollNumber: string | null;
  userDivision: string | null;
  userDepartment: Department | null;
  status: LabAdmissionStatus;
  requestedAt: Date;
  decidedAt: Date | null;
  decidedBy: string | null;
  /** Where the join came from, shown to the teacher beside the name. */
  requestIp: string | null;
  /**
   * Refreshed by the student's status poll. A device that has wandered off the lab network is
   * flagged for the teacher rather than ejected — re-checking the network on every run/submit
   * would throw out an honest student whose Wi-Fi roamed mid-experiment.
   */
  lastSeenIp: string | null;
  denialReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// --- student- and faculty-facing projections ---------------------------------

/** What a student may know about the session: enough to join, nothing about anyone else. */
export interface StudentAttendanceSession {
  id: string;
  labId: string;
  labTitle: string;
  subject: string;
  batchLabel: string | null;
  gates: LabAttendanceGates;
}

export interface StudentAttendanceState {
  sessionId: string;
  status: LabAdmissionStatus | null;
  denialReason: string | null;
  gates: LabAttendanceGates;
}

export type FacultyAttendanceSession = Omit<LabAttendanceSessionRecord, "joinCodeSecret">;

// --- derivations --------------------------------------------------------------

export function isAttendanceSessionOpen(session: LabAttendanceSessionRecord, now: Date): boolean {
  return session.state === "OPEN" && session.expiresAt.getTime() > now.getTime();
}

/** Mirrors `isAssignedToClassTest`: the roster is the authority on who this batch is. */
export function isOnAttendanceRoster(session: LabAttendanceSessionRecord, email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return session.roster.some((student) => student.email.toLowerCase() === normalized);
}

export function labAttendanceTotals(admissions: readonly LabAdmissionRecord[]): {
  pending: number;
  admitted: number;
  denied: number;
} {
  return {
    pending: admissions.filter((admission) => admission.status === "PENDING").length,
    admitted: admissions.filter((admission) => admission.status === "ADMITTED").length,
    denied: admissions.filter((admission) => admission.status === "DENIED" || admission.status === "REVOKED").length,
  };
}

/**
 * The only place the join-code secret is dropped.
 *
 * Built by omission rather than by spreading the record, so a new secret-bearing field cannot leak
 * by being added to the record and forgotten here.
 */
export function toFacultyAttendanceSession(session: LabAttendanceSessionRecord): FacultyAttendanceSession {
  const { joinCodeSecret: _joinCodeSecret, ...rest } = session;
  return rest;
}

/** No roster, no other student's name, no host IP, no secret. */
export function toStudentAttendanceSession(session: LabAttendanceSessionRecord): StudentAttendanceSession {
  return {
    id: session.id,
    labId: session.labId,
    labTitle: session.labTitle,
    subject: session.subject,
    batchLabel: session.batchLabel,
    gates: session.gates,
  };
}
