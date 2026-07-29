import { describe, expect, it } from "vitest";
import {
  classifyActivityLevel,
  computeConsistency,
  computeCurrentStreak,
  computeLongestStreak,
  estimateActiveMinutes,
  toWeekKey,
} from "./activity";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("streaks", () => {
  it("counts the longest run of consecutive days", () => {
    expect(computeLongestStreak(["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-08"])).toBe(3);
  });

  it("treats a single active day as a streak of one", () => {
    expect(computeLongestStreak(["2026-05-01"])).toBe(1);
  });

  it("returns zero when there is no activity", () => {
    expect(computeLongestStreak([])).toBe(0);
    expect(computeCurrentStreak([], day("2026-05-07"))).toBe(0);
  });

  it("keeps a streak alive when the student has not submitted yet today", () => {
    // Active through yesterday: the day is not over, so the streak should not be broken.
    expect(computeCurrentStreak(["2026-05-05", "2026-05-06"], day("2026-05-07"))).toBe(2);
  });

  it("breaks a streak once a full day has been missed", () => {
    expect(computeCurrentStreak(["2026-05-04", "2026-05-05"], day("2026-05-07"))).toBe(0);
  });
});

describe("activity levels", () => {
  it("classifies by share of the window, not raw counts", () => {
    expect(classifyActivityLevel(0, 100)).toBe("Inactive");
    expect(classifyActivityLevel(10, 100)).toBe("Low");
    expect(classifyActivityLevel(40, 100)).toBe("Moderate");
    expect(classifyActivityLevel(80, 100)).toBe("High");
  });

  it("never divides by zero", () => {
    expect(classifyActivityLevel(5, 0)).toBe("Inactive");
  });
});

describe("consistency", () => {
  it("scores steady work above an equal-volume burst", () => {
    const from = day("2026-04-08");
    const to = day("2026-05-07");

    // Four days spread across four separate weeks.
    const spread = computeConsistency(
      ["2026-04-10", "2026-04-17", "2026-04-24", "2026-05-01"],
      from,
      to,
    );
    // The same four days, all inside one week.
    const burst = computeConsistency(
      ["2026-04-20", "2026-04-21", "2026-04-22", "2026-04-23"],
      from,
      to,
    );

    expect(spread.activeDays).toBe(burst.activeDays);
    expect(spread.weeksWithActivity).toBeGreaterThan(burst.weeksWithActivity);
    expect(spread.consistencyScore).toBeGreaterThan(burst.consistencyScore);
  });

  it("returns zeros rather than NaN for a student with no activity", () => {
    const consistency = computeConsistency([], day("2026-04-08"), day("2026-05-07"));
    expect(consistency.consistencyScore).toBe(0);
    expect(consistency.activeDayRatio).toBe(0);
    expect(consistency.weeklyRegularity).toBe(0);
    expect(Number.isNaN(consistency.consistencyScore)).toBe(false);
  });

  it("groups days into the same ISO week", () => {
    // Monday to Sunday of the same ISO week.
    expect(toWeekKey("2026-04-20")).toBe(toWeekKey("2026-04-26"));
    expect(toWeekKey("2026-04-20")).not.toBe(toWeekKey("2026-04-27"));
  });
});

describe("estimated active time", () => {
  it("returns zero when there is no activity", () => {
    expect(estimateActiveMinutes([]).totalMinutes).toBe(0);
  });

  it("gives a single submission the tail allowance rather than zero minutes", () => {
    expect(estimateActiveMinutes([new Date("2026-05-07T10:00:00.000Z")]).totalMinutes).toBe(5);
  });

  it("treats submissions inside the gap as one sitting", () => {
    const result = estimateActiveMinutes([
      new Date("2026-05-07T10:00:00.000Z"),
      new Date("2026-05-07T10:20:00.000Z"),
      new Date("2026-05-07T10:40:00.000Z"),
    ]);
    // 40 minutes of span plus one 5-minute tail.
    expect(result.totalMinutes).toBe(45);
    expect(result.byDate).toHaveLength(1);
  });

  it("splits sittings separated by more than the gap", () => {
    const result = estimateActiveMinutes([
      new Date("2026-05-07T10:00:00.000Z"),
      new Date("2026-05-07T10:10:00.000Z"),
      // Two hours later: a separate sitting.
      new Date("2026-05-07T12:10:00.000Z"),
      new Date("2026-05-07T12:20:00.000Z"),
    ]);
    // Two sittings of 10 minutes, each with a 5-minute tail.
    expect(result.totalMinutes).toBe(30);
  });

  it("is order-independent", () => {
    const timestamps = [
      new Date("2026-05-07T10:40:00.000Z"),
      new Date("2026-05-07T10:00:00.000Z"),
      new Date("2026-05-07T10:20:00.000Z"),
    ];
    expect(estimateActiveMinutes(timestamps).totalMinutes).toBe(45);
  });
});
