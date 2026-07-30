import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { HARNESS_SCHEMA_VERSION, type HarnessSpec, type TypeRef } from "../contract";
import { generateSubmissionProgram } from "../index";
import { ensureHarnessRegistered } from "../register";

let cppOk = true;
try {
  execFileSync("g++", ["--version"], { stdio: "ignore" });
} catch {
  cppOk = false;
}

const t = (base: string, of?: TypeRef[]): TypeRef => ({ base, of });

function runCpp(spec: HarnessSpec, userSource: string, input: string): string {
  const dir = mkdtempSync(join(tmpdir(), "harness-cpp-"));
  const { source } = generateSubmissionProgram("cpp", userSource, spec);
  const src = join(dir, "main.cpp");
  const exe = join(dir, process.platform === "win32" ? "main.exe" : "main");
  writeFileSync(src, source, "utf8");
  execFileSync("g++", ["-std=c++17", "-O1", "-o", exe, src], { stdio: "pipe" });
  return execFileSync(exe, [], { input, encoding: "utf8" });
}

describe.skipIf(!cppOk)("C++ harness end-to-end", () => {
  beforeAll(() => ensureHarnessRegistered());

  it("twoSum(int[] nums, int target) -> int[]", { timeout: 30000 }, () => {
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
      "class Solution {",
      "public:",
      "    vector<int> twoSum(vector<int>& nums, int target) {",
      "        unordered_map<int,int> seen;",
      "        for (int i = 0; i < (int)nums.size(); i++) {",
      "            if (seen.count(target - nums[i])) return { seen[target - nums[i]], i };",
      "            seen[nums[i]] = i;",
      "        }",
      "        return {};",
      "    }",
      "};",
    ].join("\n");
    expect(runCpp(spec, user, "[2,7,11,15]\n9")).toBe("[0,1]");
    expect(runCpp(spec, user, "[3,2,4]\n6")).toBe("[1,2]");
  });

  it("inorderTraversal(TreeNode root) -> List<int>", { timeout: 30000 }, () => {
    const spec: HarnessSpec = {
      schemaVersion: HARNESS_SCHEMA_VERSION,
      entryMethod: "inorderTraversal",
      parameters: [{ name: "root", type: t("TreeNode") }],
      returnType: t("List", [t("int")]),
    };
    const user = [
      "class Solution {",
      "public:",
      "    vector<int> inorderTraversal(TreeNode* root) {",
      "        vector<int> out; dfs(root, out); return out;",
      "    }",
      "    void dfs(TreeNode* n, vector<int>& out) {",
      "        if (!n) return; dfs(n->left, out); out.push_back(n->val); dfs(n->right, out);",
      "    }",
      "};",
    ].join("\n");
    expect(runCpp(spec, user, "[1,null,2,3]")).toBe("[1,3,2]");
    expect(runCpp(spec, user, "[]")).toBe("[]");
  });

  it("reverseList(ListNode head) -> ListNode", { timeout: 30000 }, () => {
    const spec: HarnessSpec = {
      schemaVersion: HARNESS_SCHEMA_VERSION,
      entryMethod: "reverseList",
      parameters: [{ name: "head", type: t("ListNode") }],
      returnType: t("ListNode"),
    };
    const user = [
      "class Solution {",
      "public:",
      "    ListNode* reverseList(ListNode* head) {",
      "        ListNode* prev = nullptr;",
      "        while (head) { ListNode* nxt = head->next; head->next = prev; prev = head; head = nxt; }",
      "        return prev;",
      "    }",
      "};",
    ].join("\n");
    expect(runCpp(spec, user, "[1,2,3,4,5]")).toBe("[5,4,3,2,1]");
  });

  it("numIslands(char[][] grid) -> int", { timeout: 30000 }, () => {
    const spec: HarnessSpec = {
      schemaVersion: HARNESS_SCHEMA_VERSION,
      entryMethod: "numIslands",
      parameters: [{ name: "grid", type: t("char[][]") }],
      returnType: t("int"),
    };
    const user = [
      "class Solution {",
      "public:",
      "    int numIslands(vector<vector<char>>& grid) {",
      "        int n = grid.size(), m = n ? grid[0].size() : 0, cnt = 0;",
      "        for (int i = 0; i < n; i++) for (int j = 0; j < m; j++) if (grid[i][j] == '1') { cnt++; dfs(grid, i, j); }",
      "        return cnt;",
      "    }",
      "    void dfs(vector<vector<char>>& g, int i, int j) {",
      "        if (i < 0 || j < 0 || i >= (int)g.size() || j >= (int)g[0].size() || g[i][j] != '1') return;",
      "        g[i][j] = '0'; dfs(g,i+1,j); dfs(g,i-1,j); dfs(g,i,j+1); dfs(g,i,j-1);",
      "    }",
      "};",
    ].join("\n");
    expect(runCpp(spec, user, '[["1","1","0"],["1","0","0"],["0","0","1"]]')).toBe("2");
  });
});
