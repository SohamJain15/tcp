import { describe, expect, it } from "vitest";

import { isAttendanceSessionLive } from "./lab-attendance";

const NOW = new Date("2026-09-06T10:00:00.000Z");

function session(state: "OPEN" | "CLOSED", expiresAt: string) {
  return { state, expiresAt };
}

describe("isAttendanceSessionLive", () => {
  it("is live while open and inside its window", () => {
    expect(isAttendanceSessionLive(session("OPEN", "2026-09-06T12:00:00.000Z"), NOW)).toBe(true);
  });

  it("is not live once the teacher ends it", () => {
    expect(isAttendanceSessionLive(session("CLOSED", "2026-09-06T12:00:00.000Z"), NOW)).toBe(false);
  });

  it("is not live once it has expired, even though state is still OPEN", () => {
    // The hard stop is `expiresAt`; nothing writes CLOSED back to the record when it passes. Reading
    // `state` alone would leave last week's lab showing as live on the teacher's console forever.
    expect(isAttendanceSessionLive(session("OPEN", "2026-09-06T09:00:00.000Z"), NOW)).toBe(false);
  });

  it("is not live at the exact expiry instant", () => {
    expect(isAttendanceSessionLive(session("OPEN", NOW.toISOString()), NOW)).toBe(false);
  });
});
