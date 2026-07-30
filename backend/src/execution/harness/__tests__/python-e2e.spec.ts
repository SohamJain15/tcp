import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { HARNESS_SCHEMA_VERSION, type HarnessSpec } from "../contract";
import { generateSubmissionProgram } from "../index";
import { ensureHarnessRegistered } from "../register";

const PYTHON = process.env.PYTHON_BIN ?? "python3";

let pythonAvailable = true;
try {
  execFileSync(PYTHON, ["--version"], { stdio: "ignore" });
} catch {
  pythonAvailable = false;
}

const dir = mkdtempSync(join(tmpdir(), "harness-py-"));

function run(spec: HarnessSpec, userSource: string, input: string): string {
  const { source } = generateSubmissionProgram("python", userSource, spec);
  const file = join(dir, `sol_${Math.random().toString(36).slice(2)}.py`);
  writeFileSync(file, source, "utf8");
  return execFileSync(PYTHON, [file], { input, encoding: "utf8" });
}

const t = (base: string, of?: HarnessSpec["returnType"]["of"]) => ({ base, of });

describe.skipIf(!pythonAvailable)("Python harness end-to-end", () => {
  beforeAll(() => ensureHarnessRegistered());

  it("twoSum(int[] nums, int target) -> int[]", () => {
    const spec: HarnessSpec = {
      schemaVersion: HARNESS_SCHEMA_VERSION,
      entryMethod: "twoSum",
      parameters: [
        { name: "nums", type: t("int[]") },
        { name: "target", type: t("int") },
      ],
      returnType: t("int[]"),
    };
    const user = [
      "class Solution:",
      "    def twoSum(self, nums, target):",
      "        seen = {}",
      "        for i, x in enumerate(nums):",
      "            if target - x in seen:",
      "                return [seen[target - x], i]",
      "            seen[x] = i",
      "        return []",
    ].join("\n");
    expect(run(spec, user, "[2,7,11,15]\n9")).toBe("[0,1]");
    expect(run(spec, user, "[3,2,4]\n6")).toBe("[1,2]");
  });

  it("inorderTraversal(TreeNode root) -> List<int>", () => {
    const spec: HarnessSpec = {
      schemaVersion: HARNESS_SCHEMA_VERSION,
      entryMethod: "inorderTraversal",
      parameters: [{ name: "root", type: t("TreeNode") }],
      returnType: t("List", [t("int")]),
    };
    const user = [
      "class Solution:",
      "    def inorderTraversal(self, root):",
      "        out = []",
      "        def dfs(n):",
      "            if not n: return",
      "            dfs(n.left); out.append(n.val); dfs(n.right)",
      "        dfs(root)",
      "        return out",
    ].join("\n");
    expect(run(spec, user, "[1,null,2,3]")).toBe("[1,3,2]");
    expect(run(spec, user, "[]")).toBe("[]");
  });

  it("reverseList(ListNode head) -> ListNode", () => {
    const spec: HarnessSpec = {
      schemaVersion: HARNESS_SCHEMA_VERSION,
      entryMethod: "reverseList",
      parameters: [{ name: "head", type: t("ListNode") }],
      returnType: t("ListNode"),
    };
    const user = [
      "class Solution:",
      "    def reverseList(self, head):",
      "        prev = None",
      "        while head:",
      "            nxt = head.next; head.next = prev; prev = head; head = nxt",
      "        return prev",
    ].join("\n");
    expect(run(spec, user, "[1,2,3,4,5]")).toBe("[5,4,3,2,1]");
  });

  it("containsDuplicate(int[] nums) -> boolean", () => {
    const spec: HarnessSpec = {
      schemaVersion: HARNESS_SCHEMA_VERSION,
      entryMethod: "containsDuplicate",
      parameters: [{ name: "nums", type: t("int[]") }],
      returnType: t("boolean"),
    };
    const user = [
      "class Solution:",
      "    def containsDuplicate(self, nums):",
      "        return len(set(nums)) != len(nums)",
    ].join("\n");
    expect(run(spec, user, "[1,2,3,1]")).toBe("true");
    expect(run(spec, user, "[1,2,3,4]")).toBe("false");
  });

  it("rotate(int[] nums, int k) with MUTATION return channel", () => {
    const spec: HarnessSpec = {
      schemaVersion: HARNESS_SCHEMA_VERSION,
      entryMethod: "rotate",
      parameters: [
        { name: "nums", type: t("int[]") },
        { name: "k", type: t("int") },
      ],
      returnType: t("int[]"),
      returnChannel: { kind: "MUTATION", parameterIndex: 0 },
    };
    const user = [
      "class Solution:",
      "    def rotate(self, nums, k):",
      "        k %= len(nums)",
      "        nums[:] = nums[-k:] + nums[:-k] if k else nums[:]",
    ].join("\n");
    expect(run(spec, user, "[1,2,3,4,5,6,7]\n3")).toBe("[5,6,7,1,2,3,4]");
  });
});
