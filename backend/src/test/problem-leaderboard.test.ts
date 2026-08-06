import { describe, expect, it } from "vitest";

import {
  buildProblemLeaderboard,
  buildProblemLeaderboardPodium,
} from "../modules/problem/problem-leaderboard.model";
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

  it("builds overall and per-language podiums from the ranked field", () => {
    const rows = buildProblemLeaderboard(
      [
        accepted({ email: "cpp-fast@x.in", runtimeMs: 10, memoryKb: 1024, language: "cpp" }),
        accepted({ email: "cpp-slow@x.in", runtimeMs: 50, memoryKb: 4096, language: "cpp" }),
        accepted({ email: "py-fast@x.in", runtimeMs: 300, memoryKb: 4096, language: "python" }),
        accepted({ email: "py-slow@x.in", runtimeMs: 900, memoryKb: 9000, language: "python" }),
      ],
      { currentUserEmail: "cpp-fast@x.in", userSnapshots: noSnapshots },
    );

    const podium = buildProblemLeaderboardPodium(rows);
    expect(podium.overall).toEqual(rows.slice(0, 3));
    expect(podium.byLanguage.map((row) => row.language)).toEqual(["cpp", "python"]);
    expect(podium.byLanguage.map((row) => row.userEmail)).toEqual(["cpp-fast@x.in", "py-fast@x.in"]);
  });
});

describe("submission distribution stats", () => {
  const field = [
    ...Array.from({ length: 5 }, (_, index) =>
      accepted({ email: `peer${index}@x.in`, runtimeMs: 100 + index * 10, memoryKb: 2048 }),
    ),
  ];

  it("reports language-normalized efficiency for the complete accepted field", () => {
    const mine = accepted({ email: "me@x.in", runtimeMs: 10, memoryKb: 1024 });
    const stats = buildSubmissionStats(mine, [...field, mine]);

    expect(stats.efficiency.beatsPercent).toBe(100);
    expect(stats.runtime.percentile).toBe(100);
    expect(stats.memory.percentile).toBe(100);
    expect(stats.runtime.rawValue).toBe(10);
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

  it("marks exactly one normalized efficiency bucket as the student's own", () => {
    const mine = accepted({ email: "me@x.in", runtimeMs: 100, memoryKb: 2048 });
    const stats = buildSubmissionStats(mine, [...field, mine]);

    expect(stats.efficiency.distribution.buckets.filter((bucket) => bucket.isYours)).toHaveLength(1);
    expect(stats.efficiency.distribution.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(
      stats.sampleSize,
    );
  });

  it("gives equal normalized scores an even overall percentile", () => {
    const tied = Array.from({ length: 5 }, (_, index) =>
      accepted({ email: `tie${index}@x.in`, runtimeMs: 50, memoryKb: 2048 }),
    );

    const stats = buildSubmissionStats(tied[0], tied);

    expect(stats.efficiency.distribution.buckets).toHaveLength(10);
    expect(stats.efficiency.distribution.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(5);
    expect(stats.efficiency.beatsPercent).toBe(50);
  });

  it("includes the selected accepted resubmission and never exceeds 100 percent", () => {
    const earlierBest = accepted({ email: "me@x.in", runtimeMs: 10, memoryKb: 1024, id: "best" });
    const peer = accepted({ email: "peer@x.in", runtimeMs: 40, memoryKb: 4096, id: "peer" });
    const selectedLater = accepted({ email: "me@x.in", runtimeMs: 20, memoryKb: 2048, id: "later" });
    const stats = buildSubmissionStats(selectedLater, [earlierBest, peer]);

    expect(stats.sampleSize).toBe(3);
    expect(stats.efficiency.beatsPercent).toBeGreaterThanOrEqual(0);
    expect(stats.efficiency.beatsPercent).toBeLessThanOrEqual(100);
    expect(stats.efficiency.distribution.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(3);
  });
});
