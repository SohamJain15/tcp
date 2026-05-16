export type UserRole = "STUDENT" | "FACULTY";
export type Difficulty = "Easy" | "Medium" | "Hard";
export type ProblemLifecycleState = "Draft" | "Published" | "Archived";
export type StudentProblemStatus = "solved" | "attempted" | "todo";
export type Department =
  | "B.E. Computer Engineering"
  | "B.E. Information Technology"
  | "B.E. Electronics & Tele-Communication"
  | "B.E. Electronics and Computer Science"
  | "B.E. Mechanical Engineering"
  | "B.E. Civil Engineering"
  | "B.E. Computer Science and Engineering (Cyber Security)"
  | "B.E. Mechanical and Mechatronics Engineering (Additive Manufacturing)"
  | "B.Tech – Artificial Intelligence & Machine Learning"
  | "B.Tech – Artificial Intelligence & Data Science"
  | "B.Tech – Internet of Things (IoT)"
  | "B.Tech – Computer Science & Engineering (CSE-IOT)";

export type SupportedLanguage =
  | "c"
  | "cpp"
  | "java"
  | "javascript"
  | "python"
  | "ruby"
  | "arduino"
  | "go"
  | "rust"
  | "csharp"
  | "php"
  | "vanilla"
  | "react"
  | "typescript"
  | "html"
  | "css"
  | "assembly8086"
  | "kotlin"
  | "swift"
  | "dart"
  | "scala"
  | "elixir"
  | "erlang"
  | "racket";

export type EditorOnlyLanguage = "react" | "html" | "css";
export type ExecutableLanguage = Exclude<SupportedLanguage, EditorOnlyLanguage>;

export type SubmissionStatus =
  | "QUEUED"
  | "RUNNING"
  | "ACCEPTED"
  | "WRONG_ANSWER"
  | "TIME_LIMIT_EXCEEDED"
  | "RUNTIME_ERROR"
  | "COMPILATION_ERROR"
  | "INTERNAL_ERROR";

export interface PageInfo {
  nextCursor: string | null;
  pageSize: number;
  totalCount: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  pageInfo: PageInfo;
}

export interface UserProfile {
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

export interface UserEnvelope {
  user: UserProfile;
}

export type CompleteProfilePayload =
  | {
      name: string;
      uid: string;
      rollNumber: string;
      department: Department;
      semester: number;
      linkedInUrl: string | null;
      githubUrl: string | null;
    }
  | {
      name: string;
      designation: string;
      department: Department;
      linkedInUrl: string | null;
      githubUrl: string | null;
    };

export const DEPARTMENTS: Department[] = [
  "B.E. Computer Engineering",
  "B.E. Information Technology",
  "B.E. Electronics & Tele-Communication",
  "B.E. Electronics and Computer Science",
  "B.E. Mechanical Engineering",
  "B.E. Civil Engineering",
  "B.E. Computer Science and Engineering (Cyber Security)",
  "B.E. Mechanical and Mechatronics Engineering (Additive Manufacturing)",
  "B.Tech – Artificial Intelligence & Machine Learning",
  "B.Tech – Artificial Intelligence & Data Science",
  "B.Tech – Internet of Things (IoT)",
  "B.Tech – Computer Science & Engineering (CSE-IOT)",
];

export interface ProblemTestCase {
  input: string;
  output: string;
  explanation?: string;
}

export interface StudentProblemSummary {
  id: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  targetDepartment?: Department | null;
  userStatus: StudentProblemStatus;
  submissions: number;
  totalSubmissions: number;
  acceptance: number;
  acceptanceRate: number;
  timeLimit: string;
  timeLimitSeconds: number;
  memoryLimit: string;
  memoryLimitMb: number;
}

export interface StudentProblemDetail extends StudentProblemSummary {
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
  examples: Array<ProblemTestCase & { hidden: false }>;
  sampleTestCases: ProblemTestCase[];
}

export interface ManageProblemSummary {
  id: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  targetDepartment?: Department | null;
  lifecycleState: ProblemLifecycleState;
  totalSubmissions: number;
  acceptanceRate: number;
  updatedAt: string;
}

export interface ManageProblemDetail extends ManageProblemSummary {
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
  timeLimitSeconds: number;
  memoryLimitMb: number;
  createdBy: string;
  createdByRole: UserRole;
  sampleTestCases: ProblemTestCase[];
  hiddenTestCases: ProblemTestCase[];
  createdAt: string;
}

export interface ProblemEnvelope<T> {
  problem: T;
}

export interface SubmissionResult {
  problemId: string;
  language: ExecutableLanguage;
  status: SubmissionStatus;
  runtimeMs: number;
  memoryKb: number;
  passedCount: number;
  totalCount: number;
  executionProvider: string;
  stdout?: string;
  stderr?: string;
}

export interface RunResultEnvelope {
  result: SubmissionResult;
}

export type SubmissionSourceType = "problem" | "contest_coding";

export interface Submission {
  id: string;
  userEmail: string;
  userName: string | null;
  userUid: string | null;
  userDepartment: Department | null;
  sourceType: SubmissionSourceType;
  problemId: string;
  problemTitle: string;
  difficulty: Difficulty;
  contestId: string | null;
  contestTitle: string | null;
  contestQuestionId: string | null;
  language: ExecutableLanguage;
  status: SubmissionStatus;
  runtimeMs: number;
  memoryKb: number;
  passedCount: number;
  totalCount: number;
  executionProvider: string;
  ratingAwarded: number;
  stdout?: string | null;
  stderr?: string | null;
  createdAt: string;
  updatedAt: string;
  judgedAt: string | null;
  code?: string;
}

export interface SubmissionEnvelope {
  submission: Submission;
}

export interface SubmissionQueueReceipt {
  submission_id: string;
  status: "queued";
}

export interface LeaderboardItem {
  rank: number;
  email: string;
  role: UserRole;
  name: string | null;
  uid: string | null;
  department: Department | null;
  rating: number;
  score: number;
  problemsSolved: number;
  submissionCount: number;
  acceptedSubmissionCount: number;
  accuracy: number;
  updatedAt: string;
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
  status: SubmissionStatus;
  language: ExecutableLanguage;
  createdAt: string;
  runtimeMs: number;
  memoryKb: number;
  sourceType: SubmissionSourceType;
  contestId: string | null;
  contestTitle: string | null;
}

export interface UserProfileAnalytics {
  difficultyBreakdown: UserProfileAnalyticsDifficultyItem[];
  languageBreakdown: UserProfileAnalyticsLanguageItem[];
  submissionHeatmap: UserProfileAnalyticsHeatmapItem[];
  recentAcceptedSubmissions: UserProfileAnalyticsSubmissionItem[];
  submissionHistory: UserProfileAnalyticsSubmissionItem[];
}

export interface UserProfileAnalyticsEnvelope {
  analytics: UserProfileAnalytics;
}

export type ContestType = "Rated" | "Practice";
export type ContestLifecycleState = "Published";
export type ContestStatus = "Upcoming" | "Live" | "Ended";
export type ContestStudentListStatus = "Upcoming" | "Live" | "Past";
export type ContestQuestionType = "MCQ" | "MSQ" | "Coding";
export type ContestAttemptStatus = "NOT_STARTED" | "ACTIVE" | "SUBMITTED" | "AUTO_SUBMITTED" | "DISQUALIFIED";
export type ContestStudentAttemptStatus = ContestAttemptStatus | "NOT_ATTEMPTED";

export interface ContestListItem {
  id: string;
  title: string;
  type: ContestType;
  lifecycleState: ContestLifecycleState;
  resultsPublished: boolean;
  computedStatus: ContestStatus;
  studentListStatus: ContestStudentListStatus;
  attemptStatus: ContestStudentAttemptStatus;
  hasAttempted: boolean;
  targetDepartment: Department | null;
  startAt: string;
  durationMinutes: number;
  participantsCount: number;
  createdBy: string;
}

export interface ContestQuestionBase {
  id: string;
  type: ContestQuestionType;
  points: number;
}

export interface ContestMcqQuestion extends ContestQuestionBase {
  type: "MCQ";
  statement: string;
  options: string[];
  correctAnswer: string;
}

export interface ContestMsqQuestion extends ContestQuestionBase {
  type: "MSQ";
  statement: string;
  options: string[];
  correctAnswers: string[];
}

export interface ContestCodingQuestion extends ContestQuestionBase {
  type: "Coding";
  problemTitle: string;
  difficulty: Difficulty;
  problemStatement: string;
  constraints: string;
  inputFormat: string;
  outputFormat: string;
  timeLimitSeconds: number;
  memoryLimitMb: number;
  sampleTestCases: ProblemTestCase[];
  hiddenTestCases: ProblemTestCase[];
  supportedLanguages: ExecutableLanguage[];
}

export type ContestQuestion = ContestMcqQuestion | ContestMsqQuestion | ContestCodingQuestion;

export interface ContestQuestionAttemptState {
  questionId: string;
  questionType: ContestQuestionType;
  status: "UNATTEMPTED" | "ATTEMPTED" | "SOLVED";
  attemptsCount: number;
  awardedPoints: number;
  submittedAnswer: string | string[] | null;
  isCorrect: boolean | null;
  lastSubmissionId: string | null;
  passedCount: number;
  totalCount: number;
  hasFinalCodingSubmission: boolean;
  finalSubmissionLanguage: ExecutableLanguage | null;
  finalSubmissionStatus: string | null;
  finalRuntimeMs: number;
  finalMemoryKb: number;
  solvedAt: string | null;
}

export interface ContestAttempt {
  id: string;
  contestId: string;
  contestTitleSnapshot: string;
  userEmail: string;
  userName: string | null;
  userUid: string | null;
  userDepartment: Department | null;
  status: ContestAttemptStatus;
  score: number;
  violationCount: number;
  violationPenaltyPoints: number;
  timeTakenMs: number | null;
  questionStates: ContestQuestionAttemptState[];
  startedAt: string;
  updatedAt: string;
  submittedAt: string | null;
  autoSubmittedAt: string | null;
  lastSolvedAt: string | null;
}

export interface StudentContestQuestionSummary {
  id: string;
  questionNumber: number;
  type: ContestQuestionType;
  title: string;
  points: number;
  difficulty?: Difficulty;
  statement?: string;
  options?: string[];
  problemStatement?: string;
  constraints?: string;
  inputFormat?: string;
  outputFormat?: string;
  sampleTestCases?: ProblemTestCase[];
  supportedLanguages?: ExecutableLanguage[];
}

export interface ContestQuestionReportItemBase {
  questionId: string;
  questionNumber: number;
  type: ContestQuestionType;
  title: string;
  points: number;
  awardedPoints: number;
  status: "UNATTEMPTED" | "ATTEMPTED" | "SOLVED";
  attemptsCount: number;
}

export interface ObjectiveContestQuestionReportItem extends ContestQuestionReportItemBase {
  type: "MCQ" | "MSQ";
  statement: string;
  options: string[];
  submittedAnswer: string | string[] | null;
  correctAnswer: string | string[];
  isCorrect: boolean;
}

export interface CodingContestQuestionReportItem extends ContestQuestionReportItemBase {
  type: "Coding";
  difficulty: Difficulty;
  problemStatement: string;
  constraints: string;
  inputFormat: string;
  outputFormat: string;
  sampleTestCases: ProblemTestCase[];
  passedCount: number;
  totalCount: number;
  finalSubmissionId: string | null;
  finalSubmissionLanguage: ExecutableLanguage | null;
  finalSubmissionStatus: string | null;
  finalRuntimeMs: number;
  finalMemoryKb: number;
}

export type ContestQuestionReportItem =
  | ObjectiveContestQuestionReportItem
  | CodingContestQuestionReportItem;

export interface StudentContestReport {
  status: ContestStudentAttemptStatus;
  hasAttempted: boolean;
  rank: number | null;
  score: number;
  solvedCount: number;
  violationCount: number;
  violationPenaltyPoints: number;
  timeTakenMs: number | null;
  submittedAt: string | null;
  autoSubmittedAt: string | null;
  questionReports: ContestQuestionReportItem[];
}

export interface StudentContestDetail {
  id: string;
  title: string;
  type: ContestType;
  lifecycleState: ContestLifecycleState;
  resultsPublished: boolean;
  computedStatus: ContestStatus;
  targetDepartment: Department | null;
  startAt: string;
  durationMinutes: number;
  maxViolations: number;
  studentListStatus: ContestStudentListStatus;
  attemptStatus: ContestStudentAttemptStatus;
  hasAttempted: boolean;
  questions: StudentContestQuestionSummary[];
  attempt: ContestAttempt | null;
  report: StudentContestReport | null;
}

export interface FacultyContestDetail {
  id: string;
  title: string;
  type: ContestType;
  lifecycleState: ContestLifecycleState;
  resultsPublished: boolean;
  targetDepartment: Department | null;
  startAt: string;
  durationMinutes: number;
  maxViolations: number;
  questions: ContestQuestion[];
  createdBy: string;
  createdByRole: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface ContestEnvelope<T> {
  contest: T;
}

export interface ContestStandingItem {
  rank: number;
  attemptId: string;
  userEmail: string;
  userName: string | null;
  userUid: string | null;
  userDepartment: Department | null;
  score: number;
  solvedCount: number;
  status: ContestAttemptStatus;
  violationCount: number;
  violationPenaltyPoints: number;
  timeTakenMs: number | null;
  startedAt: string;
  submittedAt: string | null;
  autoSubmittedAt: string | null;
  lastSolvedAt: string | null;
}

export interface ContestAttemptSummary {
  id: string;
  userEmail: string;
  userName: string | null;
  userUid: string | null;
  userDepartment: Department | null;
  status: ContestAttemptStatus;
  score: number;
  violationCount: number;
  violationPenaltyPoints: number;
  timeTakenMs: number | null;
  startedAt: string;
  submittedAt: string | null;
  autoSubmittedAt: string | null;
  lastSolvedAt: string | null;
}

export interface ContestStandingsEnvelope {
  items: ContestStandingItem[];
}

export interface ContestAttemptsEnvelope {
  items: ContestAttemptSummary[];
}

export interface ContestAttemptEnvelope {
  attempt: ContestAttempt;
}

export interface ContestQuestionBaseDetail {
  id: string;
  questionNumber: number;
  type: ContestQuestionType;
  title: string;
  points: number;
  status: "UNATTEMPTED" | "ATTEMPTED" | "SOLVED";
  awardedPoints: number;
}

export interface ObjectiveContestQuestionDetail extends ContestQuestionBaseDetail {
  type: "MCQ" | "MSQ";
  statement: string;
  options: string[];
}

export interface CodingContestQuestionDetail extends ContestQuestionBaseDetail {
  type: "Coding";
  difficulty: Difficulty;
  problemStatement: string;
  constraints: string;
  inputFormat: string;
  outputFormat: string;
  timeLimitSeconds: number;
  memoryLimitMb: number;
  sampleTestCases: ProblemTestCase[];
  supportedLanguages: ExecutableLanguage[];
}

export type StudentContestQuestionDetail =
  | ObjectiveContestQuestionDetail
  | CodingContestQuestionDetail;

export interface StudentContestQuestionEnvelope {
  contest: {
    id: string;
    title: string;
    type: ContestType;
    computedStatus: ContestStatus;
    startAt: string;
    durationMinutes: number;
    maxViolations: number;
    resultsPublished: boolean;
  };
  attempt: ContestAttempt | null;
  question: StudentContestQuestionDetail;
}

export interface FacultyContestAttemptQuestionReviewBase {
  questionId: string;
  questionNumber: number;
  type: ContestQuestionType;
  title: string;
  points: number;
  awardedPoints: number;
  status: "UNATTEMPTED" | "ATTEMPTED" | "SOLVED";
  attemptsCount: number;
}

export interface FacultyObjectiveQuestionReview extends FacultyContestAttemptQuestionReviewBase {
  type: "MCQ" | "MSQ";
  statement: string;
  options: string[];
  submittedAnswer: string | string[] | null;
  correctAnswer: string | string[];
  isCorrect: boolean | null;
}

export interface FacultyCodingQuestionReview extends FacultyContestAttemptQuestionReviewBase {
  type: "Coding";
  difficulty: Difficulty;
  problemStatement: string;
  constraints: string;
  inputFormat: string;
  outputFormat: string;
  passedCount: number;
  totalCount: number;
  finalSubmissionId: string | null;
  finalSubmissionLanguage: ExecutableLanguage | null;
  finalSubmissionStatus: string | null;
  finalRuntimeMs: number;
  finalMemoryKb: number;
  finalCode: string | null;
}

export type FacultyContestAttemptQuestionReview =
  | FacultyObjectiveQuestionReview
  | FacultyCodingQuestionReview;

export interface FacultyContestAttemptReview {
  attemptId: string;
  contestId: string;
  contestTitle: string;
  student: {
    email: string;
    name: string | null;
    uid: string | null;
    department: Department | null;
  };
  status: ContestAttemptStatus;
  score: number;
  solvedCount: number;
  violationCount: number;
  violationPenaltyPoints: number;
  timeTakenMs: number | null;
  startedAt: string;
  submittedAt: string | null;
  autoSubmittedAt: string | null;
  questionReviews: FacultyContestAttemptQuestionReview[];
}

export interface FacultyContestAttemptReviewEnvelope {
  review: FacultyContestAttemptReview;
}

export interface CreateContestPayload {
  title: string;
  startTime: string;
  duration: number;
  type: ContestType;
  lifecycleState?: ContestLifecycleState;
  targetDepartment?: Department | null;
  maxViolations?: number;
  questions: ContestQuestion[];
}

export type UpdateContestPayload = Partial<CreateContestPayload>;

export interface ContestAnswerPayload {
  questionId: string;
  answer: string | string[];
}

export interface ContestCodingSubmissionPayload {
  questionId: string;
  code: string;
  language: ExecutableLanguage;
}

export interface ContestCodingSubmissionReceipt {
  submissionId: string;
  status: SubmissionStatus;
}

export interface ContestResultsVisibilityPayload {
  resultsPublished: boolean;
}

export interface ContestProctoringPayload {
  type:
    | "TAB_SWITCH"
    | "VISIBILITY_LOSS"
    | "FULLSCREEN_EXIT"
    | "COPY"
    | "CUT"
    | "PASTE"
    | "CONTEXT_MENU"
    | "PRINT_SCREEN";
  details?: string | null;
}

export interface SubmissionWritePayload {
  problemId: string;
  code: string;
  language: ExecutableLanguage;
}

export interface ProblemWritePayload {
  title: string;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
  difficulty: Difficulty;
  tags: string[];
  timeLimitSeconds: number;
  memoryLimitMb: number;
  lifecycleState: ProblemLifecycleState;
  targetDepartment?: Department | null;
  sampleTestCases: ProblemTestCase[];
  hiddenTestCases: ProblemTestCase[];
}

export type ProblemUpdatePayload = Partial<ProblemWritePayload>;

export interface ProblemEditorData {
  title: string;
  difficulty: Difficulty;
  tags: string[];
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
  timeLimitSeconds: number;
  memoryLimitMb: number;
  sampleTestCases: ProblemTestCase[];
  hiddenTestCases: ProblemTestCase[];
  targetDepartment?: Department | null;
  lifecycleState?: ProblemLifecycleState;
}

export interface ApiErrorPayload {
  status: number;
  message: string;
  loginUrl?: string;
  details?: unknown;
}
