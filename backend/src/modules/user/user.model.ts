import type { UserRole } from "../../shared/types/auth";
import type { Department, Difficulty, ExecutableLanguage } from "../../shared/types/domain";
import { toIsoString } from "../../shared/utils/date";

export interface UserRecord {
  email: string;
  role: UserRole;
  name: string | null;
  uid: string | null;
  isProfileComplete: boolean;
  designation: string | null;
  rollNumber: string | null;
  department: Department | null;
  semester: number | null;
  linkedInUrl: string | null;
  githubUrl: string | null;
  skills: string[];
  rating: number;
  score: number;
  problemsSolved: number;
  submissionCount: number;
  acceptedSubmissionCount: number;
  accuracy: number;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  lastAcceptedAt: Date | null;
}

export interface UserProfileResponse {
  email: string;
  role: UserRole;
  name: string | null;
  uid: string | null;
  isProfileComplete: boolean;
  designation: string | null;
  rollNumber: string | null;
  department: Department | null;
  semester: number | null;
  linkedInUrl: string | null;
  githubUrl: string | null;
  skills: string[];
  rating: number;
  score: number;
  problemsSolved: number;
  submissionCount: number;
  acceptedSubmissionCount: number;
  accuracy: number;
  rank: number | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  lastAcceptedAt: string | null;
}

export interface UserProfileAnalyticsDifficultyItem {
  difficulty: Difficulty;
  solvedCount: number;
}

export interface UserProfileAnalyticsLanguageItem {
  language: ExecutableLanguage;
  submissionCount: number;
}

export interface UserProfileAnalyticsHeatmapItem {
  date: string;
  submissionCount: number;
}

export interface UserProfileAnalyticsSubmissionItem {
  submissionId: string;
  problemId: string;
  problemTitle: string;
  difficulty: Difficulty;
  status: string;
  language: ExecutableLanguage;
  createdAt: string;
  runtimeMs: number;
  memoryKb: number;
  sourceType: "problem" | "contest_coding";
  contestId: string | null;
  contestTitle: string | null;
}

export interface UserProfileAnalyticsResponse {
  difficultyBreakdown: UserProfileAnalyticsDifficultyItem[];
  languageBreakdown: UserProfileAnalyticsLanguageItem[];
  submissionHeatmap: UserProfileAnalyticsHeatmapItem[];
  recentAcceptedSubmissions: UserProfileAnalyticsSubmissionItem[];
  submissionHistory: UserProfileAnalyticsSubmissionItem[];
}

export function toUserProfileResponse(user: UserRecord, rank: number | null): UserProfileResponse {
  return {
    email: user.email,
    role: user.role,
    name: user.name,
    uid: user.uid,
    isProfileComplete: user.isProfileComplete,
    designation: user.designation,
    rollNumber: user.rollNumber,
    department: user.department,
    semester: user.semester,
    linkedInUrl: user.linkedInUrl,
    githubUrl: user.githubUrl,
    skills: user.skills,
    rating: user.rating,
    score: user.rating,
    problemsSolved: user.problemsSolved,
    submissionCount: user.submissionCount,
    acceptedSubmissionCount: user.acceptedSubmissionCount,
    accuracy: user.accuracy,
    rank,
    createdAt: toIsoString(user.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIsoString(user.updatedAt) ?? new Date(0).toISOString(),
    lastLoginAt: toIsoString(user.lastLoginAt),
    lastAcceptedAt: toIsoString(user.lastAcceptedAt),
  };
}

export function toUserProfileAnalyticsSubmissionItem(
  submission: {
    id: string;
    problemId: string;
    problemTitleSnapshot: string;
    problemDifficultySnapshot: Difficulty;
    status: string;
    language: ExecutableLanguage;
    createdAt: Date;
    runtimeMs: number;
    memoryKb: number;
    sourceType: "problem" | "contest_coding";
    contestId: string | null;
    contestTitleSnapshot: string | null;
  },
): UserProfileAnalyticsSubmissionItem {
  return {
    submissionId: submission.id,
    problemId: submission.problemId,
    problemTitle: submission.problemTitleSnapshot,
    difficulty: submission.problemDifficultySnapshot,
    status: submission.status,
    language: submission.language,
    createdAt: toIsoString(submission.createdAt) ?? new Date(0).toISOString(),
    runtimeMs: submission.runtimeMs,
    memoryKb: submission.memoryKb,
    sourceType: submission.sourceType,
    contestId: submission.contestId,
    contestTitle: submission.contestTitleSnapshot,
  };
}
