import { describe, expect, it } from "vitest";

import { formatDuration } from "./duration";

describe("formatDuration", () => {
  it("keeps seconds for sub-minute solves so a fast submission stays distinguishable", () => {
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(1_000)).toBe("1s");
  });

  it("shows minutes and seconds for a normal attempt", () => {
    expect(formatDuration(847_000)).toBe("14m 7s");
  });

  it("drops to hours and minutes for long attempts", () => {
    expect(formatDuration(3_780_000)).toBe("1h 3m");
  });

  it("rounds up, so any elapsed time reads as at least one second", () => {
    expect(formatDuration(1)).toBe("1s");
    expect(formatDuration(0)).toBe("0s");
  });

  it("renders a dash rather than NaN when the value is missing", () => {
    expect(formatDuration(null)).toBe("-");
    expect(formatDuration(undefined)).toBe("-");
    expect(formatDuration(Number.NaN)).toBe("-");
  });
});
