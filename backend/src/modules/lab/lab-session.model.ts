import type { UserRole } from "../../shared/types/auth";
import type { Department, ProblemLifecycleState } from "../../shared/types/domain";
import type { AssignedStudent, ClassTestAudienceFilter } from "../classtest/classtest.model";
import type { LabExperiment, LabKind } from "./lab.model";

/**
 * A Lab Session: a scheduled, assigned, proctored run of a lab (or a chosen subset of its
 * experiments), for a fixed window. This is the "assignable" half of Labs, reusing the class-test
 * audience/assignment/proctoring model. Unlike a class test it is coding + SQL only, so grading is
 * entirely automatic — there is no manual-marking step.
 *
 * The selected experiments are **snapshotted** onto the session at creation (like class tests embed
 * their questions), so editing the source lab later cannot change an in-flight assessment.
 */

export type LabSessionAttemptStatus = "ACTIVE" | "SUBMITTED" | "AUTO_SUBMITTED";
export type LabSessionGradingStatus = "PENDING" | "COMPLETE";

export interface LabSessionRecord {
  id: string;
  /** Provenance only — grading uses the frozen {@link experiments} snapshot, not the live lab. */
  labId: string;
  title: string;
  subject: string;
  kind: LabKind;
  experiments: LabExperiment[];
  startAt: Date;
  durationMinutes: number;
  audience: ClassTestAudienceFilter;
  assignedStudents: AssignedStudent[];
  maxViolations: number;
  lifecycleState: ProblemLifecycleState;
  resultsPublished: boolean;
  createdBy: string;
  createdByRole: UserRole;
  managerEmails: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface LabSessionExperimentState {
  experimentId: string;
  kind: "sql" | "coding";
  awardedPoints: number;
  maxPoints: number;
  /** SQL only: the query the student saved. Graded after the window closes, never during. */
  submittedSql: string | null;
  /** Coding only — mirrors the class-test coding attempt state. */
  lastSubmissionId: string | null;
  passedCount: number;
  totalCount: number;
  finalSubmissionStatus: string | null;
  finalSubmissionLanguage: string | null;
  draftCode: string | null;
  draftLanguage: string | null;
}

export interface LabSessionAttemptRecord {
  id: string;
  sessionId: string;
  userEmail: string;
  userName: string | null;
  userUid: string | null;
  userRollNumber: string | null;
  userDivision: string | null;
  userDepartment: Department | null;
  status: LabSessionAttemptStatus;
  experimentStates: LabSessionExperimentState[];
  autoScore: number;
  finalScore: number;
  gradingStatus: LabSessionGradingStatus;
  violationCount: number;
  suspectedMalpractice: boolean;
  startedAt: Date;
  deadlineAt: Date;
  submittedAt: Date | null;
  autoSubmittedAt: Date | null;
  timeTakenMs: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export function labSessionTotalPoints(experiments: readonly LabExperiment[]): number {
  return experiments.reduce((total, experiment) => total + Math.max(0, experiment.points), 0);
}

/** The only access check that matters at attempt time — the frozen assignment, never the filter. */
export function isAssignedToSession(session: LabSessionRecord, email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return session.assignedStudents.some((student) => student.email.toLowerCase() === normalized);
}
