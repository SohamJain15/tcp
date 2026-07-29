import type { Department, Difficulty, ExecutableLanguage } from "../../shared/types/domain";
import type { ActivityLevel } from "../../shared/utils/activity";
import type { StudentYear } from "../../shared/utils/student-year";

/**
 * Response types for the department participation views.
 *
 * These are deliberately narrow. There is no member here for a problem statement, a
 * contest question, an answer key, a test case or submitted code, so the HOD surface
 * cannot grow one by accident — adding it would be an obvious, reviewable change to
 * this file rather than an invisible consequence of spreading a record somewhere.
 */

export interface DepartmentWindow {
  from: string;
  to: string;
  days: number;
}

export interface DepartmentTotals {
  studentCount: number;
  activeStudentCount: number;
  participationRate: number;
  submissionCount: number;
  acceptedSubmissionCount: number;
  accuracy: number;
  problemsSolved: number;
  contestRegistrationCount: number;
  contestAttemptCount: number;
}

export interface DepartmentYearParticipation {
  year: StudentYear | null;
  label: string;
  studentCount: number;
  activeStudentCount: number;
  participationRate: number;
  submissionCount: number;
  contestRegisteredCount: number;
  contestAttemptedCount: number;
}

export interface DepartmentActivityPoint {
  date: string;
  submissionCount: number;
  acceptedCount: number;
  activeStudentCount: number;
}

export interface DepartmentActivityLevelBucket {
  level: ActivityLevel;
  studentCount: number;
  minActiveDays: number;
  maxActiveDays: number;
}

export interface DepartmentConsistency {
  windowDays: number;
  averageConsistencyScore: number;
  averageActiveDayRatio: number;
  averageWeeklyRegularity: number;
  averageActiveDays: number;
  averageCurrentStreakDays: number;
  averageLongestStreakDays: number;
  /** Count of students per 0-20/21-40/… consistency-score band. */
  distribution: { band: string; studentCount: number }[];
}

/** Contest participation only. No questions, no answer keys, no per-question data. */
export interface DepartmentContestParticipation {
  contestId: string;
  title: string;
  type: string;
  computedStatus: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  targetDepartment: Department | null;
  resultsPublished: boolean;
  eligibleStudentCount: number;
  registeredCount: number;
  attemptedCount: number;
  completedCount: number;
  registrationRate: number;
  attemptRate: number;
  completionRate: number;
  averageScore: number;
  highestScore: number;
  averageTimeTakenMs: number;
  totalViolationCount: number;
}

export interface DepartmentOverviewResponse {
  department: Department;
  window: DepartmentWindow;
  totals: DepartmentTotals;
  participationByYear: DepartmentYearParticipation[];
  activityTrend: DepartmentActivityPoint[];
  activityLevelDistribution: DepartmentActivityLevelBucket[];
  consistency: DepartmentConsistency;
  submissionHeatmap: { date: string; submissionCount: number }[];
  difficultyBreakdown: { difficulty: Difficulty; solvedCount: number }[];
  languageBreakdown: { language: ExecutableLanguage; submissionCount: number }[];
  contestParticipation: DepartmentContestParticipation[];
}

export interface DepartmentStudentItem {
  rank: number;
  email: string;
  name: string | null;
  uid: string | null;
  semester: number | null;
  year: StudentYear | null;
  rating: number;
  problemsSolved: number;
  submissionCount: number;
  acceptedSubmissionCount: number;
  accuracy: number;
  activeDays: number;
  consistencyScore: number;
  currentStreakDays: number;
  longestStreakDays: number;
  activityLevel: ActivityLevel;
  lastActiveAt: string | null;
  contestsRegistered: number;
  contestsAttempted: number;
}

/** Per-student drill-down. Activity metadata only — never code, never answers. */
/** A faculty member in the department, for the contest-delegation picker. */
export interface DepartmentFacultyItem {
  email: string;
  name: string | null;
  designation: string | null;
  isHod: boolean;
}

/** A contest the HOD created, with the faculty they have delegated management to. */
export interface ManagedContestItem {
  contestId: string;
  title: string;
  computedStatus: string;
  startAt: string;
  endAt: string;
  resultsPublished: boolean;
  managers: { email: string; name: string | null }[];
}

export interface DepartmentStudentDetailResponse {
  student: {
    email: string;
    name: string | null;
    uid: string | null;
    department: Department | null;
    semester: number | null;
    year: StudentYear | null;
    rating: number;
    problemsSolved: number;
    submissionCount: number;
    acceptedSubmissionCount: number;
    accuracy: number;
    lastAcceptedAt: string | null;
  };
  window: DepartmentWindow;
  activity: {
    activeDays: number;
    consistencyScore: number;
    activeDayRatio: number;
    weeklyRegularity: number;
    currentStreakDays: number;
    longestStreakDays: number;
    estimatedActiveMinutes: number;
    firstSubmissionAt: string | null;
    lastSubmissionAt: string | null;
  };
  difficultyBreakdown: { difficulty: Difficulty; solvedCount: number }[];
  languageBreakdown: { language: ExecutableLanguage; submissionCount: number }[];
  submissionHeatmap: { date: string; submissionCount: number }[];
  contests: {
    contestId: string;
    title: string;
    registeredAt: string | null;
    attemptStatus: string;
    score: number | null;
    solvedCount: number | null;
    timeTakenMs: number | null;
    violationCount: number | null;
  }[];
}
