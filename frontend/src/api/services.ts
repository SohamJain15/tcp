import { apiRequest, getApiBaseUrl } from "@/api/client";
import type {
  AudiencePreviewItem,
  ClassTestAudienceFilter,
  ClassTestRecordEnvelope,
  ClassTestSummary,
  CompleteProfilePayload,
  ContestAnswerPayload,
  FacultyClassTestAttempt,
  FacultyClassTestAttemptDetail,
  StudentClassTestDetail,
  StudentClassTestResult,
  StudentClassTestSummary,
  ContestAttemptEnvelope,
  ContestCodingSubmissionPayload,
  ContestCodingSubmissionReceipt,
  ContestEnvelope,
  ContestFeedbackEnvelope,
  ContestFeedbackPayload,
  ContestFeedbackStatus,
  ContestListItem,
  ContestAttemptsEnvelope,
  ContestReportEnvelope,
  ContestReportGenerateEnvelope,
  ContestReportMetricsEnvelope,
  FacultyContestAttemptReviewEnvelope,
  ContestProctoringPayload,
  ContestRegistrationEnvelope,
  ContestRegistrationsEnvelope,
  ContestResultsVisibilityPayload,
  ContestStandingsEnvelope,
  CreateContestPayload,
  Department,
  DepartmentContestParticipation,
  DepartmentFacultyEnvelope,
  DepartmentOverviewEnvelope,
  DepartmentStudentDetailEnvelope,
  DepartmentStudentItem,
  FacultyContestDetail,
  ManagedContestEnvelope,
  ManagedContestsEnvelope,
  LeaderboardItem,
  LeaderboardListResponse,
  ManageProblemDetail,
  ManageProblemSummary,
  PaginatedResponse,
  ProblemEnvelope,
  ProblemDraftImportEnvelope,
  ProblemLifecycleState,
  ProblemUpdatePayload,
  ProblemWritePayload,
  RunResultEnvelope,
  StudentContestDetail,
  StudentProblemDetail,
  StudentProblemSummary,
  Submission,
  SubmissionEnvelope,
  SubmissionQueueReceipt,
  SubmissionStatus,
  SubmissionSourceType,
  SubmissionWritePayload,
  SupportedLanguage,
  StudentContestQuestionEnvelope,
  UserEnvelope,
  UserProfileAnalyticsEnvelope,
  UpdateContestPayload,
} from "@/api/types";

export type PaginationQuery = {
  cursor?: string;
  pageSize?: number;
};

export type DepartmentAnalyticsQuery = {
  year?: 1 | 2 | 3 | 4;
  /** Size of the trailing activity window, in days. */
  windowDays?: number;
};

export type StudentProblemsQuery = PaginationQuery & {
  search?: string;
  difficulty?: string;
  tag?: string;
};

export type ManageProblemsQuery = StudentProblemsQuery & {
  lifecycleState?: ProblemLifecycleState;
  targetDepartment?: Department;
};

export type SubmissionsQuery = PaginationQuery & {
  problemId?: string;
  contestId?: string;
  sourceType?: SubmissionSourceType;
  userEmail?: string;
  studentDepartment?: Department;
  status?: SubmissionStatus;
  language?: SupportedLanguage;
  /** ISO timestamp; only submissions created at or after this instant are returned. */
  createdFrom?: string;
  /** ISO timestamp; only submissions created at or before this instant are returned. */
  createdTo?: string;
};

export const userApi = {
  me: (pathname?: string, options?: { suppressAuthRedirect?: boolean }) =>
    apiRequest<UserEnvelope>("/api/users/me", {
      pathname,
      suppressAuthRedirect: options?.suppressAuthRedirect,
    }),
  updateProfile: (payload: CompleteProfilePayload, pathname?: string) =>
    apiRequest<UserEnvelope>("/api/users/me", {
      method: "PATCH",
      body: payload,
      pathname,
    }),
  getByEmail: (email: string, pathname?: string) =>
    apiRequest<UserEnvelope>(`/api/users/${encodeURIComponent(email)}`, { pathname }),
  getAnalytics: (pathname?: string) =>
    apiRequest<UserProfileAnalyticsEnvelope>("/api/users/me/analytics", { pathname }),
  getAnalyticsByEmail: (email: string, pathname?: string) =>
    apiRequest<UserProfileAnalyticsEnvelope>(`/api/users/${encodeURIComponent(email)}/analytics`, { pathname }),
};

export const problemsApi = {
  listStudent: (query: StudentProblemsQuery = {}, pathname?: string) =>
    apiRequest<PaginatedResponse<StudentProblemSummary>>("/api/problems", { query, pathname }),
  getStudentDetail: (problemId: string, pathname?: string) =>
    apiRequest<ProblemEnvelope<StudentProblemDetail>>(`/api/problems/${problemId}`, { pathname }),
  listManage: (query: ManageProblemsQuery = {}, pathname?: string) =>
    apiRequest<PaginatedResponse<ManageProblemSummary>>("/api/problems/manage", { query, pathname }),
  getManageDetail: (problemId: string, pathname?: string) =>
    apiRequest<ProblemEnvelope<ManageProblemDetail>>(`/api/problems/manage/${problemId}`, { pathname }),
  importDraft: (payload: unknown, pathname?: string) =>
    apiRequest<ProblemDraftImportEnvelope>("/api/problems/import-draft", {
      method: "POST",
      body: payload,
      pathname,
    }),
  create: (payload: ProblemWritePayload, pathname?: string) =>
    apiRequest<ProblemEnvelope<ManageProblemDetail>>("/api/problems", {
      method: "POST",
      body: payload,
      pathname,
    }),
  update: (problemId: string, payload: ProblemUpdatePayload, pathname?: string) =>
    apiRequest<ProblemEnvelope<ManageProblemDetail>>(`/api/problems/${problemId}`, {
      method: "PATCH",
      body: payload,
      pathname,
    }),
  updateState: (problemId: string, lifecycleState: ProblemLifecycleState, pathname?: string) =>
    apiRequest<ProblemEnvelope<ManageProblemDetail>>(`/api/problems/${problemId}/state`, {
      method: "PATCH",
      body: { lifecycleState },
      pathname,
    }),
};

export const submissionsApi = {
  run: (payload: SubmissionWritePayload, pathname?: string) =>
    apiRequest<RunResultEnvelope>("/api/submissions/run", {
      method: "POST",
      body: payload,
      pathname,
    }),
  create: (payload: SubmissionWritePayload, pathname?: string) =>
    apiRequest<SubmissionQueueReceipt>("/api/submissions", {
      method: "POST",
      body: payload,
      pathname,
    }),
  list: (query: SubmissionsQuery = {}, pathname?: string) =>
    apiRequest<PaginatedResponse<Submission>>("/api/submissions", {
      query,
      pathname,
    }),
  getById: (submissionId: string, pathname?: string) =>
    apiRequest<SubmissionEnvelope>(`/api/submissions/${submissionId}`, {
      pathname,
    }),
};

export const leaderboardApi = {
  list: (query: PaginationQuery & { department?: Department; year?: 1 | 2 | 3 | 4 } = {}, pathname?: string) =>
    apiRequest<LeaderboardListResponse>("/api/leaderboard", {
      query,
      pathname,
    }),
  exportCsv: (pathname?: string, query?: { department?: Department; year?: 1 | 2 | 3 | 4 }) =>
    apiRequest<string>("/api/leaderboard/export", {
      query,
      pathname,
      responseType: "text",
    }),
};

/**
 * Department participation views, available only to faculty flagged as HOD.
 *
 * No method takes a `department` argument: the backend resolves it from the caller's
 * saved profile, so the scope cannot be widened from the client.
 */
export const departmentApi = {
  overview: (query: DepartmentAnalyticsQuery = {}, pathname?: string) =>
    apiRequest<DepartmentOverviewEnvelope>("/api/department/overview", { query, pathname }),
  listStudents: (query: PaginationQuery & DepartmentAnalyticsQuery = {}, pathname?: string) =>
    apiRequest<PaginatedResponse<DepartmentStudentItem>>("/api/department/students", { query, pathname }),
  getStudent: (email: string, query: DepartmentAnalyticsQuery = {}, pathname?: string) =>
    apiRequest<DepartmentStudentDetailEnvelope>(`/api/department/students/${encodeURIComponent(email)}`, {
      query,
      pathname,
    }),
  listContests: (query: PaginationQuery & DepartmentAnalyticsQuery = {}, pathname?: string) =>
    apiRequest<PaginatedResponse<DepartmentContestParticipation>>("/api/department/contests", {
      query,
      pathname,
    }),
  listFaculty: (pathname?: string) =>
    apiRequest<DepartmentFacultyEnvelope>("/api/department/faculty", { pathname }),
  listManagedContests: (pathname?: string) =>
    apiRequest<ManagedContestsEnvelope>("/api/department/managed-contests", { pathname }),
  setContestManagers: (contestId: string, managerEmails: string[], pathname?: string) =>
    apiRequest<ManagedContestEnvelope>(
      `/api/department/managed-contests/${encodeURIComponent(contestId)}/managers`,
      { method: "PATCH", body: { managerEmails }, pathname },
    ),
};

/**
 * Read-only, cross-department analytics for institute leadership.
 *
 * Same shapes as `departmentApi`, but the department is named explicitly instead of being taken from
 * the caller's own profile. Department names contain spaces, `&`, parentheses and an en-dash, so the
 * path segment must be encoded — the server decodes and validates against the canonical list.
 */
export const adminApi = {
  listDepartments: (pathname?: string) =>
    apiRequest<{ departments: Department[] }>("/api/admin/departments", { pathname }),
  /** Every contest on the platform, metadata only — no questions, answers or test cases. */
  listContests: (query: PaginationQuery & { department?: Department } = {}, pathname?: string) =>
    apiRequest<PaginatedResponse<ContestListItem>>("/api/admin/contests", { query, pathname }),
  getContestStandings: (
    contestId: string,
    query: { department?: Department; year?: 1 | 2 | 3 | 4 } = {},
    pathname?: string,
  ) =>
    apiRequest<ContestStandingsEnvelope>(
      `/api/admin/contests/${encodeURIComponent(contestId)}/standings`,
      { query, pathname },
    ),
  overview: (department: Department, query: DepartmentAnalyticsQuery = {}, pathname?: string) =>
    apiRequest<DepartmentOverviewEnvelope>(
      `/api/admin/departments/${encodeURIComponent(department)}/overview`,
      { query, pathname },
    ),
  listStudents: (
    department: Department,
    query: PaginationQuery & DepartmentAnalyticsQuery = {},
    pathname?: string,
  ) =>
    apiRequest<PaginatedResponse<DepartmentStudentItem>>(
      `/api/admin/departments/${encodeURIComponent(department)}/students`,
      { query, pathname },
    ),
  getStudent: (
    department: Department,
    email: string,
    query: DepartmentAnalyticsQuery = {},
    pathname?: string,
  ) =>
    apiRequest<DepartmentStudentDetailEnvelope>(
      `/api/admin/departments/${encodeURIComponent(department)}/students/${encodeURIComponent(email)}`,
      { query, pathname },
    ),
};

export const contestsApi = {
  list: (query: PaginationQuery & { department?: Department } = {}, pathname?: string) =>
    apiRequest<PaginatedResponse<ContestListItem>>("/api/contests", {
      query,
      pathname,
    }),
  getStudentDetail: (contestId: string, pathname?: string) =>
    apiRequest<ContestEnvelope<StudentContestDetail>>(`/api/contests/${contestId}`, { pathname }),
  getFacultyDetail: (contestId: string, pathname?: string) =>
    apiRequest<ContestEnvelope<FacultyContestDetail>>(`/api/contests/${contestId}`, { pathname }),
  create: (payload: CreateContestPayload, pathname?: string) =>
    apiRequest<ContestEnvelope<FacultyContestDetail>>("/api/contests", {
      method: "POST",
      body: payload,
      pathname,
    }),
  update: (contestId: string, payload: UpdateContestPayload, pathname?: string) =>
    apiRequest<ContestEnvelope<FacultyContestDetail>>(`/api/contests/${contestId}`, {
      method: "PATCH",
      body: payload,
      pathname,
    }),
  updateResultsVisibility: (contestId: string, payload: ContestResultsVisibilityPayload, pathname?: string) =>
    apiRequest<ContestEnvelope<FacultyContestDetail>>(`/api/contests/${contestId}/results`, {
      method: "PATCH",
      body: payload,
      pathname,
    }),
  getFeedbackStatus: (contestId: string, pathname?: string) =>
    apiRequest<ContestFeedbackStatus>(`/api/contests/${contestId}/feedback`, { pathname }),
  submitFeedback: (contestId: string, payload: ContestFeedbackPayload, pathname?: string) =>
    apiRequest<ContestFeedbackEnvelope>(`/api/contests/${contestId}/feedback`, {
      method: "POST",
      body: payload,
      pathname,
    }),
  register: (contestId: string, pathname?: string) =>
    apiRequest<ContestRegistrationEnvelope>(`/api/contests/${contestId}/registration`, {
      method: "POST",
      pathname,
    }),
  unregister: (contestId: string, pathname?: string) =>
    apiRequest<void>(`/api/contests/${contestId}/registration`, {
      method: "DELETE",
      pathname,
    }),
  listRegistrations: (contestId: string, pathname?: string) =>
    apiRequest<ContestRegistrationsEnvelope>(`/api/contests/${contestId}/registrations`, { pathname }),
  exportRegistrationsCsv: (contestId: string, pathname?: string) =>
    apiRequest<string>(`/api/contests/${contestId}/registrations/export`, {
      pathname,
      responseType: "text",
    }),
  startAttempt: (contestId: string, pathname?: string) =>
    apiRequest<ContestAttemptEnvelope>(`/api/contests/${contestId}/attempts`, {
      method: "POST",
      pathname,
    }),
  submitAttempt: (contestId: string, pathname?: string) =>
    apiRequest<ContestAttemptEnvelope>(`/api/contests/${contestId}/attempts/submit`, {
      method: "POST",
      pathname,
    }),
  answerQuestion: (contestId: string, payload: ContestAnswerPayload, pathname?: string) =>
    apiRequest<ContestAttemptEnvelope>(`/api/contests/${contestId}/answers`, {
      method: "POST",
      body: payload,
      pathname,
    }),
  getQuestionDetail: (contestId: string, questionId: string, pathname?: string) =>
    apiRequest<StudentContestQuestionEnvelope>(`/api/contests/${contestId}/questions/${questionId}`, { pathname }),
  runCodingQuestion: (contestId: string, payload: ContestCodingSubmissionPayload, pathname?: string) =>
    apiRequest<RunResultEnvelope>(`/api/contests/${contestId}/coding-run`, {
      method: "POST",
      body: payload,
      pathname,
    }),
  /** Auto-saves editor content so it is submitted for the student if the attempt ends without them. */
  saveCodingDraft: (contestId: string, payload: ContestCodingSubmissionPayload, pathname?: string) =>
    apiRequest<ContestAttemptEnvelope>(`/api/contests/${contestId}/coding-draft`, {
      method: "POST",
      body: payload,
      pathname,
    }),
  submitCodingQuestion: (contestId: string, payload: ContestCodingSubmissionPayload, pathname?: string) =>
    apiRequest<ContestCodingSubmissionReceipt>(`/api/contests/${contestId}/coding-submissions`, {
      method: "POST",
      body: payload,
      pathname,
    }),
  recordProctorEvent: (contestId: string, payload: ContestProctoringPayload, pathname?: string) =>
    apiRequest<ContestAttemptEnvelope>(`/api/contests/${contestId}/proctor-events`, {
      method: "POST",
      body: payload,
      pathname,
    }),
  listAttempts: (contestId: string, pathname?: string) =>
    apiRequest<ContestAttemptsEnvelope>(`/api/contests/${contestId}/attempts`, { pathname }),
  getStandings: (contestId: string, pathname?: string, query?: { department?: Department; year?: 1 | 2 | 3 | 4 }) =>
    apiRequest<ContestStandingsEnvelope>(`/api/contests/${contestId}/standings`, { pathname, query }),
  exportStandingsCsv: (contestId: string, pathname?: string, query?: { department?: Department; year?: 1 | 2 | 3 | 4 }) =>
    apiRequest<string>(`/api/contests/${contestId}/standings/export`, {
      query,
      pathname,
      responseType: "text",
    }),
  getAttemptReview: (contestId: string, attemptId: string, pathname?: string) =>
    apiRequest<FacultyContestAttemptReviewEnvelope>(`/api/contests/${contestId}/attempts/${attemptId}`, {
      pathname,
    }),
  getReport: (contestId: string, pathname?: string) =>
    apiRequest<ContestReportEnvelope>(`/api/contests/${contestId}/report`, { pathname }),
  getReportPdfUrl: (
    contestId: string,
    options: {
      subtitle?: string;
      sections: {
        narrative: boolean;
        questionBreakdown: boolean;
        languageEfficiency: boolean;
        optimalCode: boolean;
        proctoring: boolean;
      };
    },
  ) => {
    const url = new URL(`${getApiBaseUrl()}/api/contests/${contestId}/report/pdf`);
    if (options.subtitle) url.searchParams.set("subtitle", options.subtitle);
    Object.entries(options.sections).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    return url.toString();
  },
  /** Fresh metrics without triggering a model run — backs the "Raw Metrics" view. */
  getReportMetrics: (contestId: string, pathname?: string) =>
    apiRequest<ContestReportMetricsEnvelope>(`/api/contests/${contestId}/report/metrics`, { pathname }),
  /** Returns immediately; the report finishes in the background, so poll getReport afterwards. */
  generateReport: (contestId: string, payload: { force?: boolean } = {}, pathname?: string) =>
    apiRequest<ContestReportGenerateEnvelope>(`/api/contests/${contestId}/report`, {
      method: "POST",
      body: payload,
      pathname,
    }),
};

/**
 * Class Tests.
 *
 * Note there is deliberately no standings or leaderboard call here — a class test assesses
 * individuals and ranks nobody.
 */
export const classTestApi = {
  // faculty
  list: (pathname?: string) =>
    apiRequest<{ items: ClassTestSummary[] }>("/api/class-tests", { pathname }),
  get: (classTestId: string, pathname?: string) =>
    apiRequest<ClassTestRecordEnvelope>(`/api/class-tests/${encodeURIComponent(classTestId)}`, { pathname }),
  previewAudience: (filter: ClassTestAudienceFilter, pathname?: string) =>
    apiRequest<{ students: AudiencePreviewItem[] }>("/api/class-tests/audience-preview", {
      method: "POST",
      body: filter,
      pathname,
    }),
  create: (payload: Record<string, unknown>, pathname?: string) =>
    apiRequest<ClassTestRecordEnvelope>("/api/class-tests", { method: "POST", body: payload, pathname }),
  update: (classTestId: string, payload: Record<string, unknown>, pathname?: string) =>
    apiRequest<ClassTestRecordEnvelope>(`/api/class-tests/${encodeURIComponent(classTestId)}`, {
      method: "PATCH",
      body: payload,
      pathname,
    }),
  listAttempts: (classTestId: string, pathname?: string) =>
    apiRequest<{ items: FacultyClassTestAttempt[] }>(
      `/api/class-tests/${encodeURIComponent(classTestId)}/attempts`,
      { pathname },
    ),
  getAttempt: (classTestId: string, attemptId: string, pathname?: string) =>
    apiRequest<{ attempt: FacultyClassTestAttemptDetail }>(
      `/api/class-tests/${encodeURIComponent(classTestId)}/attempts/${encodeURIComponent(attemptId)}`,
      { pathname },
    ),
  gradeShortAnswer: (
    classTestId: string,
    attemptId: string,
    body: { questionId: string; awardedPoints: number; graderNote?: string | null },
    pathname?: string,
  ) =>
    apiRequest<{ attempt: FacultyClassTestAttemptDetail }>(
      `/api/class-tests/${encodeURIComponent(classTestId)}/attempts/${encodeURIComponent(attemptId)}/grade`,
      { method: "PATCH", body, pathname },
    ),
  publishResults: (classTestId: string, resultsPublished: boolean, pathname?: string) =>
    apiRequest<ClassTestRecordEnvelope>(`/api/class-tests/${encodeURIComponent(classTestId)}/results`, {
      method: "PATCH",
      body: { resultsPublished },
      pathname,
    }),

  // student
  listAssigned: (pathname?: string) =>
    apiRequest<{ items: StudentClassTestSummary[] }>("/api/class-tests/assigned", { pathname }),
  getMine: (classTestId: string, pathname?: string) =>
    apiRequest<{ classTest: StudentClassTestDetail }>(
      `/api/class-tests/mine/${encodeURIComponent(classTestId)}`,
      { pathname },
    ),
  startAttempt: (classTestId: string, pathname?: string) =>
    apiRequest<{ classTest: StudentClassTestDetail }>(
      `/api/class-tests/mine/${encodeURIComponent(classTestId)}/attempts`,
      { method: "POST", pathname },
    ),
  saveAnswer: (classTestId: string, questionId: string, answer: string | string[], pathname?: string) =>
    apiRequest<{ saved: boolean }>(`/api/class-tests/mine/${encodeURIComponent(classTestId)}/answers`, {
      method: "POST",
      body: { questionId, answer },
      pathname,
    }),
  submitAttempt: (classTestId: string, pathname?: string) =>
    apiRequest<{ submitted: boolean }>(
      `/api/class-tests/mine/${encodeURIComponent(classTestId)}/attempts/submit`,
      { method: "POST", pathname },
    ),
  recordProctorEvent: (classTestId: string, type: string, pathname?: string) =>
    apiRequest<{ autoSubmitted: boolean; violationCount: number }>(
      `/api/class-tests/mine/${encodeURIComponent(classTestId)}/proctor-events`,
      { method: "POST", body: { type }, pathname },
    ),
  getResult: (classTestId: string, pathname?: string) =>
    apiRequest<{ result: StudentClassTestResult }>(
      `/api/class-tests/mine/${encodeURIComponent(classTestId)}/result`,
      { pathname },
    ),
};
