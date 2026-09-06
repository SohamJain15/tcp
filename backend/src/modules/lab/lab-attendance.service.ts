import { randomUUID } from "node:crypto";

import { env } from "../../config/env";
import { AppError } from "../../shared/errors/app-error";
import type { AuthenticatedUser } from "../../shared/types/auth";
import { ipInNetwork, toNetworkCidr } from "../../shared/utils/client-ip";
import { deriveDivisionFromUid } from "../../shared/utils/uid-department";
import { resolveAssignedStudents } from "../classtest/audience";
import type { UserRepository } from "../user/user.repository";
import {
  isAttendanceSessionOpen,
  isOnAttendanceRoster,
  labAttendanceTotals,
  toFacultyAttendanceSession,
  toStudentAttendanceSession,
  type FacultyAttendanceSession,
  type LabAdmissionRecord,
  type LabAttendanceSessionRecord,
  type StudentAttendanceSession,
} from "./lab-attendance.model";
import type { LabAdmissionRepository, LabAttendanceSessionRepository } from "./lab-attendance.repository";
import type {
  AdmissionDecisionInput,
  BulkAdmissionInput,
  JoinRequestInput,
  OpenAttendanceSessionInput,
  UpdateAttendanceSessionInput,
} from "./lab-attendance.validator";
import { currentJoinCode, createJoinCodeSecret, verifyJoinCode } from "./lab-join-code";
import type { LabRecord } from "./lab.model";
import type { LabRepository } from "./lab.repository";

/**
 * How wide a "network" is for the network gate. A /24 is the usual size of a lab subnet; sites
 * where the whole campus egresses through one NAT address should turn the gate off rather than
 * widen it, since it would then prove only "on campus".
 */
const IPV4_NETWORK_PREFIX = env.LAB_ATTENDANCE_IP_PREFIX;

export interface FacultyAdmissionRow {
  id: string;
  email: string;
  name: string | null;
  uid: string | null;
  rollNumber: string | null;
  division: string | null;
  status: LabAdmissionRecord["status"];
  requestedAt: Date;
  decidedAt: Date | null;
  requestIp: string | null;
  denialReason: string | null;
  /** False flags a device that has left the lab network since it joined. Informational only. */
  ipMatchesHost: boolean;
}

export interface LabAttendanceService {
  // faculty
  listSessions(user: AuthenticatedUser): Promise<FacultyAttendanceSession[]>;
  openSession(
    user: AuthenticatedUser,
    input: OpenAttendanceSessionInput,
    clientIp: string | null,
  ): Promise<FacultyAttendanceSession>;
  getSession(user: AuthenticatedUser, sessionId: string): Promise<FacultyAttendanceSession>;
  updateSession(
    user: AuthenticatedUser,
    sessionId: string,
    input: UpdateAttendanceSessionInput,
    clientIp: string | null,
  ): Promise<FacultyAttendanceSession>;
  getJoinCode(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<{ code: string; expiresAt: Date; stepSeconds: number }>;
  listAdmissions(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<{
    pending: FacultyAdmissionRow[];
    admitted: FacultyAdmissionRow[];
    denied: FacultyAdmissionRow[];
    counts: { pending: number; admitted: number; denied: number; roster: number };
  }>;
  decideAdmission(
    user: AuthenticatedUser,
    sessionId: string,
    admissionId: string,
    input: AdmissionDecisionInput,
  ): Promise<FacultyAdmissionRow>;
  decideAdmissionsBulk(
    user: AuthenticatedUser,
    sessionId: string,
    input: BulkAdmissionInput,
  ): Promise<{ updated: number }>;
  // student
  getMine(
    user: AuthenticatedUser,
    clientIp: string | null,
  ): Promise<{ session: StudentAttendanceSession | null; admission: { status: string; denialReason: string | null } | null }>;
  getMineById(
    user: AuthenticatedUser,
    sessionId: string,
    clientIp: string | null,
  ): Promise<{ session: StudentAttendanceSession | null; admission: { status: string; denialReason: string | null } | null }>;
  requestJoin(
    user: AuthenticatedUser,
    sessionId: string,
    input: JoinRequestInput,
    clientIp: string | null,
  ): Promise<{ status: string; denialReason: string | null }>;
}

interface LabAttendanceServiceDependencies {
  labAttendanceSessionRepository: LabAttendanceSessionRepository;
  labAdmissionRepository: LabAdmissionRepository;
  labRepository: LabRepository;
  userRepository: UserRepository;
  now: () => Date;
}

/** 404 rather than 403, matching the rest of the lab module: do not confirm what you cannot manage. */
function ensureCanManage(
  user: AuthenticatedUser,
  session: LabAttendanceSessionRecord | null,
): LabAttendanceSessionRecord {
  const canManage =
    session !== null && (session.openedBy === user.email || session.managerEmails.includes(user.email));
  if (!canManage) {
    throw new AppError(404, "Lab session not found");
  }
  return session;
}

function ensureCanManageLab(user: AuthenticatedUser, lab: LabRecord | null): LabRecord {
  const canManage = lab !== null && (lab.createdBy === user.email || lab.managerEmails.includes(user.email));
  if (!canManage) {
    throw new AppError(404, "Lab not found");
  }
  return lab;
}

export function createLabAttendanceService(
  dependencies: LabAttendanceServiceDependencies,
): LabAttendanceService {
  function toRow(session: LabAttendanceSessionRecord, admission: LabAdmissionRecord): FacultyAdmissionRow {
    return {
      id: admission.id,
      email: admission.userEmail,
      name: admission.userName,
      uid: admission.userUid,
      rollNumber: admission.userRollNumber,
      division: admission.userDivision,
      status: admission.status,
      requestedAt: admission.requestedAt,
      decidedAt: admission.decidedAt,
      requestIp: admission.requestIp,
      denialReason: admission.denialReason,
      ipMatchesHost:
        session.hostIpCidr === null || ipInNetwork(admission.lastSeenIp ?? admission.requestIp, session.hostIpCidr),
    };
  }

  async function loadOpenSessionFor(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<LabAttendanceSessionRecord> {
    const session = await dependencies.labAttendanceSessionRepository.getById(sessionId);
    if (!session || !isAttendanceSessionOpen(session, dependencies.now())) {
      throw new AppError(404, "That lab session has ended", { code: "LAB_SESSION_CLOSED" });
    }
    if (!isOnAttendanceRoster(session, user.email)) {
      throw new AppError(403, "You are not in this lab batch", { code: "LAB_NOT_ON_ROSTER" });
    }
    return session;
  }

  return {
    async listSessions(user) {
      const sessions = await dependencies.labAttendanceSessionRepository.listByOwner(user.email);
      return sessions.map(toFacultyAttendanceSession);
    },

    async openSession(user, input, clientIp) {
      const lab = ensureCanManageLab(user, await dependencies.labRepository.getById(input.labId));
      const now = dependencies.now();

      // One live session per lab: two open lobbies for the same lab would each gate the other's
      // batch, and neither teacher would understand why their students were refused.
      const existing = await dependencies.labAttendanceSessionRepository.findOpenByLab(lab.id, now);
      if (existing) {
        throw new AppError(409, "A session is already running for this lab. Close it first.", {
          code: "LAB_SESSION_ALREADY_OPEN",
          sessionId: existing.id,
        });
      }

      const roster = (
        await resolveAssignedStudents(dependencies.userRepository, input.audience, input.assignedEmails)
      ).map((student) => ({ ...student, email: student.email.trim().toLowerCase() }));

      const hostIpCidr = clientIp ? toNetworkCidr(clientIp, IPV4_NETWORK_PREFIX) : null;
      if (input.gates.requireNetworkMatch && hostIpCidr === null) {
        throw new AppError(
          400,
          "Could not determine this device's network, so the lab-network check cannot be enabled",
          { code: "LAB_HOST_NETWORK_UNKNOWN" },
        );
      }

      const session: LabAttendanceSessionRecord = {
        id: `labatt_${randomUUID()}`,
        labId: lab.id,
        labTitle: lab.title,
        subject: lab.subject,
        batchLabel: input.batchLabel,
        audience: input.audience,
        roster,
        gates: input.gates,
        joinCodeSecret: createJoinCodeSecret(),
        hostIp: clientIp,
        hostIpCidr,
        state: "OPEN",
        openedBy: user.email,
        openedByRole: user.role,
        managerEmails: lab.managerEmails,
        openedAt: now,
        closedAt: null,
        expiresAt: new Date(now.getTime() + input.durationMinutes * 60_000),
        createdAt: now,
        updatedAt: now,
      };

      await dependencies.labAttendanceSessionRepository.save(session);
      return toFacultyAttendanceSession(session);
    },

    async getSession(user, sessionId) {
      return toFacultyAttendanceSession(
        ensureCanManage(user, await dependencies.labAttendanceSessionRepository.getById(sessionId)),
      );
    },

    async updateSession(user, sessionId, input, clientIp) {
      const existing = ensureCanManage(user, await dependencies.labAttendanceSessionRepository.getById(sessionId));
      const now = dependencies.now();

      const gates = { ...existing.gates, ...(input.gates ?? {}) };
      let hostIp = existing.hostIp;
      let hostIpCidr = existing.hostIpCidr;

      if (input.recaptureHostIp) {
        hostIp = clientIp;
        hostIpCidr = clientIp ? toNetworkCidr(clientIp, IPV4_NETWORK_PREFIX) : null;
      }

      if (gates.requireNetworkMatch && hostIpCidr === null) {
        throw new AppError(
          400,
          "Could not determine this device's network, so the lab-network check cannot be enabled",
          { code: "LAB_HOST_NETWORK_UNKNOWN" },
        );
      }

      const updated: LabAttendanceSessionRecord = {
        ...existing,
        gates,
        hostIp,
        hostIpCidr,
        state: input.state ?? existing.state,
        closedAt: input.state === "CLOSED" ? existing.closedAt ?? now : existing.closedAt,
        updatedAt: now,
      };

      await dependencies.labAttendanceSessionRepository.save(updated);
      return toFacultyAttendanceSession(updated);
    },

    async getJoinCode(user, sessionId) {
      const session = ensureCanManage(user, await dependencies.labAttendanceSessionRepository.getById(sessionId));
      return currentJoinCode(session.joinCodeSecret, dependencies.now());
    },

    async listAdmissions(user, sessionId) {
      const session = ensureCanManage(user, await dependencies.labAttendanceSessionRepository.getById(sessionId));
      const admissions = await dependencies.labAdmissionRepository.listBySession(sessionId);
      const rows = admissions.map((admission) => toRow(session, admission));
      return {
        pending: rows.filter((row) => row.status === "PENDING"),
        admitted: rows.filter((row) => row.status === "ADMITTED"),
        denied: rows.filter((row) => row.status === "DENIED" || row.status === "REVOKED"),
        counts: { ...labAttendanceTotals(admissions), roster: session.roster.length },
      };
    },

    async decideAdmission(user, sessionId, admissionId, input) {
      const session = ensureCanManage(user, await dependencies.labAttendanceSessionRepository.getById(sessionId));
      const admission = await dependencies.labAdmissionRepository.getById(admissionId);
      if (!admission || admission.sessionId !== sessionId) {
        throw new AppError(404, "Request not found");
      }

      const updated: LabAdmissionRecord = {
        ...admission,
        status: input.status,
        decidedAt: dependencies.now(),
        decidedBy: user.email,
        denialReason: input.status === "ADMITTED" ? null : input.reason,
        updatedAt: dependencies.now(),
      };
      await dependencies.labAdmissionRepository.save(updated);
      return toRow(session, updated);
    },

    async decideAdmissionsBulk(user, sessionId, input) {
      ensureCanManage(user, await dependencies.labAttendanceSessionRepository.getById(sessionId));
      const now = dependencies.now();
      const wanted = new Set(input.admissionIds);
      const admissions = await dependencies.labAdmissionRepository.listBySession(sessionId);

      let updated = 0;
      for (const admission of admissions) {
        if (!wanted.has(admission.id)) {
          continue;
        }
        await dependencies.labAdmissionRepository.save({
          ...admission,
          status: input.status,
          decidedAt: now,
          decidedBy: user.email,
          denialReason: null,
          updatedAt: now,
        });
        updated += 1;
      }
      return { updated };
    },

    async getMine(user, clientIp) {
      const session = await dependencies.labAttendanceSessionRepository.findOpenForStudent(
        user.email,
        dependencies.now(),
      );
      if (!session) {
        return { session: null, admission: null };
      }
      return this.getMineById(user, session.id, clientIp);
    },

    async getMineById(user, sessionId, clientIp) {
      const session = await dependencies.labAttendanceSessionRepository.getById(sessionId);
      if (!session || !isAttendanceSessionOpen(session, dependencies.now()) || !isOnAttendanceRoster(session, user.email)) {
        return { session: null, admission: null };
      }

      const admission = await dependencies.labAdmissionRepository.getBySessionAndUser(sessionId, user.email);
      if (admission && clientIp && admission.lastSeenIp !== clientIp) {
        // Recorded so the teacher can see a device that has left the lab network. Never enforced
        // here: ejecting a student whose Wi-Fi roamed mid-experiment would be worse than the risk.
        await dependencies.labAdmissionRepository.save({
          ...admission,
          lastSeenIp: clientIp,
          updatedAt: dependencies.now(),
        });
      }

      return {
        session: toStudentAttendanceSession(session),
        admission: admission ? { status: admission.status, denialReason: admission.denialReason } : null,
      };
    },

    async requestJoin(user, sessionId, input, clientIp) {
      const session = await loadOpenSessionFor(user, sessionId);
      const now = dependencies.now();

      if (session.gates.requireNetworkMatch) {
        // Fails closed in production: an address we cannot resolve is not proof of being in the room.
        const onNetwork = clientIp === null ? env.NODE_ENV !== "production" : ipInNetwork(clientIp, session.hostIpCidr);
        if (!onNetwork) {
          throw new AppError(403, "Connect to the lab network and try again", { code: "LAB_WRONG_NETWORK" });
        }
      }

      if (session.gates.requireJoinCode && !verifyJoinCode(session.joinCodeSecret, input.joinCode, now)) {
        throw new AppError(403, "That code is wrong or has expired — read the current one from the screen", {
          code: "LAB_BAD_JOIN_CODE",
        });
      }

      const profile = await dependencies.userRepository.getByEmail(user.email);
      const existing = await dependencies.labAdmissionRepository.getBySessionAndUser(sessionId, user.email);
      // Re-joining after a denial is allowed and resets to PENDING — teachers mis-click, and a
      // student should not be locked out of their own lab period by one stray tap. The previous
      // reason stays on the record as the audit trail.
      const status = session.gates.requireAdmission ? "PENDING" : "ADMITTED";

      const record: LabAdmissionRecord = {
        id: existing?.id ?? `labadm_${randomUUID()}`,
        sessionId,
        labId: session.labId,
        userEmail: user.email.trim().toLowerCase(),
        userName: profile?.name ?? user.name ?? null,
        userUid: profile?.uid ?? null,
        userRollNumber: profile?.rollNumber ?? null,
        userDivision: deriveDivisionFromUid(profile?.uid ?? ""),
        userDepartment: profile?.department ?? null,
        status: existing?.status === "ADMITTED" ? "ADMITTED" : status,
        requestedAt: now,
        decidedAt: existing?.status === "ADMITTED" ? existing.decidedAt : null,
        decidedBy: existing?.status === "ADMITTED" ? existing.decidedBy : null,
        requestIp: clientIp,
        lastSeenIp: clientIp,
        denialReason: existing?.denialReason ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      await dependencies.labAdmissionRepository.save(record);
      return { status: record.status, denialReason: record.denialReason };
    },
  };
}
