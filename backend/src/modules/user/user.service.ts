import type { LeaderboardRepository } from "../leaderboard/leaderboard.repository";
import {
  buildLeaderboardEntryFromUser,
  buildLeaderboardRanker,
  isRankedLeaderboardEntry,
} from "../leaderboard/leaderboard.model";
import type { AuthenticatedUser } from "../../shared/types/auth";
import { AppError } from "../../shared/errors/app-error";
import { estimateActiveMinutes } from "../../shared/utils/activity";
import { normalizeDepartment, normalizeRole } from "../../shared/utils/normalize";
import { deriveSemesterFromUid, uidMatchesDepartment } from "../../shared/utils/uid-department";
import type { Department } from "../../shared/types/domain";
import type { SubmissionAnalyticsRecord, SubmissionRepository } from "../submission/submission.repository";
import type {
  UserProfileAnalyticsResponse,
  UserProfileResponse,
  UserRecord,
} from "./user.model";
import { toUserProfileAnalyticsSubmissionItem, toUserProfileResponse } from "./user.model";
import type { UserRepository } from "./user.repository";

export interface UpdateCurrentUserProfileInput {
  name: string;
  department: Department;
  designation?: string | null;
  uid?: string | null;
  rollNumber?: string | null;
  semester?: number | null;
  linkedInUrl: string | null;
  githubUrl: string | null;
}

export interface UserService {
  syncAuthenticatedUser(user: AuthenticatedUser): Promise<UserRecord>;
  getCurrentUser(user: AuthenticatedUser): Promise<UserProfileResponse>;
  getUserByEmail(email: string): Promise<UserProfileResponse>;
  getCurrentUserAnalytics(user: AuthenticatedUser): Promise<UserProfileAnalyticsResponse>;
  getUserAnalyticsByEmail(user: AuthenticatedUser, email: string): Promise<UserProfileAnalyticsResponse>;
  updateCurrentUserProfile(
    user: AuthenticatedUser,
    input: UpdateCurrentUserProfileInput,
  ): Promise<UserProfileResponse>;
}

interface UserServiceDependencies {
  userRepository: UserRepository;
  leaderboardRepository: LeaderboardRepository;
  submissionRepository: SubmissionRepository;
  now: () => Date;
}

function hasCompletedProfile(user: UserRecord): boolean {
  const normalizedUid = user.uid?.trim() ?? "";
  const hasValidStudentUid = normalizedUid !== "" && !normalizedUid.toLowerCase().includes("mock");

  // Admins have no department, UID or designation to fill in — there is no profile form for them, so
  // "complete" is the only answer that lets them past profileCompletionMiddleware.
  if (user.role === "ADMIN") {
    return true;
  }

  if (user.role === "FACULTY") {
    return Boolean(user.name && user.department && user.designation);
  }

  return Boolean(user.name && user.department && user.semester && hasValidStudentUid && user.rollNumber);
}

function createDefaultUser(authUser: AuthenticatedUser, now: Date): UserRecord {
  const role = normalizeRole(authUser.role);

  return {
    email: authUser.email,
    role,
    name: authUser.name ?? null,
    uid: authUser.uid ?? null,
    // Admins have nothing to complete, so they are born complete; every other role starts false and
    // is gated by profileCompletionMiddleware until they fill the form in.
    isProfileComplete: role === "ADMIN",
    designation: null,
    // An admin is never HOD — the department routes stay scoped to real HODs.
    isHod: role === "ADMIN" ? false : authUser.isHod ?? false,
    rollNumber: null,
    department: normalizeDepartment(authUser.department) ?? null,
    semester: null,
    linkedInUrl: null,
    githubUrl: null,
    skills: [],
    rating: 0,
    score: 0,
    problemsSolved: 0,
    submissionCount: 0,
    acceptedSubmissionCount: 0,
    accuracy: 0,
    avgAcceptedRuntimeMs: 0,
    avgAcceptedMemoryKb: 0,
    primaryLanguage: null,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
    lastAcceptedAt: null,
  };
}

function mergeUser(existing: UserRecord, authUser: AuthenticatedUser, now: Date): UserRecord {
  const uid = authUser.uid ?? existing.uid;
  const role = normalizeRole(authUser.role);

  return {
    ...existing,
    email: authUser.email,
    role,
    name: authUser.name ?? existing.name,
    // The CoE JWT is the trusted source for uid/isHod: when present it overwrites
    // any stored value (auto-correcting mismatches on every login).
    uid,
    department: existing.department ?? normalizeDepartment(authUser.department) ?? null,
    // Admins have no profile form; forcing this true keeps profileCompletionMiddleware satisfied
    // without needing a bypass in every router. It also self-heals a record that was written while
    // the account was still being resolved as FACULTY.
    isProfileComplete: role === "ADMIN" ? true : existing.isProfileComplete,
    designation: existing.designation,
    // An admin is never HOD, regardless of what a stale record or token claim says.
    isHod: role === "ADMIN" ? false : authUser.isHod ?? existing.isHod,
    rollNumber: existing.rollNumber,
    // Recomputed from the UID on every login, so it advances with the academic calendar
    // instead of holding whatever the student typed once. Faculty have no semester, and an
    // unparseable UID keeps the stored value rather than wiping it.
    semester:
      role === "STUDENT" ? deriveSemesterFromUid(uid, now) ?? existing.semester : existing.semester,
    linkedInUrl: existing.linkedInUrl,
    githubUrl: existing.githubUrl,
    skills: existing.skills,
    score: existing.rating,
    lastLoginAt: now,
    updatedAt: now,
  };
}

async function buildRankedProfileResponse(
  user: UserRecord,
  leaderboardRepository: LeaderboardRepository,
): Promise<UserProfileResponse> {
  if (!isRankedLeaderboardEntry(user)) {
    return toUserProfileResponse(user, null);
  }

  const leaderboard = (await leaderboardRepository.list()).filter(isRankedLeaderboardEntry);
  const rank =
    leaderboard.sort(buildLeaderboardRanker(leaderboard).compare).findIndex((entry) => entry.email === user.email) + 1;

  return toUserProfileResponse(user, rank > 0 ? rank : null);
}

/**
 * Pure aggregation over submissions. Typed against the code-free record so it can be
 * reused by aggregate/reporting paths (e.g. the department views) that must never load
 * source code; a full `SubmissionRecord[]` remains assignable.
 */
export function buildAnalyticsFromSubmissions(
  submissions: readonly SubmissionAnalyticsRecord[],
): UserProfileAnalyticsResponse {
  const problemSubmissions = submissions.filter((submission) => submission.sourceType === "problem");
  const acceptedProblemSubmissions = problemSubmissions.filter((submission) => submission.status === "ACCEPTED");
  const firstAcceptedByResource = new Map<string, (typeof acceptedProblemSubmissions)[number]>();

  for (const submission of acceptedProblemSubmissions
    .slice()
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())) {
    if (!firstAcceptedByResource.has(submission.problemId)) {
      firstAcceptedByResource.set(submission.problemId, submission);
    }
  }

  const solvedDifficultyCounts = new Map<string, number>([
    ["Easy", 0],
    ["Medium", 0],
    ["Hard", 0],
  ]);
  for (const submission of firstAcceptedByResource.values()) {
    solvedDifficultyCounts.set(
      submission.problemDifficultySnapshot,
      (solvedDifficultyCounts.get(submission.problemDifficultySnapshot) ?? 0) + 1,
    );
  }

  const languageCounts = new Map<string, number>();
  for (const submission of problemSubmissions) {
    languageCounts.set(submission.language, (languageCounts.get(submission.language) ?? 0) + 1);
  }

  const heatmapCounts = new Map<string, number>();
  const acceptedCounts = new Map<string, number>();
  for (const submission of problemSubmissions) {
    const dateKey = submission.createdAt.toISOString().slice(0, 10);
    heatmapCounts.set(dateKey, (heatmapCounts.get(dateKey) ?? 0) + 1);
    if (submission.status === "ACCEPTED") {
      acceptedCounts.set(dateKey, (acceptedCounts.get(dateKey) ?? 0) + 1);
    }
  }

  // First solves are a free by-product of the map built above, and are what a
  // "problems solved over time" curve must be built from — re-deriving it from the
  // capped submission history would undercount.
  const firstSolveCounts = new Map<string, number>();
  for (const submission of firstAcceptedByResource.values()) {
    const dateKey = submission.createdAt.toISOString().slice(0, 10);
    firstSolveCounts.set(dateKey, (firstSolveCounts.get(dateKey) ?? 0) + 1);
  }

  const progressTrend = Array.from(heatmapCounts.keys())
    .sort((left, right) => left.localeCompare(right))
    .map((date) => ({
      date,
      submissionCount: heatmapCounts.get(date) ?? 0,
      acceptedCount: acceptedCounts.get(date) ?? 0,
      firstSolveCount: firstSolveCounts.get(date) ?? 0,
    }));

  // Estimated from every submission (practice and contest), since both represent time
  // the student actually spent working in the platform.
  const activeTimeEstimate = estimateActiveMinutes(submissions.map((submission) => submission.createdAt));

  const recentAcceptedSubmissions = acceptedProblemSubmissions
    .slice()
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 8)
    .map(toUserProfileAnalyticsSubmissionItem);

  const submissionHistory = problemSubmissions
    .slice()
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 25)
    .map(toUserProfileAnalyticsSubmissionItem);

  return {
    difficultyBreakdown: [
      { difficulty: "Easy", solvedCount: solvedDifficultyCounts.get("Easy") ?? 0 },
      { difficulty: "Medium", solvedCount: solvedDifficultyCounts.get("Medium") ?? 0 },
      { difficulty: "Hard", solvedCount: solvedDifficultyCounts.get("Hard") ?? 0 },
    ],
    languageBreakdown: Array.from(languageCounts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([language, submissionCount]) => ({
        language: language as UserProfileAnalyticsResponse["languageBreakdown"][number]["language"],
        submissionCount,
      })),
    submissionHeatmap: Array.from(heatmapCounts.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([date, submissionCount]) => ({ date, submissionCount })),
    progressTrend,
    activeTime: {
      estimatedActiveMinutes: activeTimeEstimate.totalMinutes,
      byDate: activeTimeEstimate.byDate,
    },
    recentAcceptedSubmissions,
    submissionHistory,
  };
}

export function createUserService(dependencies: UserServiceDependencies): UserService {
  return {
    async syncAuthenticatedUser(authUser) {
      const now = dependencies.now();
      const existingUser = await dependencies.userRepository.getByEmail(authUser.email);
      const synchronizedUser = existingUser ? mergeUser(existingUser, authUser, now) : createDefaultUser(authUser, now);
      await dependencies.userRepository.save(synchronizedUser);

      return synchronizedUser;
    },

    async getCurrentUser(authUser) {
      const user = await this.syncAuthenticatedUser(authUser);
      if (isRankedLeaderboardEntry(user)) {
        await dependencies.leaderboardRepository.save(buildLeaderboardEntryFromUser(user));
      } else {
        await dependencies.leaderboardRepository.delete(user.email);
      }

      return buildRankedProfileResponse(user, dependencies.leaderboardRepository);
    },

    async getUserByEmail(email) {
      const user = await dependencies.userRepository.getByEmail(email);
      if (!user) {
        throw new AppError(404, "User not found");
      }

      return buildRankedProfileResponse(user, dependencies.leaderboardRepository);
    },

    async getCurrentUserAnalytics(authUser) {
      const submissions = await dependencies.submissionRepository.list({ userEmail: authUser.email });
      return buildAnalyticsFromSubmissions(submissions);
    },

    async getUserAnalyticsByEmail(authUser, email) {
      if (authUser.role !== "FACULTY" && authUser.email !== email) {
        throw new AppError(403, "You are not allowed to view this profile");
      }

      const user = await dependencies.userRepository.getByEmail(email);
      if (!user) {
        throw new AppError(404, "User not found");
      }

      const submissions = await dependencies.submissionRepository.list({ userEmail: email });
      return buildAnalyticsFromSubmissions(submissions);
    },

    async updateCurrentUserProfile(authUser, input) {
      const now = dependencies.now();
      const baseUser = await this.syncAuthenticatedUser(authUser);

      // Students: the UID is authoritative from the CoE payload (auto-filled, not
      // typed). Fall back to the submitted value only if the payload has none.
      const resolvedUid = authUser.role === "STUDENT" ? baseUser.uid ?? input.uid ?? null : baseUser.uid;

      // Enforce that a student's UID branch matches the chosen department.
      if (authUser.role === "STUDENT" && resolvedUid && !uidMatchesDepartment(resolvedUid, input.department)) {
        throw new AppError(
          400,
          `Your UID (${resolvedUid}) does not match the selected department. Please choose the department that matches your UID.`,
        );
      }

      const updatedUserBase: UserRecord = {
        ...baseUser,
        name: input.name,
        designation: authUser.role === "FACULTY" ? input.designation ?? null : null,
        uid: resolvedUid,
        rollNumber: authUser.role === "STUDENT" ? input.rollNumber ?? null : null,
        department: input.department,
        // Derived from the UID, never taken from the request: a stale or spoofed client value
        // must not be able to move a student into another semester.
        semester: authUser.role === "STUDENT" ? deriveSemesterFromUid(resolvedUid, now) : null,
        linkedInUrl: input.linkedInUrl,
        githubUrl: input.githubUrl,
        // isHod is never editable here — it comes solely from the trusted CoE payload.
        isHod: baseUser.isHod,
        updatedAt: now,
      };
      const updatedUser: UserRecord = {
        ...updatedUserBase,
        isProfileComplete: hasCompletedProfile(updatedUserBase),
      };

      await dependencies.userRepository.save(updatedUser);
      if (isRankedLeaderboardEntry(updatedUser)) {
        await dependencies.leaderboardRepository.save(buildLeaderboardEntryFromUser(updatedUser));
      } else {
        await dependencies.leaderboardRepository.delete(updatedUser.email);
      }

      return buildRankedProfileResponse(updatedUser, dependencies.leaderboardRepository);
    },
  };
}
