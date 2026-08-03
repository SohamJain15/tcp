import { describe, expect, it } from "vitest";

import {
  buildLeaderboardRanker,
  type LeaderboardEntry,
} from "../modules/leaderboard/leaderboard.model";
import {
  calculateUserAggregateSnapshot,
  syncUserAndLeaderboard,
} from "../modules/submission/submission.service";
import type { SubmissionRecord } from "../modules/submission/submission.model";
import type { UserRecord } from "../modules/user/user.model";
import {
  InMemoryLeaderboardRepository,
  InMemorySubmissionRepository,
  InMemoryUserRepository,
} from "./helpers/in-memory-repositories";

/**
 * Practice ranking: rating → accuracy → optimization (memory) → avg runtime → solved → email.
 *
 * Optimization is memory only here, unlike contests: `accuracy` already expresses attempt
 * efficiency and sits above it, so counting attempts again would double-count the same thing.
 */

interface EntrySpec {
  email: string;
  rating?: number;
  accuracy?: number;
  memoryKb?: number;
  runtimeMs?: number;
  problemsSolved?: number;
}

function entry(spec: EntrySpec): LeaderboardEntry {
  return {
    email: spec.email,
    role: "STUDENT",
    name: spec.email,
    uid: spec.email,
    department: null,
    semester: 3,
    year: 2,
    rating: spec.rating ?? 100,
    score: spec.rating ?? 100,
    problemsSolved: spec.problemsSolved ?? 5,
    submissionCount: 10,
    acceptedSubmissionCount: 5,
    accuracy: spec.accuracy ?? 50,
    avgAcceptedRuntimeMs: spec.runtimeMs ?? 10,
    avgAcceptedMemoryKb: spec.memoryKb ?? 1024,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    lastAcceptedAt: null,
  };
}

function rankedEmails(entries: LeaderboardEntry[]): string[] {
  const ranker = buildLeaderboardRanker(entries);
  return [...entries].sort(ranker.compare).map((item) => item.email);
}

describe("practice leaderboard order", () => {
  it("still ranks by rating first", () => {
    const strong = entry({ email: "zzz-strong", rating: 300, memoryKb: 9999, runtimeMs: 999 });
    const weak = entry({ email: "aaa-weak", rating: 100, memoryKb: 128, runtimeMs: 1 });

    expect(rankedEmails([weak, strong])).toEqual(["zzz-strong", "aaa-weak"]);
  });

  it("still ranks by accuracy before efficiency", () => {
    const accurate = entry({ email: "zzz-accurate", accuracy: 90, memoryKb: 8192 });
    const sloppy = entry({ email: "aaa-sloppy", accuracy: 40, memoryKb: 128 });

    expect(rankedEmails([sloppy, accurate])).toEqual(["zzz-accurate", "aaa-sloppy"]);
  });

  it("breaks equal rating and accuracy on memory efficiency", () => {
    // Names oppose the expected order, so the final email tiebreak cannot produce this result
    // by accident — only the optimization step can.
    const lean = entry({ email: "zzz-lean", memoryKb: 256 });
    const heavy = entry({ email: "aaa-heavy", memoryKb: 8192 });

    expect(rankedEmails([heavy, lean])).toEqual(["zzz-lean", "aaa-heavy"]);
  });

  it("falls through to average runtime when memory also ties", () => {
    const quick = entry({ email: "zzz-quick", memoryKb: 1024, runtimeMs: 5 });
    const slow = entry({ email: "aaa-slow", memoryKb: 1024, runtimeMs: 500 });

    expect(rankedEmails([slow, quick])).toEqual(["zzz-quick", "aaa-slow"]);
  });

  it("sorts a student with no measured code after one who has some", () => {
    const measured = entry({ email: "zzz-measured", memoryKb: 4096, runtimeMs: 90 });
    const unmeasured = entry({ email: "aaa-unmeasured", memoryKb: 0, runtimeMs: 0 });

    expect(rankedEmails([unmeasured, measured])).toEqual(["zzz-measured", "aaa-unmeasured"]);
  });

  it("keeps the old order when nobody in the field has efficiency data yet", () => {
    // The state right after deploy and before the backfill runs: everything must still rank
    // exactly as it did before, by problems solved then email.
    const many = entry({ email: "bbb", memoryKb: 0, runtimeMs: 0, problemsSolved: 9 });
    const few = entry({ email: "aaa", memoryKb: 0, runtimeMs: 0, problemsSolved: 2 });

    expect(rankedEmails([few, many])).toEqual(["bbb", "aaa"]);
  });

  it("reports no optimization score when nobody has measured code", () => {
    const entries = [entry({ email: "a", memoryKb: 0 })];
    expect(buildLeaderboardRanker(entries).optimizationScoreFor(entries[0])).toBeNull();
  });
});

function submission(overrides: Partial<SubmissionRecord>): SubmissionRecord {
  return {
    id: "sub_1",
    queueJobId: null,
    judge0Token: null,
    sourceType: "problem",
    userEmail: "student@tcetmumbai.in",
    userRole: "STUDENT",
    userDepartment: null,
    resourceOwnerEmail: "faculty@tcetmumbai.in",
    resourceTargetDepartment: null,
    problemId: "problem_1",
    problemTitleSnapshot: "Problem",
    problemDifficultySnapshot: "Easy",
    contestId: null,
    contestTitleSnapshot: null,
    contestQuestionId: null,
    classTestId: null,
    classTestQuestionId: null,
    code: "x",
    language: "cpp",
    status: "ACCEPTED",
    runtimeMs: 10,
    memoryKb: 1024,
    passedCount: 1,
    totalCount: 1,
    executionProvider: "stub",
    ratingAwarded: 0,
    stdout: null,
    stderr: null,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    judgedAt: new Date("2026-05-01T00:00:00.000Z"),
    finalizationAppliedAt: null,
    ...overrides,
  };
}

describe("user efficiency aggregates", () => {
  it("averages over the first accepted submission per problem", () => {
    const aggregates = calculateUserAggregateSnapshot([
      submission({ id: "a", problemId: "p1", runtimeMs: 10, memoryKb: 1000 }),
      submission({ id: "b", problemId: "p2", runtimeMs: 30, memoryKb: 3000 }),
    ]);

    expect(aggregates.avgAcceptedRuntimeMs).toBe(20);
    expect(aggregates.avgAcceptedMemoryKb).toBe(2000);
  });

  it("ignores a later, sloppier re-solve of the same problem", () => {
    const aggregates = calculateUserAggregateSnapshot([
      submission({ id: "first", problemId: "p1", runtimeMs: 10, memoryKb: 1000 }),
      submission({
        id: "later",
        problemId: "p1",
        runtimeMs: 900,
        memoryKb: 90_000,
        createdAt: new Date("2026-05-02T00:00:00.000Z"),
      }),
    ]);

    // Only the first accepted solve counts, matching how `rating` is computed.
    expect(aggregates.avgAcceptedRuntimeMs).toBe(10);
    expect(aggregates.avgAcceptedMemoryKb).toBe(1000);
  });

  it("ignores rejected submissions", () => {
    const aggregates = calculateUserAggregateSnapshot([
      submission({ id: "ok", problemId: "p1", runtimeMs: 10, memoryKb: 1000 }),
      submission({ id: "bad", problemId: "p2", status: "WRONG_ANSWER", runtimeMs: 999, memoryKb: 99_000 }),
    ]);

    expect(aggregates.avgAcceptedRuntimeMs).toBe(10);
    expect(aggregates.avgAcceptedMemoryKb).toBe(1000);
  });

  it("ignores contest and class-test code, which is not practice", () => {
    const aggregates = calculateUserAggregateSnapshot([
      submission({ id: "practice", problemId: "p1", runtimeMs: 10, memoryKb: 1000 }),
      submission({ id: "contest", problemId: "p2", sourceType: "contest_coding", runtimeMs: 800, memoryKb: 80_000 }),
      submission({ id: "ct", problemId: "p3", sourceType: "classtest_coding", runtimeMs: 800, memoryKb: 80_000 }),
    ]);

    expect(aggregates.avgAcceptedRuntimeMs).toBe(10);
    expect(aggregates.avgAcceptedMemoryKb).toBe(1000);
  });

  it("reports zero rather than NaN for a student who has solved nothing", () => {
    const aggregates = calculateUserAggregateSnapshot([]);
    expect(aggregates.avgAcceptedRuntimeMs).toBe(0);
    expect(aggregates.avgAcceptedMemoryKb).toBe(0);
  });
});

describe("efficiency reaches the collection the board actually reads", () => {
  /**
   * The leaderboard reads a separate `leaderboard` collection, not `users`. Writing only the
   * user record leaves the board showing stale rows — which is exactly what an earlier version
   * of the backfill script did, and why this test exists.
   */
  it("writes efficiency to the leaderboard entry, not just the user record", async () => {
    const userRepository = new InMemoryUserRepository();
    const submissionRepository = new InMemorySubmissionRepository();
    const leaderboardRepository = new InMemoryLeaderboardRepository();
    const email = "student@tcetmumbai.in";

    await userRepository.save({
      email,
      role: "STUDENT",
      name: "Student",
      uid: "24-AIDSA11-28",
      isProfileComplete: true,
      designation: null,
      isHod: false,
      rollNumber: "11",
      department: "B.Tech – Artificial Intelligence & Data Science",
      semester: 3,
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
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      lastLoginAt: null,
      lastAcceptedAt: null,
    } as UserRecord);

    await submissionRepository.create(
      submission({ id: "s1", userEmail: email, problemId: "p1", runtimeMs: 42, memoryKb: 2048 }),
    );

    await syncUserAndLeaderboard(
      { userRepository, submissionRepository, leaderboardRepository } as unknown as Parameters<
        typeof syncUserAndLeaderboard
      >[0],
      email,
      new Date("2026-05-07T00:00:00.000Z"),
    );

    const user = await userRepository.getByEmail(email);
    expect(user?.avgAcceptedRuntimeMs).toBe(42);
    expect(user?.avgAcceptedMemoryKb).toBe(2048);

    // The part that was broken: the board's own data source must carry it too.
    const entry = await leaderboardRepository.getByEmail(email);
    expect(entry?.avgAcceptedRuntimeMs).toBe(42);
    expect(entry?.avgAcceptedMemoryKb).toBe(2048);
  });
});
