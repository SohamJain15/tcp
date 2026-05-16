import type { LeaderboardEntry } from "../../modules/leaderboard/leaderboard.model";
import type { LeaderboardRepository } from "../../modules/leaderboard/leaderboard.repository";
import type {
  ContestAttemptRecord,
  ContestProctoringEventRecord,
  ContestRecord,
} from "../../modules/contest/contest.model";
import type {
  ContestAttemptRepository,
  ContestProctoringRepository,
  ContestRepository,
} from "../../modules/contest/contest.repository";
import type { ProblemRecord } from "../../modules/problem/problem.model";
import type { ProblemRepository } from "../../modules/problem/problem.repository";
import type { SubmissionRecord } from "../../modules/submission/submission.model";
import type { SubmissionListFilters, SubmissionRepository } from "../../modules/submission/submission.repository";
import type { UserRecord } from "../../modules/user/user.model";
import type { UserRecordUpdate, UserRepository } from "../../modules/user/user.repository";

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
    createdAt: new Date(contest.createdAt.getTime()),
    updatedAt: new Date(contest.updatedAt.getTime()),
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
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map(cloneSubmission);
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
