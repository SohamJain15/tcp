import { describe, expect, it } from "vitest";

import { EXECUTABLE_LANGUAGES, normalizeLanguage, toStatusLabel } from "@/api/mappers";

describe("api mappers", () => {
  it("normalizes language aliases", () => {
    expect(normalizeLanguage("C++")).toBe("cpp");
    expect(normalizeLanguage("py")).toBe("python");
    expect(normalizeLanguage("react.js")).toBe("react");
  });

  it("maps canonical statuses to UI labels", () => {
    expect(toStatusLabel("ACCEPTED")).toBe("Accepted");
    expect(toStatusLabel("WRONG_ANSWER")).toBe("Wrong Answer");
  });

  it("keeps executable languages free of editor-only languages", () => {
    expect(EXECUTABLE_LANGUAGES).not.toContain("react");
    expect(EXECUTABLE_LANGUAGES).toContain("cpp");
  });
});
