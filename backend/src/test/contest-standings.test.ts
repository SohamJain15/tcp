import { describe, expect, it } from "vitest";

import {
  buildStandingsRanker,
  computeAttemptEfficiency,
  type ContestAttemptRecord,
} from "../modules/contest/contest.model";

/**
 * Ranking order had no test coverage at all before this file — the existing standings tests
 * assert HTTP status and payload shape only, so the formula could have been broken silently.
 *
 * These exercise the comparator directly rather than through HTTP: it is a pure function, and
 * driving it end to end would bury which criterion actually decided each ordering.
 */

const BASE = new Date("2026-05-07T10:00:00.000Z");

interface AttemptSpec {
  id: string;
  score: number;
  /** Minutes from start to submit. */
  minutes?: number;
  memoryKb?: number;
  attempts?: number;
  runtimeMs?: number;
  violations?: number;
  /** Omit coding questions entirely, e.g. an MCQ-only contest. */
  coding?: boolean;
  startedOffsetMs?: number;
}

function attempt(spec: AttemptSpec): ContestAttemptRecord {
  const startedAt = new Date(BASE.getTime() + (spec.startedOffsetMs ?? 0));
  const minutes = spec.minutes ?? 30;
  const coding = spec.coding !== false;

  return {
    id: spec.id,
    contestId: "contest_1",
    contestTitleSnapshot: "Contest",
    userEmail: `${spec.id}@tcetmumbai.in`,
    userName: spec.id,
    userUid: spec.id,
    userDepartment: null,
    status: "SUBMITTED",
    score: spec.score,
    violationCount: spec.violations ?? 0,
    violationPenaltyPoints: (spec.violations ?? 0) * 5,
    timeTakenMs: minutes * 60_000,
    questionStates: [
      {
        questionId: "q_mcq",
        questionType: "MCQ",
        status: "SOLVED",
        attemptsCount: 1,
        awardedPoints: 10,
        submittedAnswer: "A",
        isCorrect: true,
        lastSubmissionId: null,
        passedCount: 0,
        totalCount: 0,
        hasFinalCodingSubmission: false,
        draftCode: null,
        draftLanguage: null,
        finalSubmissionLanguage: null,
        finalSubmissionStatus: null,
        finalRuntimeMs: 0,
        finalMemoryKb: 0,
        solvedAt: startedAt,
      },
      ...(coding
        ? [
            {
              questionId: "q_code",
              questionType: "Coding" as const,
              status: "SOLVED" as const,
              attemptsCount: spec.attempts ?? 1,
              awardedPoints: 100,
              submittedAnswer: null,
              isCorrect: null,
              lastSubmissionId: `sub_${spec.id}`,
              passedCount: 2,
              totalCount: 2,
              hasFinalCodingSubmission: true,
              draftCode: null,
              draftLanguage: null,
              finalSubmissionLanguage: "cpp" as const,
              finalSubmissionStatus: "ACCEPTED",
              finalRuntimeMs: spec.runtimeMs ?? 10,
              finalMemoryKb: spec.memoryKb ?? 1024,
              solvedAt: startedAt,
            },
          ]
        : []),
    ],
    startedAt,
    deadlineAt: new Date(startedAt.getTime() + 60 * 60_000),
    updatedAt: startedAt,
    submittedAt: new Date(startedAt.getTime() + minutes * 60_000),
    autoSubmittedAt: null,
    lastSolvedAt: null,
  };
}

function rankedIds(attempts: ContestAttemptRecord[]): string[] {
  const ranker = buildStandingsRanker(attempts);
  return [...attempts].sort(ranker.compare).map((entry) => entry.id);
}

describe("contest standings order", () => {
  it("puts the higher score first even when its code is worse on every other criterion", () => {
    const highScore = attempt({ id: "high", score: 100, minutes: 55, memoryKb: 9999, attempts: 9, runtimeMs: 900 });
    const efficient = attempt({ id: "efficient", score: 90, minutes: 5, memoryKb: 100, attempts: 1, runtimeMs: 5 });

    expect(rankedIds([efficient, highScore])).toEqual(["high", "efficient"]);
  });

  it("breaks an equal score on optimization — less memory and fewer submissions wins", () => {
    // Identical marks and identical time, so only the optimization step can separate them.
    // Names deliberately oppose the expected order: "aaa" would win the final id tiebreak, so
    // this can only pass if the optimization step actually fires.
    const lean = attempt({ id: "zzz-lean", score: 100, minutes: 30, memoryKb: 512, attempts: 1 });
    const wasteful = attempt({ id: "aaa-wasteful", score: 100, minutes: 30, memoryKb: 8192, attempts: 6 });

    expect(rankedIds([wasteful, lean])).toEqual(["zzz-lean", "aaa-wasteful"]);
  });

  it("falls through to time taken when score and optimization tie", () => {
    const fast = attempt({ id: "zzz-fast", score: 100, minutes: 12, memoryKb: 1024, attempts: 2 });
    const slow = attempt({ id: "aaa-slow", score: 100, minutes: 48, memoryKb: 1024, attempts: 2 });

    expect(rankedIds([slow, fast])).toEqual(["zzz-fast", "aaa-slow"]);
  });

  it("falls through to runtime when score, optimization and time all tie", () => {
    const quick = attempt({ id: "zzz-quick", score: 100, minutes: 30, memoryKb: 1024, attempts: 2, runtimeMs: 8 });
    const sluggish = attempt({ id: "aaa-sluggish", score: 100, minutes: 30, memoryKb: 1024, attempts: 2, runtimeMs: 400 });

    expect(rankedIds([sluggish, quick])).toEqual(["zzz-quick", "aaa-sluggish"]);
  });

  it("ranks an MCQ-only contest by score then time, exactly as it did before", () => {
    const slowHigh = attempt({ id: "aaa-slow-high", score: 100, minutes: 50, coding: false });
    const fastLow = attempt({ id: "mmm-fast-low", score: 90, minutes: 5, coding: false });
    const fastHigh = attempt({ id: "zzz-fast-high", score: 100, minutes: 10, coding: false });

    expect(rankedIds([slowHigh, fastLow, fastHigh])).toEqual([
      "zzz-fast-high",
      "aaa-slow-high",
      "mmm-fast-low",
    ]);
  });

  it("does not let violations reorder two attempts on equal marks", () => {
    // Violations already cost 5 marks each via the score. Ranking on them again would punish
    // the same conduct twice, so on equal marks the clean and flagged attempts are separated
    // only by the efficiency criteria — here, by time.
    const flaggedButFaster = attempt({ id: "flagged", score: 100, minutes: 10, violations: 2 });
    const cleanButSlower = attempt({ id: "clean", score: 100, minutes: 40, violations: 0 });

    expect(rankedIds([cleanButSlower, flaggedButFaster])).toEqual(["flagged", "clean"]);
  });

  it("stays deterministic when two attempts are identical on every criterion", () => {
    const a = attempt({ id: "aaa", score: 100 });
    const b = attempt({ id: "bbb", score: 100 });

    expect(rankedIds([b, a])).toEqual(["aaa", "bbb"]);
    expect(rankedIds([a, b])).toEqual(["aaa", "bbb"]);
  });

  it("sorts a never-submitted attempt last rather than first", () => {
    const submitted = attempt({ id: "submitted", score: 0 });
    const abandoned = { ...attempt({ id: "abandoned", score: 0 }), timeTakenMs: null };

    expect(rankedIds([abandoned, submitted])).toEqual(["submitted", "abandoned"]);
  });

  it("reports no optimization score when the contest has no coding questions", () => {
    const attempts = [attempt({ id: "one", score: 10, coding: false })];
    const ranker = buildStandingsRanker(attempts);

    // Null rather than 0, so the UI can hide the column instead of showing everyone a zero.
    expect(ranker.optimizationScoreFor(attempts[0])).toBeNull();
  });
});

describe("computeAttemptEfficiency", () => {
  it("counts solved coding questions only", () => {
    const solved = attempt({ id: "solved", score: 100, runtimeMs: 25, memoryKb: 2048, attempts: 3 });
    expect(computeAttemptEfficiency(solved)).toEqual({
      totalRuntimeMs: 25,
      totalMemoryKb: 2048,
      totalAttempts: 3,
      hasCodingData: true,
    });
  });

  it("ignores an unsolved coding question — a failed run is not a faster one", () => {
    const unsolved = attempt({ id: "unsolved", score: 10 });
    unsolved.questionStates[1].status = "ATTEMPTED";

    expect(computeAttemptEfficiency(unsolved)).toEqual({
      totalRuntimeMs: 0,
      totalMemoryKb: 0,
      totalAttempts: 0,
      hasCodingData: false,
    });
  });

  it("ignores MCQ questions, which carry no runtime", () => {
    expect(computeAttemptEfficiency(attempt({ id: "mcq", score: 10, coding: false }))).toEqual({
      totalRuntimeMs: 0,
      totalMemoryKb: 0,
      totalAttempts: 0,
      hasCodingData: false,
    });
  });
});
