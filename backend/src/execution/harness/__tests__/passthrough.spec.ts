import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HARNESS_SCHEMA_VERSION, type HarnessSpec } from "../contract";
import { compareOutput, generateSubmissionProgram, submissionUsesOwnProgram } from "../index";
import { ensureHarnessRegistered } from "../register";
import { E2E_SUITE_TIMEOUT_MS } from "./e2e-timeout";

ensureHarnessRegistered();

const twoSum: HarnessSpec = {
  schemaVersion: HARNESS_SCHEMA_VERSION,
  entryMethod: "twoSum",
  parameters: [
    { name: "nums", type: { base: "int[]" } },
    { name: "target", type: { base: "int" } },
  ],
  returnType: { base: "int[]" },
};

describe("passthrough detection", () => {
  it("detects own entry points per language", () => {
    expect(submissionUsesOwnProgram("python", 'if __name__ == "__main__":\n    pass')).toBe(true);
    expect(submissionUsesOwnProgram("java", "public class Main { public static void main(String[] a){} }")).toBe(true);
    expect(submissionUsesOwnProgram("cpp", "int main(){ return 0; }")).toBe(true);
    expect(submissionUsesOwnProgram("go", "func main() {}")).toBe(true);
    expect(submissionUsesOwnProgram("python", "class Solution:\n    def twoSum(self, nums, target): return []")).toBe(false);
  });

  it("skeleton submissions go through the harness (EXACT); full programs passthrough (LENIENT)", () => {
    const skeleton = generateSubmissionProgram("python", "class Solution:\n    def twoSum(self, nums, target): return []", twoSum);
    expect(skeleton.comparison).toEqual({ mode: "EXACT" });

    const full = generateSubmissionProgram("python", 'import sys, json\nif __name__ == "__main__":\n    print("0 1")', twoSum);
    expect(full.comparison).toEqual({ mode: "LENIENT" });
    // passthrough runs the program as-is (no injected Solution() call)
    expect(full.source).not.toContain("Solution().twoSum");
  });
});

describe("lenient comparison lets correct logic pass regardless of formatting", () => {
  it("treats different formats as equal", () => {
    const L = { mode: "LENIENT" as const };
    expect(compareOutput(L, "[0,1]", "0 1")).toBe(true);
    expect(compareOutput(L, "[1,3,2]", "1 3 2")).toBe(true);
    expect(compareOutput(L, "[0, 1]", "[0,1]")).toBe(true);
    expect(compareOutput(L, "true", "True")).toBe(true); // Python bool
    expect(compareOutput(L, "2.5", "2.50")).toBe(true);
    expect(compareOutput(L, '"blue is sky the"', "blue is sky the")).toBe(true);
    // genuinely different answers still fail
    expect(compareOutput(L, "[0,1]", "1 0")).toBe(false);
    expect(compareOutput(L, "[0,1]", "0 1 2")).toBe(false);
  });
});

describe("end-to-end: full program reading JSON input passes via passthrough+lenient", { timeout: E2E_SUITE_TIMEOUT_MS }, () => {
  let py = true;
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
  } catch {
    py = false;
  }

  it.skipIf(!py)("student wrote their own stdin program, prints '0 1', still accepted", () => {
    // A full program: reads the canonical JSON input, prints the answer space-separated.
    const userProgram = [
      "import sys, json",
      "if __name__ == '__main__':",
      "    lines = sys.stdin.read().split('\\n')",
      "    nums = json.loads(lines[0]); target = int(lines[1])",
      "    seen = {}",
      "    for i, x in enumerate(nums):",
      "        if target - x in seen:",
      "            print(seen[target - x], i); break",
      "        seen[x] = i",
    ].join("\n");
    const { source, comparison } = generateSubmissionProgram("python", userProgram, twoSum);
    expect(comparison).toEqual({ mode: "LENIENT" });

    const dir = mkdtempSync(join(tmpdir(), "pass-"));
    const f = join(dir, "s.py");
    writeFileSync(f, source, "utf8");
    const stdout = execFileSync("python3", [f], { input: "[2,7,11,15]\n9", encoding: "utf8" });
    // program prints "0 1"; expected canonical is "[0,1]" — lenient accepts it.
    expect(stdout.trim()).toBe("0 1");
    expect(compareOutput(comparison, "[0,1]", stdout)).toBe(true);
  });
});
