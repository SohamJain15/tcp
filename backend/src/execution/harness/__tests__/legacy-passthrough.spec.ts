import { describe, expect, it } from "vitest";
import { wrapSubmissionCode } from "../../code-wrapper";
import { generateSubmissionProgram, isDelegatedComparison } from "../index";

describe("generateSubmissionProgram (legacy passthrough)", () => {
  it("reproduces the existing wrapper byte-for-byte when no harness metadata is present", () => {
    const source = `class Solution {\npublic:\n    int solve() { return 1; }\n};\n`;
    const { source: generated, comparison } = generateSubmissionProgram("cpp", source);

    expect(generated).toBe(wrapSubmissionCode("cpp", source));
    expect(comparison).toEqual({ mode: "EXACT" });
    expect(isDelegatedComparison(comparison)).toBe(true);
  });

  it("leaves unwrapped languages untouched (same as today)", () => {
    const source = "package main\nfunc main() {}\n";
    const { source: generated } = generateSubmissionProgram("go", source);
    expect(generated).toBe(source);
  });
});
