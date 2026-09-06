import { AppError } from "../../shared/errors/app-error";
import type { UserRepository } from "../user/user.repository";
import {
  matchesAudienceFilter,
  toAssignedStudent,
  type AssignedStudent,
  type ClassTestAudienceFilter,
} from "./classtest.model";

/**
 * Turning an audience filter into a roster, shared by class tests, lab sessions and lab
 * attendance sessions.
 *
 * The three surfaces had three near-identical copies of this; the risk of drift is real, because
 * the security property lives here: only students the *filter* returned can end up on the frozen
 * list, so a crafted `assignedEmails` cannot pull in someone from another division or department.
 */

export interface AudienceCandidate extends AssignedStudent {
  semester: number | null;
}

/** Students matching the filter, in roll order so faculty can scan the list like a register. */
export async function resolveAudienceCandidates(
  userRepository: UserRepository,
  filter: ClassTestAudienceFilter,
): Promise<AudienceCandidate[]> {
  if (filter.department === null) {
    return [];
  }

  const roster = await userRepository.listByDepartment(filter.department, "STUDENT");
  return roster
    .filter((student) => matchesAudienceFilter(student, filter))
    .map((student) => ({ ...toAssignedStudent(student), semester: student.semester }))
    .sort((left, right) => Number(left.rollNumber ?? 0) - Number(right.rollNumber ?? 0));
}

/**
 * The frozen assignment list.
 *
 * An empty tick list means "everyone the filter found" — the common case of assigning a whole
 * class or lab batch.
 */
export async function resolveAssignedStudents(
  userRepository: UserRepository,
  filter: ClassTestAudienceFilter,
  assignedEmails: readonly string[],
): Promise<AssignedStudent[]> {
  const candidates = await resolveAudienceCandidates(userRepository, filter);
  if (candidates.length === 0) {
    throw new AppError(400, "No students match this department, division and roll range");
  }

  const strip = ({ semester: _semester, ...student }: AudienceCandidate): AssignedStudent => student;

  if (assignedEmails.length === 0) {
    return candidates.map(strip);
  }

  const wanted = new Set(assignedEmails.map((email) => email.trim().toLowerCase()));
  const selected = candidates.filter((student) => wanted.has(student.email.toLowerCase()));
  if (selected.length === 0) {
    throw new AppError(400, "None of the selected students match this department, division and roll range");
  }
  return selected.map(strip);
}
