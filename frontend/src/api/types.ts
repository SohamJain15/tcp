/**
 * `ADMIN` is institute leadership, sourced from the CoE `role` claim. It is a read-only analytics
 * role and is deliberately narrower than FACULTY — no authoring, no grading, no submitted code.
 */
export type UserRole = "STUDENT" | "FACULTY" | "ADMIN";
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
  /** Faculty-only. Unlocks the read-only department participation view. */
  isHod: boolean;
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
      // No semester: the server derives it from the UID and refreshes it on every login, so
      // anything sent from here is ignored.
      linkedInUrl: string | null;
      githubUrl: string | null;
    }
  | {
      name: string;
      designation: string;
      department: Department;
      linkedInUrl: string | null;
      githubUrl: string | null;
      // The endpoint replaces the whole faculty profile, so this must be re-sent on
      // every save; omitting it silently clears an existing HOD flag.
      isHod?: boolean;
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
  /** Per-language starter code from the harness signature (metadata-driven problems only). */
  starterCode?: Partial<Record<ExecutableLanguage, string>>;
  /** Whether this problem uses the metadata-driven harness. */
  harnessEnabled?: boolean;
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
  slug: string;
  statement: string;
  topic: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
  explanation: string;
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
  semester: number | null;
  year: 1 | 2 | 3 | 4 | null;
  rating: number;
  score: number;
  problemsSolved: number;
  submissionCount: number;
  acceptedSubmissionCount: number;
  accuracy: number;
  /** Memory efficiency relative to the ranked field, 0-1. Null when nobody has measured code. */
  optimizationScore: number | null;
  avgAcceptedRuntimeMs: number;
  updatedAt: string;
  lastAcceptedAt: string | null;
}

export interface LeaderboardListResponse extends PaginatedResponse<LeaderboardItem> {
  /**
   * The signed-in user's own row, whatever their rank. Only the first page of the board is sent, so
   * a student ranked outside it would otherwise be missing from the payload entirely and could not
   * be pinned. `null` for anyone not on the board (faculty, admins, or filtered out).
   */
  currentUserEntry: LeaderboardItem | null;
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

export interface UserProfileAnalyticsProgressItem {
  date: string;
  submissionCount: number;
  acceptedCount: number;
  firstSolveCount: number;
}

/** Estimated from submission activity — the platform does not measure sessions. */
export interface UserProfileAnalyticsActiveTime {
  estimatedActiveMinutes: number;
  byDate: { date: string; minutes: number }[];
}

export interface UserProfileAnalytics {
  difficultyBreakdown: UserProfileAnalyticsDifficultyItem[];
  languageBreakdown: UserProfileAnalyticsLanguageItem[];
  submissionHeatmap: UserProfileAnalyticsHeatmapItem[];
  progressTrend: UserProfileAnalyticsProgressItem[];
  activeTime: UserProfileAnalyticsActiveTime;
  recentAcceptedSubmissions: UserProfileAnalyticsSubmissionItem[];
  submissionHistory: UserProfileAnalyticsSubmissionItem[];
}

export type StudentYear = 1 | 2 | 3 | 4;
export type ActivityLevel = "Inactive" | "Low" | "Moderate" | "High";

export interface DepartmentWindow {
  from: string;
  to: string;
  days: number;
}

export interface DepartmentOverview {
  department: Department;
  window: DepartmentWindow;
  totals: {
    studentCount: number;
    activeStudentCount: number;
    participationRate: number;
    submissionCount: number;
    acceptedSubmissionCount: number;
    accuracy: number;
    problemsSolved: number;
    contestRegistrationCount: number;
    contestAttemptCount: number;
    problemsCreatedCount: number;
    contestsCreatedCount: number;
  };
  participationByYear: {
    year: StudentYear | null;
    label: string;
    studentCount: number;
    activeStudentCount: number;
    participationRate: number;
    submissionCount: number;
    contestRegisteredCount: number;
    contestAttemptedCount: number;
  }[];
  activityTrend: {
    date: string;
    submissionCount: number;
    acceptedCount: number;
    activeStudentCount: number;
  }[];
  activityLevelDistribution: {
    level: ActivityLevel;
    studentCount: number;
    minActiveDays: number;
    maxActiveDays: number;
  }[];
  consistency: {
    windowDays: number;
    averageConsistencyScore: number;
    averageActiveDayRatio: number;
    averageWeeklyRegularity: number;
    averageActiveDays: number;
    averageCurrentStreakDays: number;
    averageLongestStreakDays: number;
    facultyAverageConsistencyScore: number;
    distribution: { band: string; studentCount: number }[];
  };
  submissionHeatmap: UserProfileAnalyticsHeatmapItem[];
  difficultyBreakdown: UserProfileAnalyticsDifficultyItem[];
  languageBreakdown: UserProfileAnalyticsLanguageItem[];
  contestParticipation: DepartmentContestParticipation[];
}

/** Participation counts only — this shape intentionally carries no question content. */
export interface DepartmentContestParticipation {
  contestId: string;
  title: string;
  conductedByName: string | null;
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

export interface DepartmentStudentDetail {
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
  difficultyBreakdown: UserProfileAnalyticsDifficultyItem[];
  languageBreakdown: UserProfileAnalyticsLanguageItem[];
  submissionHeatmap: UserProfileAnalyticsHeatmapItem[];
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

export interface DepartmentFacultyItem {
  email: string;
  name: string | null;
  designation: string | null;
  isHod: boolean;
}

export interface ManagedContestItem {
  contestId: string;
  title: string;
  computedStatus: string;
  startAt: string;
  endAt: string;
  resultsPublished: boolean;
  managers: { email: string; name: string | null }[];
}

export interface DepartmentFacultyEnvelope {
  faculty: DepartmentFacultyItem[];
}

export interface ManagedContestsEnvelope {
  contests: ManagedContestItem[];
}

export interface ManagedContestEnvelope {
  contest: ManagedContestItem;
}

export interface DepartmentOverviewEnvelope {
  overview: DepartmentOverview;
}

export interface DepartmentStudentDetailEnvelope {
  student: DepartmentStudentDetail;
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
export type ContestRegistrationStatus = "NOT_OPEN" | "OPEN" | "CLOSED";

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
  endAt: string;
  durationMinutes: number;
  registrationOpenAt: string;
  registrationCloseAt: string;
  registrationStatus: ContestRegistrationStatus;
  isRegistered: boolean;
  registeredCount: number;
  participantsCount: number;
  createdBy: string;
}

export interface ContestRegistration {
  id: string;
  contestId: string;
  userEmail: string;
  userName: string | null;
  userUid: string | null;
  userDepartment: Department | null;
  registeredAt: string;
}

export interface ContestRegistrationItem {
  id: string;
  userEmail: string;
  userName: string | null;
  userUid: string | null;
  userDepartment: Department | null;
  year: 1 | 2 | 3 | 4 | null;
  registeredAt: string;
  hasAttempted: boolean;
  attemptStatus: ContestStudentAttemptStatus;
}

export interface ContestRegistrationEnvelope {
  registration: ContestRegistration;
}

export interface ContestRegistrationsEnvelope {
  items: ContestRegistrationItem[];
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
  draftCode: string | null;
  draftLanguage: ExecutableLanguage | null;
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
  deadlineAt: string;
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
  correctAnswer?: string | string[];
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
  endAt: string;
  durationMinutes: number;
  registrationOpenAt: string;
  registrationCloseAt: string;
  registrationStatus: ContestRegistrationStatus;
  isRegistered: boolean;
  registeredCount: number;
  maxViolations: number;
  studentListStatus: ContestStudentListStatus;
  attemptStatus: ContestStudentAttemptStatus;
  hasAttempted: boolean;
  questions: StudentContestQuestionSummary[];
  attempt: ContestAttempt | null;
  report: StudentContestReport | null;
  feedbackSubmitted: boolean;
}

export interface ContestFeedbackPayload {
  name: string;
  uid: string;
  navigationEase: number;
  visualDesignRating: number;
  interfaceReadability: "Yes" | "No" | "Need improvement";
  editorResponsiveness: number;
  compilationLag: number;
  errorMessageClarity: number;
  problemStatementClarity: "Yes" | "No" | "Needs improvement";
  bugsOrBrokenLinks: string;
  oneNewFeature: string;
  recommendLikelihood: number;
  overallRating: number | null;
}

export interface ContestFeedbackRecord extends ContestFeedbackPayload {
  id: string;
  contestId: string;
  userEmail: string;
  createdAt: string;
}

export interface ContestFeedbackStatus {
  submitted: boolean;
  feedback: ContestFeedbackRecord | null;
}

export interface ContestFeedbackEnvelope {
  feedback: ContestFeedbackRecord;
}

export interface FacultyContestDetail {
  id: string;
  title: string;
  type: ContestType;
  lifecycleState: ContestLifecycleState;
  resultsPublished: boolean;
  computedStatus: ContestStatus;
  targetDepartment: Department | null;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  registrationOpenAt: string;
  registrationCloseAt: string;
  registrationStatus: ContestRegistrationStatus;
  registeredCount: number;
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
  year: 1 | 2 | 3 | 4 | null;
  score: number;
  solvedCount: number;
  totalQuestions: number;
  status: ContestAttemptStatus;
  violationCount: number;
  violationPenaltyPoints: number;
  timeTakenMs: number | null;
  /** Memory + attempt efficiency relative to the field, 0-1. Null when the contest has no code. */
  optimizationScore: number | null;
  totalRuntimeMs: number;
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
  /** `null` until the contest's results are published — grading only happens at publish. */
  score: number | null;
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
  correctAnswer?: string | string[];
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
    endAt: string;
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
  endTime: string;
  duration: number;
  registrationOpenAt?: string;
  registrationCloseAt?: string;
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
  practiceMode?: boolean;
  runtimeMs?: number;
  memoryKb?: number;
  passedCount?: number;
  totalCount?: number;
  stdout?: string;
  stderr?: string;
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
  slug: string;
  statement: string;
  topic: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
  explanation: string;
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
  slug: string;
  difficulty: Difficulty;
  topic: string;
  tags: string[];
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
  explanation: string;
  timeLimitSeconds: number;
  memoryLimitMb: number;
  sampleTestCases: ProblemTestCase[];
  hiddenTestCases: ProblemTestCase[];
  targetDepartment?: Department | null;
  lifecycleState?: ProblemLifecycleState;
}

export interface ProblemDraftImportEnvelope {
  drafts: Array<ProblemEditorData & {
    timeLimit: number;
    memoryLimit: number;
  }>;
}

export interface ApiErrorPayload {
  status: number;
  message: string;
  loginUrl?: string;
  details?: unknown;
}

// --- Class Tests -------------------------------------------------------------

export type ClassTestQuestionType = "MCQ" | "MSQ" | "Coding" | "ShortAnswer";

export interface ClassTestAudienceFilter {
  department: Department;
  division: string | null;
  semester: number | null;
  rollFrom: number | null;
  rollTo: number | null;
}

export interface AssignedStudent {
  email: string;
  name: string | null;
  uid: string | null;
  rollNumber: string | null;
  division: string | null;
}

export interface AudiencePreviewItem extends AssignedStudent {
  semester: number | null;
}

export interface ClassTestSummary {
  id: string;
  title: string;
  subject: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  computedStatus: string;
  lifecycleState: string;
  resultsPublished: boolean;
  questionCount: number;
  totalPoints: number;
  assignedCount: number;
  attemptedCount?: number;
}

/** A question as a student sees it — carries no correct answer, model answer or hidden tests. */
export interface StudentClassTestQuestion {
  id: string;
  type: ClassTestQuestionType;
  points: number;
  statement: string;
  options?: string[];
  expectedSentences?: number;
  problemTitle?: string;
  difficulty?: Difficulty;
  constraints?: string;
  inputFormat?: string;
  outputFormat?: string;
  sampleTestCases?: { input: string; output: string; explanation?: string }[];
  supportedLanguages?: string[];
  timeLimitSeconds?: number;
  memoryLimitMb?: number;
}

export interface StudentClassTestSummary {
  id: string;
  title: string;
  subject: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  computedStatus: string;
  questionCount: number;
  totalPoints: number;
  attemptStatus: "NOT_STARTED" | "ACTIVE" | "SUBMITTED" | "AUTO_SUBMITTED";
  resultsPublished: boolean;
}

export interface StudentClassTestDetail extends StudentClassTestSummary {
  instructions: string | null;
  questions: StudentClassTestQuestion[];
  identity: {
    name: string | null;
    uid: string | null;
    rollNumber: string | null;
    division: string | null;
    department: string | null;
  };
  answers: { questionId: string; submittedAnswer: string | string[] | null }[];
  deadlineAt: string | null;
  maxViolations: number;
  violationCount: number;
}

export interface StudentClassTestResult {
  classTestId: string;
  title: string;
  subject: string;
  finalScore: number;
  totalPoints: number;
  questions: {
    questionId: string;
    statement: string;
    type: string;
    maxPoints: number;
    awardedPoints: number;
    submittedAnswer: string | string[] | null;
    graderNote: string | null;
  }[];
}

export interface FacultyClassTestAttempt {
  attemptId: string;
  email: string;
  name: string | null;
  uid: string | null;
  rollNumber: string | null;
  division: string | null;
  status: string;
  violationCount: number;
  suspectedMalpractice: boolean;
  gradingStatus: string;
  /** Null while the test is still running — no score exists yet. */
  autoScore: number | null;
  manualScore: number | null;
  finalScore: number | null;
  timeTakenMs: number | null;
}

export interface FacultyClassTestAttemptDetail extends FacultyClassTestAttempt {
  answers: {
    questionId: string;
    type: string;
    statement: string;
    maxPoints: number;
    awardedPoints: number;
    submittedAnswer: string | string[] | null;
    modelAnswer?: string;
    graderNote: string | null;
    requiresManualGrading: boolean;
  }[];
}

export interface ClassTestRecordEnvelope {
  classTest: ClassTestSummary & {
    instructions: string | null;
    audience: ClassTestAudienceFilter;
    assignedStudents: AssignedStudent[];
    maxViolations: number;
    questions: Array<Record<string, unknown>>;
  };
}

/**
 * AI contest report.
 *
 * Mirrors backend/src/modules/report/report.model.ts. The metrics half is deterministic and computed
 * in backend code; the narrative half is written by a local model that only paraphrases those numbers
 * (or by templates when no model is available).
 */

export type ContestReportStatus = "GENERATING" | "READY" | "FAILED";
export type ContestReportSource = "AI" | "TEMPLATE";
export type MetricConfidence = "high" | "low";

export interface DistributionStats {
  mean: number;
  median: number;
  p25: number;
  p75: number;
  p90: number;
  min: number;
  max: number;
}

export interface ReportParticipationMetrics {
  registeredCount: number;
  attemptedCount: number;
  completedCount: number;
  activeCount: number;
  disqualifiedCount: number;
  registrationToAttemptRate: number;
  completionRate: number;
  departmentBreakdown: { department: string; count: number }[];
}

export interface ReportScoreMetrics {
  totalPoints: number;
  averageScore: number;
  medianScore: number;
  maxScore: number;
  minScore: number;
  stdDev: number;
  averageScorePercent: number;
  scoreDistribution: { bucket: string; count: number }[];
  averageTimeTakenMs: number | null;
  medianTimeTakenMs: number | null;
}

export interface ReportQuestionMetrics {
  questionId: string;
  questionNumber: number;
  type: "MCQ" | "MSQ" | "Coding";
  title: string;
  points: number;
  difficulty: Difficulty | null;
  participantCount: number;
  attemptedCount: number;
  solvedCount: number;
  solveRate: number;
  attemptRate: number;
  averageAttempts: number;
  averageAwardedPoints: number;
  averagePassRate: number | null;
  averageTimeToSolveMs: number | null;
}

export interface ReportLanguageMetrics {
  language: ExecutableLanguage;
  submissionCount: number;
  acceptedCount: number;
  acceptanceRate: number;
  sampleSize: number;
  confidence: MetricConfidence;
  studentCount: number;
  runtimeMs: DistributionStats;
  memoryKb: DistributionStats;
}

export interface OptimalScoreComponent {
  component: string;
  weight: number;
  rawValue: number;
  normalized: number;
  contribution: number;
}

export interface OptimalSubmission {
  submissionId: string;
  attemptId: string;
  questionId: string;
  questionNumber: number;
  questionTitle: string;
  studentEmail: string;
  studentName: string | null;
  language: ExecutableLanguage;
  runtimeMs: number;
  memoryKb: number;
  runtimePercentile: number;
  memoryPercentile: number;
  percentileBasis: string;
  percentileSampleSize: number;
  attemptsCount: number;
  attemptEfficiencyScore: number;
  timeToSolveMs: number | null;
  solveSpeedPercentile: number;
  /** Shown for context only — violations never contribute to totalScore. */
  violationCount: number;
  totalScore: number;
  breakdown: OptimalScoreComponent[];
}

export interface ReportViolationMetrics {
  totalEvents: number;
  averagePerAttempt: number;
  attemptsWithViolations: number;
  byType: { type: string; count: number }[];
  scoreByViolationBand: { band: string; attemptCount: number; averageScore: number }[];
}

export interface ContestAnalytics {
  schemaVersion: string;
  contest: {
    id: string;
    title: string;
    type: ContestType;
    startAt: string;
    endAt: string;
    durationMinutes: number;
    targetDepartment: Department | null;
    questionCount: number;
    codingQuestionCount: number;
    totalPoints: number;
  };
  participation: ReportParticipationMetrics;
  scores: ReportScoreMetrics;
  questions: ReportQuestionMetrics[];
  hardestQuestion: { questionId: string; questionNumber: number; title: string; solveRate: number } | null;
  easiestQuestion: { questionId: string; questionNumber: number; title: string; solveRate: number } | null;
  languages: ReportLanguageMetrics[];
  optimalCode: {
    perQuestion: OptimalSubmission[];
    /** Best submission in each language, ranked only against that language's own submissions. */
    perLanguage: OptimalSubmission[];
    overall: OptimalSubmission | null;
    overallSelectionNote: string;
  };
  violations: ReportViolationMetrics;
  teachingInsights: {
    lowSolveRateQuestions: string[];
    highAttemptLowSolveQuestions: string[];
    unattemptedQuestions: string[];
    languageDisadvantageFlags: string[];
  };
  dataQuality: {
    lowSampleLanguages: string[];
    percentileBasisNotes: string[];
    excludedFromRanking: string[];
    generatedAt: string;
  };
}

export interface ContestReportNarrative {
  executiveSummary: string;
  contestInsights: string[];
  efficiencyObservations: string[];
  studentPerformanceObservations: string[];
  facultyRecommendations: string[];
}

export interface ContestReport {
  contestId: string;
  status: ContestReportStatus;
  source: ContestReportSource;
  metrics: ContestAnalytics | null;
  narrative: ContestReportNarrative | null;
  warnings: string[];
  modelId: string | null;
  promptVersion: string | null;
  metricsHash: string | null;
  generatedByEmail: string;
  generatedAt: string | null;
  failureReason: string | null;
}

export interface AiRuntimeStatus {
  available: boolean;
  model: string;
  baseUrl: string;
  reason: string | null;
}

export interface ContestReportEnvelope {
  report: ContestReport | null;
  aiRuntime: AiRuntimeStatus;
}

export interface ContestReportGenerateEnvelope {
  report: ContestReport;
}

export interface ContestReportMetricsEnvelope {
  metrics: ContestAnalytics;
}

/** Run / submit / draft payload for a Class Test coding question. */
export interface ClassTestCodingPayload {
  questionId: string;
  code: string;
  language: ExecutableLanguage;
}
