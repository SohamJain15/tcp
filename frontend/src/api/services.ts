import { apiRequest } from "@/api/client";
import type {
  CompleteProfilePayload,
  ContestAnswerPayload,
  ContestAttemptEnvelope,
  ContestCodingSubmissionPayload,
  ContestCodingSubmissionReceipt,
  ContestEnvelope,
  ContestListItem,
  ContestAttemptsEnvelope,
  FacultyContestAttemptReviewEnvelope,
  ContestProctoringPayload,
  ContestResultsVisibilityPayload,
  ContestStandingsEnvelope,
  CreateContestPayload,
  Department,
  FacultyContestDetail,
  LeaderboardItem,
  ManageProblemDetail,
  ManageProblemSummary,
  PaginatedResponse,
  ProblemEnvelope,
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
  list: (query: PaginationQuery & { department?: Department } = {}, pathname?: string) =>
    apiRequest<PaginatedResponse<LeaderboardItem>>("/api/leaderboard", {
      query,
      pathname,
    }),
  exportCsv: (pathname?: string, query?: { department?: Department }) =>
    apiRequest<string>("/api/leaderboard/export", {
      query,
      pathname,
      responseType: "text",
    }),
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
  getStandings: (contestId: string, pathname?: string) =>
    apiRequest<ContestStandingsEnvelope>(`/api/contests/${contestId}/standings`, { pathname }),
  exportStandingsCsv: (contestId: string, pathname?: string) =>
    apiRequest<string>(`/api/contests/${contestId}/standings/export`, {
      pathname,
      responseType: "text",
    }),
  getAttemptReview: (contestId: string, attemptId: string, pathname?: string) =>
    apiRequest<FacultyContestAttemptReviewEnvelope>(`/api/contests/${contestId}/attempts/${attemptId}`, {
      pathname,
    }),
};
