import { describe, expect, it } from "vitest";

import {
  JOIN_CODE_STEP_MS,
  createJoinCodeSecret,
  currentJoinCode,
  joinCodeForStep,
  stepForTime,
  verifyJoinCode,
} from "./lab-join-code";

const SECRET = "a".repeat(64);
const OTHER_SECRET = "b".repeat(64);
const NOW = new Date("2026-09-05T09:30:00.000Z");

describe("lab join code", () => {
  it("derives a stable six-digit code for a step", () => {
    const code = joinCodeForStep(SECRET, 1_000);
    expect(code).toMatch(/^\d{6}$/);
    expect(joinCodeForStep(SECRET, 1_000)).toBe(code);
  });

  it("gives different sessions different codes for the same step", () => {
    expect(joinCodeForStep(SECRET, 1_000)).not.toBe(joinCodeForStep(OTHER_SECRET, 1_000));
  });

  it("rotates every 30 seconds", () => {
    const step = stepForTime(NOW);
    expect(stepForTime(new Date(NOW.getTime() + JOIN_CODE_STEP_MS))).toBe(step + 1);
    expect(joinCodeForStep(SECRET, step)).not.toBe(joinCodeForStep(SECRET, step + 1));
  });

  it("reports when the current code expires", () => {
    const { code, expiresAt, stepSeconds } = currentJoinCode(SECRET, NOW);
    expect(code).toBe(joinCodeForStep(SECRET, stepForTime(NOW)));
    expect(expiresAt.getTime()).toBe((stepForTime(NOW) + 1) * JOIN_CODE_STEP_MS);
    expect(stepSeconds).toBe(30);
  });

  it("accepts the current code", () => {
    expect(verifyJoinCode(SECRET, currentJoinCode(SECRET, NOW).code, NOW)).toBe(true);
  });

  it("accepts a code read off the board one step ago, and one step early", () => {
    const step = stepForTime(NOW);
    expect(verifyJoinCode(SECRET, joinCodeForStep(SECRET, step - 1), NOW)).toBe(true);
    expect(verifyJoinCode(SECRET, joinCodeForStep(SECRET, step + 1), NOW)).toBe(true);
  });

  it("rejects a code three steps stale", () => {
    const step = stepForTime(NOW);
    expect(verifyJoinCode(SECRET, joinCodeForStep(SECRET, step - 3), NOW)).toBe(false);
  });

  it("rejects a code minted with another session's secret", () => {
    expect(verifyJoinCode(SECRET, currentJoinCode(OTHER_SECRET, NOW).code, NOW)).toBe(false);
  });

  it("rejects malformed input without throwing", () => {
    for (const candidate of ["", "12345", "1234567", "abcdef", "12 345", null, undefined]) {
      expect(verifyJoinCode(SECRET, candidate, NOW)).toBe(false);
    }
  });

  it("tolerates surrounding whitespace from a paste", () => {
    expect(verifyJoinCode(SECRET, `  ${currentJoinCode(SECRET, NOW).code}  `, NOW)).toBe(true);
  });

  it("mints distinct secrets", () => {
    expect(createJoinCodeSecret()).not.toBe(createJoinCodeSecret());
    expect(createJoinCodeSecret()).toMatch(/^[0-9a-f]{64}$/);
  });
});
