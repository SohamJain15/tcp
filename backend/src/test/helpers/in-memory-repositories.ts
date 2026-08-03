import type {
  ClassTestAttemptRecord,
  ClassTestFeedbackRecord,
  ClassTestProctoringEventRecord,
  ClassTestRecord,
} from "../../modules/classtest/classtest.model";
import type {
  ClassTestAttemptRepository,
  ClassTestFeedbackRepository,
  ClassTestProctoringRepository,
  ClassTestRepository,
} from "../../modules/classtest/classtest.repository";
import type { LeaderboardEntry } from "../../modules/leaderboard/leaderboard.model";
import type { LeaderboardRepository } from "../../modules/leaderboard/leaderboard.repository";
import type {
  ContestAttemptRecord,
  ContestFeedbackRecord,
  ContestProctoringEventRecord,
  ContestRecord,
  ContestRegistrationRecord,
} from "../../modules/contest/contest.model";
import type {
  ContestAttemptRepository,
  ContestFeedbackRepository,
  ContestProctoringRepository,
  ContestRegistrationRepository,
  ContestRepository,
} from "../../modules/contest/contest.repository";
import type { ContestReportRecord } from "../../modules/report/report.model";
import type {
  ClaimReportInput,
  ContestReportRepository,
} from "../../modules/report/report.repository";
import type { ProblemRecord } from "../../modules/problem/problem.model";
import type { ProblemRepository } from "../../modules/problem/problem.repository";
import type { SubmissionRecord } from "../../modules/submission/submission.model";
import type {
  SubmissionAnalyticsRecord,
  SubmissionListFilters,
  SubmissionRepository,
} from "../../modules/submission/submission.repository";
import type { UserRecord } from "../../modules/user/user.model";
import type { UserRecordUpdate, UserRepository } from "../../modules/user/user.repository";
import type { UserRole } from "../../shared/types/auth";
import type { Department } from "../../shared/types/domain";

function cloneDate(value: Date | null): Date | null {
  return value ? new Date(value.getTime()) : null;
}

function cloneUser(user: UserRecord): UserRecord {
  return {
    ...user,
    createdAt: new Date(user.createdAt.getTime()),
    updatedAt: new Date(user.updatedAt.getTime()),
    lastLoginAt: cloneDate(user.lastLoginAt),
    lastAcceptedAt: cloneDate(user.lastAcceptedAt),
  };
}

function cloneProblem(problem: ProblemRecord): ProblemRecord {
  return {
    ...problem,
    constraints: [...problem.constraints],
    tags: [...problem.tags],
    sampleTestCases: problem.sampleTestCases.map((testCase) => ({ ...testCase })),
    hiddenTestCases: problem.hiddenTestCases.map((testCase) => ({ ...testCase })),
    createdAt: new Date(problem.createdAt.getTime()),
    updatedAt: new Date(problem.updatedAt.getTime()),
  };
}

function cloneSubmission(submission: SubmissionRecord): SubmissionRecord {
  return {
    ...submission,
    createdAt: new Date(submission.createdAt.getTime()),
    updatedAt: new Date(submission.updatedAt.getTime()),
    judgedAt: cloneDate(submission.judgedAt),
    finalizationAppliedAt: cloneDate(submission.finalizationAppliedAt),
  };
}

function cloneContest(contest: ContestRecord): ContestRecord {
  return {
    ...contest,
    questions: contest.questions.map((question) => {
      if (question.type === "Coding") {
        return {
          ...question,
          sampleTestCases: question.sampleTestCases.map((testCase) => ({ ...testCase })),
          hiddenTestCases: question.hiddenTestCases.map((testCase) => ({ ...testCase })),
          supportedLanguages: [...question.supportedLanguages],
        };
      }

      if (question.type === "MSQ") {
        return {
          ...question,
          options: [...question.options],
          correctAnswers: [...question.correctAnswers],
        };
      }

      return {
        ...question,
        options: [...question.options],
      };
    }),
    startAt: new Date(contest.startAt.getTime()),
    endAt: new Date(contest.endAt.getTime()),
    registrationOpenAt: new Date(contest.registrationOpenAt.getTime()),
    registrationCloseAt: new Date(contest.registrationCloseAt.getTime()),
    createdAt: new Date(contest.createdAt.getTime()),
    updatedAt: new Date(contest.updatedAt.getTime()),
  };
}

function cloneContestRegistration(registration: ContestRegistrationRecord): ContestRegistrationRecord {
  return {
    ...registration,
    registeredAt: new Date(registration.registeredAt.getTime()),
  };
}

function cloneContestAttempt(attempt: ContestAttemptRecord): ContestAttemptRecord {
  return {
    ...attempt,
    questionStates: attempt.questionStates.map((state) => ({
      ...state,
      solvedAt: cloneDate(state.solvedAt),
    })),
    startedAt: new Date(attempt.startedAt.getTime()),
    deadlineAt: new Date(attempt.deadlineAt.getTime()),
    updatedAt: new Date(attempt.updatedAt.getTime()),
    submittedAt: cloneDate(attempt.submittedAt),
    autoSubmittedAt: cloneDate(attempt.autoSubmittedAt),
    lastSolvedAt: cloneDate(attempt.lastSolvedAt),
  };
}

function cloneProctoringEvent(event: ContestProctoringEventRecord): ContestProctoringEventRecord {
  return {
    ...event,
    createdAt: new Date(event.createdAt.getTime()),
  };
}

function cloneLeaderboardEntry(entry: LeaderboardEntry): LeaderboardEntry {
  return {
    ...entry,
    createdAt: new Date(entry.createdAt.getTime()),
    updatedAt: new Date(entry.updatedAt.getTime()),
    lastAcceptedAt: cloneDate(entry.lastAcceptedAt),
  };
}

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, UserRecord>();

  constructor(seed: UserRecord[] = []) {
    seed.forEach((user) => this.users.set(user.email, cloneUser(user)));
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = this.users.get(email);
    return user ? cloneUser(user) : null;
  }

  async getByEmail(email: string): Promise<UserRecord | null> {
    return this.findByEmail(email);
  }

  async listByDepartment(department: Department, role?: UserRole): Promise<UserRecord[]> {
    return Array.from(this.users.values())
      .filter((user) => user.department === department)
      .filter((user) => (role ? user.role === role : true))
      .map(cloneUser);
  }

  async update(email: string, updates: UserRecordUpdate): Promise<UserRecord> {
    const existingUser = await this.findByEmail(email);
    if (!existingUser) {
      throw new Error(`User not found for update: ${email}`);
    }

    const updatedUser: UserRecord = {
      ...existingUser,
      ...updates,
      email: existingUser.email,
      createdAt: existingUser.createdAt,
    };

    this.users.set(email, cloneUser(updatedUser));
    return cloneUser(updatedUser);
  }

  async save(user: UserRecord): Promise<UserRecord> {
    this.users.set(user.email, cloneUser(user));
    return cloneUser(user);
  }

  async deleteByEmail(email: string): Promise<void> {
    this.users.delete(email);
  }
}

export class InMemoryProblemRepository implements ProblemRepository {
  private readonly problems = new Map<string, ProblemRecord>();

  constructor(seed: ProblemRecord[] = []) {
    seed.forEach((problem) => this.problems.set(problem.id, cloneProblem(problem)));
  }

  async getById(problemId: string): Promise<ProblemRecord | null> {
    const problem = this.problems.get(problemId);
    return problem ? cloneProblem(problem) : null;
  }

  async save(problem: ProblemRecord): Promise<ProblemRecord> {
    this.problems.set(problem.id, cloneProblem(problem));
    return cloneProblem(problem);
  }

  async list(): Promise<ProblemRecord[]> {
    return Array.from(this.problems.values()).map(cloneProblem);
  }
}

export class InMemorySubmissionRepository implements SubmissionRepository {
  private readonly submissions = new Map<string, SubmissionRecord>();

  constructor(seed: SubmissionRecord[] = []) {
    seed.forEach((submission) => this.submissions.set(submission.id, cloneSubmission(submission)));
  }

  async getById(submissionId: string): Promise<SubmissionRecord | null> {
    const submission = this.submissions.get(submissionId);
    return submission ? cloneSubmission(submission) : null;
  }

  async save(submission: SubmissionRecord): Promise<SubmissionRecord> {
    this.submissions.set(submission.id, cloneSubmission(submission));
    return cloneSubmission(submission);
  }

  async create(submission: SubmissionRecord): Promise<SubmissionRecord> {
    this.submissions.set(submission.id, cloneSubmission(submission));
    return cloneSubmission(submission);
  }

  async list(filters: SubmissionListFilters = {}): Promise<SubmissionRecord[]> {
    return Array.from(this.submissions.values())
      .filter((submission) => (filters.userEmail ? submission.userEmail === filters.userEmail : true))
      .filter((submission) => (filters.problemId ? submission.problemId === filters.problemId : true))
      .filter((submission) =>
        filters.resourceOwnerEmail ? submission.resourceOwnerEmail === filters.resourceOwnerEmail : true,
      )
      .filter((submission) =>
        filters.userDepartment ? submission.userDepartment === filters.userDepartment : true,
      )
      .filter((submission) => (filters.contestId ? submission.contestId === filters.contestId : true))
      .filter((submission) => (filters.status ? submission.status === filters.status : true))
      .filter((submission) => (filters.language ? submission.language === filters.language : true))
      // Production honours sourceType; this stand-in used to ignore it, which hid
      // practice-vs-contest filtering bugs from the test suite entirely.
      .filter((submission) => (filters.sourceType ? submission.sourceType === filters.sourceType : true))
      .filter((submission) =>
        filters.userEmails ? filters.userEmails.includes(submission.userEmail) : true,
      )
      .filter((submission) =>
        filters.createdFrom ? submission.createdAt.getTime() >= filters.createdFrom.getTime() : true,
      )
      .filter((submission) =>
        filters.createdTo ? submission.createdAt.getTime() <= filters.createdTo.getTime() : true,
      )
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map(cloneSubmission);
  }

  async listForAnalytics(filters: SubmissionListFilters = {}): Promise<SubmissionAnalyticsRecord[]> {
    const submissions = await this.list(filters);
    return submissions.map(({ code: _code, stdout: _stdout, stderr: _stderr, ...rest }) => rest);
  }
}

export class InMemoryLeaderboardRepository implements LeaderboardRepository {
  private readonly entries = new Map<string, LeaderboardEntry>();

  constructor(seed: LeaderboardEntry[] = []) {
    seed.forEach((entry) => this.entries.set(entry.email, cloneLeaderboardEntry(entry)));
  }

  async getByEmail(email: string): Promise<LeaderboardEntry | null> {
    const entry = this.entries.get(email);
    return entry ? cloneLeaderboardEntry(entry) : null;
  }

  async save(entry: LeaderboardEntry): Promise<LeaderboardEntry> {
    this.entries.set(entry.email, cloneLeaderboardEntry(entry));
    return cloneLeaderboardEntry(entry);
  }

  async delete(email: string): Promise<void> {
    this.entries.delete(email);
  }

  async list(): Promise<LeaderboardEntry[]> {
    return Array.from(this.entries.values()).map(cloneLeaderboardEntry);
  }
}

export class InMemoryContestRepository implements ContestRepository {
  private readonly contests = new Map<string, ContestRecord>();

  constructor(seed: ContestRecord[] = []) {
    seed.forEach((contest) => this.contests.set(contest.id, cloneContest(contest)));
  }

  async getById(contestId: string): Promise<ContestRecord | null> {
    const contest = this.contests.get(contestId);
    return contest ? cloneContest(contest) : null;
  }

  async save(contest: ContestRecord): Promise<ContestRecord> {
    this.contests.set(contest.id, cloneContest(contest));
    return cloneContest(contest);
  }

  async list(): Promise<ContestRecord[]> {
    return Array.from(this.contests.values()).map(cloneContest);
  }
}

export class InMemoryContestRegistrationRepository implements ContestRegistrationRepository {
  private readonly registrations = new Map<string, ContestRegistrationRecord>();

  constructor(seed: ContestRegistrationRecord[] = []) {
    seed.forEach((registration) =>
      this.registrations.set(
        `${registration.contestId}:${registration.userEmail}`,
        cloneContestRegistration(registration),
      ),
    );
  }

  async getByContestAndUser(contestId: string, userEmail: string): Promise<ContestRegistrationRecord | null> {
    const registration = this.registrations.get(`${contestId}:${userEmail}`);
    return registration ? cloneContestRegistration(registration) : null;
  }

  async listByContest(contestId: string): Promise<ContestRegistrationRecord[]> {
    return Array.from(this.registrations.values())
      .filter((registration) => registration.contestId === contestId)
      .map(cloneContestRegistration);
  }

  async save(registration: ContestRegistrationRecord): Promise<ContestRegistrationRecord> {
    this.registrations.set(
      `${registration.contestId}:${registration.userEmail}`,
      cloneContestRegistration(registration),
    );
    return cloneContestRegistration(registration);
  }

  async delete(contestId: string, userEmail: string): Promise<void> {
    this.registrations.delete(`${contestId}:${userEmail}`);
  }
}

export class InMemoryContestAttemptRepository implements ContestAttemptRepository {
  private readonly attempts = new Map<string, ContestAttemptRecord>();

  constructor(seed: ContestAttemptRecord[] = []) {
    seed.forEach((attempt) => this.attempts.set(attempt.id, cloneContestAttempt(attempt)));
  }

  async getById(attemptId: string): Promise<ContestAttemptRecord | null> {
    const attempt = this.attempts.get(attemptId);
    return attempt ? cloneContestAttempt(attempt) : null;
  }

  async getByContestAndUser(contestId: string, userEmail: string): Promise<ContestAttemptRecord | null> {
    const attempt = Array.from(this.attempts.values()).find(
      (entry) => entry.contestId === contestId && entry.userEmail === userEmail,
    );
    return attempt ? cloneContestAttempt(attempt) : null;
  }

  async save(attempt: ContestAttemptRecord): Promise<ContestAttemptRecord> {
    this.attempts.set(attempt.id, cloneContestAttempt(attempt));
    return cloneContestAttempt(attempt);
  }

  async listByContest(contestId: string): Promise<ContestAttemptRecord[]> {
    return Array.from(this.attempts.values())
      .filter((attempt) => attempt.contestId === contestId)
      .map(cloneContestAttempt);
  }

  async listActiveExpired(now: Date): Promise<ContestAttemptRecord[]> {
    return Array.from(this.attempts.values())
      .filter((attempt) => attempt.status === "ACTIVE" && attempt.deadlineAt.getTime() <= now.getTime())
      .map(cloneContestAttempt);
  }
}

export class InMemoryContestFeedbackRepository implements ContestFeedbackRepository {
  private readonly feedback = new Map<string, ContestFeedbackRecord>();

  constructor(seed: ContestFeedbackRecord[] = []) {
    seed.forEach((record) => this.feedback.set(`${record.contestId}:${record.userEmail}`, { ...record }));
  }

  async getByContestAndUser(contestId: string, userEmail: string): Promise<ContestFeedbackRecord | null> {
    const record = this.feedback.get(`${contestId}:${userEmail}`);
    return record ? { ...record, createdAt: new Date(record.createdAt.getTime()) } : null;
  }

  async save(record: ContestFeedbackRecord): Promise<ContestFeedbackRecord> {
    this.feedback.set(`${record.contestId}:${record.userEmail}`, {
      ...record,
      createdAt: new Date(record.createdAt.getTime()),
    });
    return { ...record };
  }
}

export class InMemoryContestProctoringRepository implements ContestProctoringRepository {
  private readonly events = new Map<string, ContestProctoringEventRecord>();

  constructor(seed: ContestProctoringEventRecord[] = []) {
    seed.forEach((event) => this.events.set(event.id, cloneProctoringEvent(event)));
  }

  async create(event: ContestProctoringEventRecord): Promise<ContestProctoringEventRecord> {
    this.events.set(event.id, cloneProctoringEvent(event));
    return cloneProctoringEvent(event);
  }

  async listByAttempt(attemptId: string): Promise<ContestProctoringEventRecord[]> {
    return Array.from(this.events.values())
      .filter((event) => event.attemptId === attemptId)
      .map(cloneProctoringEvent);
  }
}

// --- class tests -------------------------------------------------------------

function cloneClassTest(test: ClassTestRecord): ClassTestRecord {
  return {
    ...test,
    startAt: new Date(test.startAt),
    createdAt: new Date(test.createdAt),
    updatedAt: new Date(test.updatedAt),
    managerEmails: [...test.managerEmails],
    audience: { ...test.audience },
    assignedStudents: test.assignedStudents.map((student) => ({ ...student })),
    questions: test.questions.map((question) => ({ ...question })),
  };
}

function cloneClassTestAttempt(attempt: ClassTestAttemptRecord): ClassTestAttemptRecord {
  return {
    ...attempt,
    questionStates: attempt.questionStates.map((state) => ({
      ...state,
      gradedAt: state.gradedAt ? new Date(state.gradedAt) : null,
      submittedAnswer: Array.isArray(state.submittedAnswer)
        ? [...state.submittedAnswer]
        : state.submittedAnswer,
    })),
    startedAt: new Date(attempt.startedAt),
    deadlineAt: new Date(attempt.deadlineAt),
    submittedAt: attempt.submittedAt ? new Date(attempt.submittedAt) : null,
    autoSubmittedAt: attempt.autoSubmittedAt ? new Date(attempt.autoSubmittedAt) : null,
    createdAt: new Date(attempt.createdAt),
    updatedAt: new Date(attempt.updatedAt),
  };
}

export class InMemoryClassTestRepository implements ClassTestRepository {
  private readonly tests = new Map<string, ClassTestRecord>();

  constructor(seed: ClassTestRecord[] = []) {
    seed.forEach((test) => this.tests.set(test.id, cloneClassTest(test)));
  }

  async getById(classTestId: string): Promise<ClassTestRecord | null> {
    const test = this.tests.get(classTestId);
    return test ? cloneClassTest(test) : null;
  }

  async save(test: ClassTestRecord): Promise<ClassTestRecord> {
    this.tests.set(test.id, cloneClassTest(test));
    return cloneClassTest(test);
  }

  async list(): Promise<ClassTestRecord[]> {
    return Array.from(this.tests.values()).map(cloneClassTest);
  }
}

export class InMemoryClassTestAttemptRepository implements ClassTestAttemptRepository {
  private readonly attempts = new Map<string, ClassTestAttemptRecord>();

  constructor(seed: ClassTestAttemptRecord[] = []) {
    seed.forEach((attempt) => this.attempts.set(attempt.id, cloneClassTestAttempt(attempt)));
  }

  async getById(attemptId: string): Promise<ClassTestAttemptRecord | null> {
    const attempt = this.attempts.get(attemptId);
    return attempt ? cloneClassTestAttempt(attempt) : null;
  }

  async getByTestAndUser(classTestId: string, userEmail: string): Promise<ClassTestAttemptRecord | null> {
    const attempt = Array.from(this.attempts.values()).find(
      (entry) => entry.classTestId === classTestId && entry.userEmail === userEmail,
    );
    return attempt ? cloneClassTestAttempt(attempt) : null;
  }

  async listByTest(classTestId: string): Promise<ClassTestAttemptRecord[]> {
    return Array.from(this.attempts.values())
      .filter((attempt) => attempt.classTestId === classTestId)
      .map(cloneClassTestAttempt);
  }

  async save(attempt: ClassTestAttemptRecord): Promise<ClassTestAttemptRecord> {
    this.attempts.set(attempt.id, cloneClassTestAttempt(attempt));
    return cloneClassTestAttempt(attempt);
  }

  async listActiveExpired(now: Date): Promise<ClassTestAttemptRecord[]> {
    return Array.from(this.attempts.values())
      .filter((attempt) => attempt.status === "ACTIVE" && attempt.deadlineAt.getTime() <= now.getTime())
      .map(cloneClassTestAttempt);
  }
}

export class InMemoryClassTestFeedbackRepository implements ClassTestFeedbackRepository {
  private readonly feedback = new Map<string, ClassTestFeedbackRecord>();

  private key(classTestId: string, userEmail: string): string {
    return `${classTestId}::${userEmail.toLowerCase()}`;
  }

  async getByTestAndUser(classTestId: string, userEmail: string): Promise<ClassTestFeedbackRecord | null> {
    return this.feedback.get(this.key(classTestId, userEmail)) ?? null;
  }

  async save(record: ClassTestFeedbackRecord): Promise<ClassTestFeedbackRecord> {
    this.feedback.set(this.key(record.classTestId, record.userEmail), { ...record });
    return { ...record };
  }
}

export class InMemoryClassTestProctoringRepository implements ClassTestProctoringRepository {
  private readonly events = new Map<string, ClassTestProctoringEventRecord>();

  async create(event: ClassTestProctoringEventRecord): Promise<ClassTestProctoringEventRecord> {
    this.events.set(event.id, { ...event, createdAt: new Date(event.createdAt) });
    return { ...event };
  }

  async listByAttempt(attemptId: string): Promise<ClassTestProctoringEventRecord[]> {
    return Array.from(this.events.values())
      .filter((event) => event.attemptId === attemptId)
      .map((event) => ({ ...event, createdAt: new Date(event.createdAt) }));
  }
}

export class InMemoryContestReportRepository implements ContestReportRepository {
  private readonly reports = new Map<string, ContestReportRecord>();

  async getByContestId(contestId: string): Promise<ContestReportRecord | null> {
    const report = this.reports.get(contestId);
    return report ? { ...report } : null;
  }

  async claimForGeneration(input: ClaimReportInput): Promise<ContestReportRecord | null> {
    const existing = this.reports.get(input.contestId);
    const staleBefore = input.now.getTime() - input.staleLockMs;

    // Same rule as the Mongo implementation: a live GENERATING claim blocks, a finished or
    // abandoned one can be taken over.
    if (
      existing &&
      existing.status === "GENERATING" &&
      existing.generationStartedAt.getTime() > staleBefore
    ) {
      return null;
    }

    const claim: ContestReportRecord = {
      id: `report_${input.contestId}`,
      contestId: input.contestId,
      status: "GENERATING",
      source: "TEMPLATE",
      metrics: null,
      narrative: null,
      warnings: [],
      modelId: null,
      promptVersion: null,
      metricsHash: null,
      generatedByEmail: input.generatedByEmail,
      generationStartedAt: input.now,
      generatedAt: null,
      failureReason: null,
      createdAt: existing?.createdAt ?? input.now,
      updatedAt: input.now,
    };

    this.reports.set(input.contestId, claim);
    return { ...claim };
  }

  async save(record: ContestReportRecord): Promise<ContestReportRecord> {
    this.reports.set(record.contestId, { ...record });
    return { ...record };
  }
}
