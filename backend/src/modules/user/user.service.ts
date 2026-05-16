import type { LeaderboardRepository } from "../leaderboard/leaderboard.repository";
import {
  buildLeaderboardEntryFromUser,
  compareLeaderboardEntries,
  isRankedLeaderboardEntry,
} from "../leaderboard/leaderboard.model";
import type { AuthenticatedUser } from "../../shared/types/auth";
import { AppError } from "../../shared/errors/app-error";
import { normalizeDepartment, normalizeRole } from "../../shared/utils/normalize";
import type { Department } from "../../shared/types/domain";
import type { SubmissionRepository } from "../submission/submission.repository";
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

  if (user.role === "FACULTY") {
    return Boolean(user.name && user.department && user.designation);
  }

  return Boolean(user.name && user.department && user.semester && hasValidStudentUid && user.rollNumber);
}

function createDefaultUser(authUser: AuthenticatedUser, now: Date): UserRecord {
  return {
    email: authUser.email,
    role: normalizeRole(authUser.role),
    name: authUser.name ?? null,
    uid: authUser.uid ?? null,
    isProfileComplete: false,
    designation: null,
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
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
    lastAcceptedAt: null,
  };
}

function mergeUser(existing: UserRecord, authUser: AuthenticatedUser, now: Date): UserRecord {
  return {
    ...existing,
    email: authUser.email,
    role: normalizeRole(authUser.role),
    name: authUser.name ?? existing.name,
    uid: authUser.uid ?? existing.uid,
    department: existing.department ?? normalizeDepartment(authUser.department) ?? null,
    isProfileComplete: existing.isProfileComplete,
    designation: existing.designation,
    rollNumber: existing.rollNumber,
    semester: existing.semester,
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
  const rank = leaderboard.sort(compareLeaderboardEntries).findIndex((entry) => entry.email === user.email) + 1;

  return toUserProfileResponse(user, rank > 0 ? rank : null);
}

function buildAnalyticsFromSubmissions(
  submissions: Awaited<ReturnType<SubmissionRepository["list"]>>,
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
  for (const submission of problemSubmissions) {
    const dateKey = submission.createdAt.toISOString().slice(0, 10);
    heatmapCounts.set(dateKey, (heatmapCounts.get(dateKey) ?? 0) + 1);
  }

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

      const updatedUserBase: UserRecord = {
        ...baseUser,
        name: input.name,
        designation: authUser.role === "FACULTY" ? input.designation ?? null : null,
        uid: authUser.role === "STUDENT" ? input.uid ?? null : baseUser.uid,
        rollNumber: authUser.role === "STUDENT" ? input.rollNumber ?? null : null,
        department: input.department,
        semester: authUser.role === "STUDENT" ? input.semester ?? null : null,
        linkedInUrl: input.linkedInUrl,
        githubUrl: input.githubUrl,
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
