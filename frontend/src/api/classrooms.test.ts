import { describe, expect, it } from "vitest";
import { averageMarks, istInput, istToUtc } from "./classrooms";
describe("classroom gradebook and scheduling", () => {
  it("includes zero and excludes ungraded cells", () => {
    expect(averageMarks([null, null])).toBeNull();
    expect(averageMarks([0, null, 100])).toBe(50);
    expect(averageMarks([85, 90, 90])).toBe(88.33);
  });
  it("converts India time independently of the browser timezone", () => {
    expect(istToUtc("2026-09-08T10:00")).toBe("2026-09-08T04:30:00.000Z");
    expect(istInput("2026-09-08T04:30:00.000Z")).toBe("2026-09-08T10:00");
  });
});
