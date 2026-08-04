import { describe, expect, it } from "vitest";

import { buildProblemLeaderboard } from "../modules/problem/problem-leaderboard.model";
import { buildSubmissionStats } from "../modules/submission/submission-stats.model";
import type { SubmissionAnalyticsRecord } from "../modules/submission/submission.repository";
import type { ExecutableLanguage } from "../shared/types/domain";

interface AcceptedSpec {
  email: string;
  runtimeMs: number;
  memoryKb: number;
  language?: ExecutableLanguage;
  id?: string;
  judgedAtMinute?: number;
}

function accepted(spec: AcceptedSpec): SubmissionAnalyticsRecord {
  const judgedAt = new Date(Date.UTC(2026, 4, 12, 0, spec.judgedAtMinute ?? 0, 0));

  return {
    id: spec.id ?? `sub_${spec.email}`,
    queueJobId: null,
    judge0Token: null,
    sourceType: "problem",
    userEmail: spec.email,
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
    language: spec.language ?? "cpp",
    status: "ACCEPTED",
    runtimeMs: spec.runtimeMs,
    memoryKb: spec.memoryKb,
    passedCount: 10,
    totalCount: 10,
    executionProvider: "judge0",
    ratingAwarded: 0,
    createdAt: judgedAt,
    updatedAt: judgedAt,
    judgedAt,
    finalizationAppliedAt: judgedAt,
  };
}

const noSnapshots = new Map<string, { name: string | null; uid: string | null }>();

describe("per-problem submission leaderboard", () => {
  it("keeps only each student's best submission", () => {
    const rows = buildProblemLeaderboard(
      [
        accepted({ email: "a@x.in", runtimeMs: 90, memoryKb: 4096, id: "slow" }),
        accepted({ email: "a@x.in", runtimeMs: 10, memoryKb: 1024, id: "fast" }),
        accepted({ email: "b@x.in", runtimeMs: 50, memoryKb: 2048, id: "other" }),
      ],
      { currentUserEmail: "a@x.in", userSnapshots: noSnapshots },
    );

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.userEmail === "a@x.in")?.submissionId).toBe("fast");
  });

  it("ranks the most optimized submission first", () => {
    const rows = buildProblemLeaderboard(
      [
        accepted({ email: "slow@x.in", runtimeMs: 200, memoryKb: 8192 }),
        accepted({ email: "fast@x.in", runtimeMs: 10, memoryKb: 1024 }),
        accepted({ email: "mid@x.in", runtimeMs: 90, memoryKb: 4096 }),
      ],
      { currentUserEmail: "mid@x.in", userSnapshots: noSnapshots },
    );

    expect(rows.map((row) => row.userEmail)).toEqual(["fast@x.in", "mid@x.in", "slow@x.in"]);
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3]);
  });

  it("does not bury a language behind a faster one", () => {
    // Five Python solvers so their bucket is trusted on its own. The best Python solver is
    // slower than every C++ solver in raw milliseconds but should still rank at the top.
    const cpp = Array.from({ length: 5 }, (_, index) =>
      accepted({ email: `cpp${index}@x.in`, runtimeMs: 10, memoryKb: 1024 }),
    );
    const pythonPeers = Array.from({ length: 4 }, (_, index) =>
      accepted({ email: `py${index}@x.in`, runtimeMs: 800, memoryKb: 9000, language: "python" }),
    );
    const pythonBest = accepted({
      email: "pybest@x.in",
      runtimeMs: 300,
      memoryKb: 4000,
      language: "python",
    });

    const rows = buildProblemLeaderboard([...cpp, ...pythonPeers, pythonBest], {
      currentUserEmail: "pybest@x.in",
      userSnapshots: noSnapshots,
    });

    expect(rows[0].userEmail).toBe("pybest@x.in");
    expect(rows[0].optimizationScore).toBe(1);
  });

  it("flags the requesting student's own row", () => {
    const rows = buildProblemLeaderboard(
      [
        accepted({ email: "me@x.in", runtimeMs: 10, memoryKb: 1024 }),
        accepted({ email: "them@x.in", runtimeMs: 20, memoryKb: 2048 }),
      ],
      { currentUserEmail: "ME@x.in", userSnapshots: noSnapshots },
    );

    expect(rows.filter((row) => row.isCurrentUser).map((row) => row.userEmail)).toEqual(["me@x.in"]);
  });

  it("never carries source code on a row", () => {
    const rows = buildProblemLeaderboard([accepted({ email: "a@x.in", runtimeMs: 10, memoryKb: 1024 })], {
      currentUserEmail: "a@x.in",
      userSnapshots: noSnapshots,
    });

    expect(rows[0]).not.toHaveProperty("code");
  });
});

describe("submission distribution stats", () => {
  const field = [
    ...Array.from({ length: 5 }, (_, index) =>
      accepted({ email: `peer${index}@x.in`, runtimeMs: 100 + index * 10, memoryKb: 2048 }),
    ),
  ];

  it("reports the share of the field a submission beat", () => {
    const mine = accepted({ email: "me@x.in", runtimeMs: 10, memoryKb: 1024 });
    const stats = buildSubmissionStats(mine, [...field, mine]);

    expect(stats.runtime.beatsPercent).toBe(100);
    expect(stats.runtime.yourValue).toBe(10);
    expect(stats.confidence).toBe("high");
    expect(stats.basis).toContain("cpp");
  });

  it("marks a thin language sample as low confidence and says so in the basis", () => {
    const mine = accepted({ email: "me@x.in", runtimeMs: 300, memoryKb: 4096, language: "rust" });
    const stats = buildSubmissionStats(mine, [...field, mine]);

    expect(stats.confidence).toBe("low");
    expect(stats.basis).toContain("all languages");
    expect(stats.basis).toContain("too few rust");
  });

  it("marks exactly one bucket as the student's own", () => {
    const mine = accepted({ email: "me@x.in", runtimeMs: 100, memoryKb: 2048 });
    const stats = buildSubmissionStats(mine, [...field, mine]);

    expect(stats.runtime.buckets.filter((bucket) => bucket.isYours)).toHaveLength(1);
    expect(stats.runtime.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(
      stats.sampleSize,
    );
  });

  it("collapses to a single bucket when everyone scored identically", () => {
    const tied = Array.from({ length: 5 }, (_, index) =>
      accepted({ email: `tie${index}@x.in`, runtimeMs: 50, memoryKb: 2048 }),
    );

    const stats = buildSubmissionStats(tied[0], tied);

    expect(stats.runtime.buckets).toHaveLength(1);
    expect(stats.runtime.buckets[0].count).toBe(5);
    // Nobody had an edge, so nobody beat anybody.
    expect(stats.runtime.beatsPercent).toBe(50);
  });
});
