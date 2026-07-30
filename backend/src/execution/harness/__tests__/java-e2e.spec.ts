import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { HARNESS_SCHEMA_VERSION, type HarnessSpec, type TypeRef } from "../contract";
import { generateSubmissionProgram } from "../index";
import { ensureHarnessRegistered } from "../register";

let javaOk = true;
try {
  execFileSync("javac", ["-version"], { stdio: "ignore" });
  execFileSync("java", ["-version"], { stdio: "ignore" });
} catch {
  javaOk = false;
}

const t = (base: string, of?: TypeRef[]): TypeRef => ({ base, of });

function runJava(spec: HarnessSpec, userSource: string, input: string): string {
  const dir = mkdtempSync(join(tmpdir(), "harness-java-"));
  const { source } = generateSubmissionProgram("java", userSource, spec);
  writeFileSync(join(dir, "Main.java"), source, "utf8");
  execFileSync("javac", ["Main.java"], { cwd: dir, stdio: "pipe" });
  return execFileSync("java", ["-cp", dir, "Main"], { input, encoding: "utf8" });
}

describe.skipIf(!javaOk)("Java harness end-to-end", () => {
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
      "import java.util.*;",
      "class Solution {",
      "    public int[] twoSum(int[] nums, int target) {",
      "        Map<Integer,Integer> seen = new HashMap<>();",
      "        for (int i = 0; i < nums.length; i++) {",
      "            if (seen.containsKey(target - nums[i])) return new int[]{ seen.get(target - nums[i]), i };",
      "            seen.put(nums[i], i);",
      "        }",
      "        return new int[]{};",
      "    }",
      "}",
    ].join("\n");
    expect(runJava(spec, user, "[2,7,11,15]\n9")).toBe("[0,1]");
    expect(runJava(spec, user, "[3,2,4]\n6")).toBe("[1,2]");
  });

  it("inorderTraversal(TreeNode root) -> List<Integer>", () => {
    const spec: HarnessSpec = {
      schemaVersion: HARNESS_SCHEMA_VERSION,
      entryMethod: "inorderTraversal",
      parameters: [{ name: "root", type: t("TreeNode") }],
      returnType: t("List", [t("int")]),
    };
    const user = [
      "import java.util.*;",
      "class Solution {",
      "    public List<Integer> inorderTraversal(TreeNode root) {",
      "        List<Integer> out = new ArrayList<>();",
      "        dfs(root, out); return out;",
      "    }",
      "    private void dfs(TreeNode n, List<Integer> out) {",
      "        if (n == null) return; dfs(n.left, out); out.add(n.val); dfs(n.right, out);",
      "    }",
      "}",
    ].join("\n");
    expect(runJava(spec, user, "[1,null,2,3]")).toBe("[1,3,2]");
    expect(runJava(spec, user, "[]")).toBe("[]");
  });

  it("invertTree(TreeNode root) -> TreeNode", () => {
    const spec: HarnessSpec = {
      schemaVersion: HARNESS_SCHEMA_VERSION,
      entryMethod: "invertTree",
      parameters: [{ name: "root", type: t("TreeNode") }],
      returnType: t("TreeNode"),
    };
    const user = [
      "class Solution {",
      "    public TreeNode invertTree(TreeNode root) {",
      "        if (root == null) return null;",
      "        TreeNode l = invertTree(root.left); TreeNode r = invertTree(root.right);",
      "        root.left = r; root.right = l; return root;",
      "    }",
      "}",
    ].join("\n");
    expect(runJava(spec, user, "[4,2,7,1,3,6,9]")).toBe("[4,7,2,9,6,3,1]");
  });

  it("containsDuplicate(int[] nums) -> boolean", () => {
    const spec: HarnessSpec = {
      schemaVersion: HARNESS_SCHEMA_VERSION,
      entryMethod: "containsDuplicate",
      parameters: [{ name: "nums", type: t("int[]") }],
      returnType: t("boolean"),
    };
    const user = [
      "import java.util.*;",
      "class Solution {",
      "    public boolean containsDuplicate(int[] nums) {",
      "        Set<Integer> s = new HashSet<>();",
      "        for (int x : nums) if (!s.add(x)) return true;",
      "        return false;",
      "    }",
      "}",
    ].join("\n");
    expect(runJava(spec, user, "[1,2,3,1]")).toBe("true");
    expect(runJava(spec, user, "[1,2,3,4]")).toBe("false");
  });
});
