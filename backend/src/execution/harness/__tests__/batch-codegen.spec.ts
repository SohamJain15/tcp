import { beforeAll, describe, expect, it } from "vitest";
import { BATCH_CASE_SEPARATOR, HARNESS_SCHEMA_VERSION, type HarnessSpec } from "../contract";
import { generateSubmissionProgram } from "../index";
import { ensureHarnessRegistered } from "../register";

/**
 * Batch codegen contract, checked without a toolchain.
 *
 * The per-language e2e specs prove the generated programs actually run; this one pins the
 * parts the provider depends on — which languages opt in, that the separator is emitted, and
 * that asking for a batch never silently changes the single-case program.
 */

const spec: HarnessSpec = {
  schemaVersion: HARNESS_SCHEMA_VERSION,
  entryMethod: "twoSum",
  parameters: [
    { name: "nums", type: { base: "int[]" } },
    { name: "target", type: { base: "int" } },
  ],
  returnType: { base: "int[]" },
};

const SOURCES: Record<string, string> = {
  python: "class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]",
  cpp: "class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) { return {0,1}; }\n};",
  java: "class Solution {\n    public int[] twoSum(int[] nums, int target) { return new int[]{0,1}; }\n}",
};

const BATCH_LANGUAGES = ["python", "cpp", "java"] as const;

describe("batch codegen", () => {
  beforeAll(() => {
    ensureHarnessRegistered();
  });

  it.each(BATCH_LANGUAGES)("emits a batched program for %s", (language) => {
    const generated = generateSubmissionProgram(language, SOURCES[language], spec, { batch: true });

    expect(generated.batched).toBe(true);
    // The separator is what lets the provider split one run back into per-case results.
    expect(generated.source).toContain(BATCH_CASE_SEPARATOR);
    // Fixed-width framing: a case count is read, and each case offsets into the input lines.
    expect(generated.source).toContain("__t_base");
  });

  it.each(BATCH_LANGUAGES)("leaves the single-case program for %s untouched", (language) => {
    const generated = generateSubmissionProgram(language, SOURCES[language], spec);

    expect(generated.batched).toBe(false);
    expect(generated.source).not.toContain(BATCH_CASE_SEPARATOR);
    expect(generated.source).not.toContain("__t_base");
  });

  it("does not report batching for a language without batch support", () => {
    // Go has a harness adapter but no batch main yet, so the provider must keep using the
    // per-case path for it rather than sending batched stdin to a single-case program.
    // `batched` is optional, so "not batched" is any falsy value — that is the contract the
    // provider relies on when deciding whether to offer a batch program.
    const generated = generateSubmissionProgram(
      "go",
      "func twoSum(nums []int, target int) []int { return []int{0, 1} }",
      spec,
      { batch: true },
    );

    expect(generated.batched).toBeFalsy();
    expect(generated.source).not.toContain(BATCH_CASE_SEPARATOR);
  });

  it("never batches a passthrough submission", () => {
    // The student wrote their own full program and reads stdin their own way; batched stdin
    // would be meaningless to it.
    const generated = generateSubmissionProgram(
      "python",
      "if __name__ == '__main__':\n    print(input())",
      spec,
      { batch: true },
    );

    expect(generated.batched).toBeFalsy();
    expect(generated.source).not.toContain(BATCH_CASE_SEPARATOR);
  });
});
