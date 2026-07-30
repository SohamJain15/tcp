import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { HARNESS_SCHEMA_VERSION, type HarnessSpec, type TypeRef } from "../contract";
import { generateSubmissionProgram } from "../index";
import { ensureHarnessRegistered } from "../register";

let cOk = true;
try {
  execFileSync("gcc", ["--version"], { stdio: "ignore" });
} catch {
  cOk = false;
}

const t = (base: string, of?: TypeRef[]): TypeRef => ({ base, of });

function runC(spec: HarnessSpec, userSource: string, input: string): string {
  const dir = mkdtempSync(join(tmpdir(), "harness-c-"));
  const { source } = generateSubmissionProgram("c", userSource, spec);
  const src = join(dir, "main.c");
  const exe = join(dir, process.platform === "win32" ? "main.exe" : "main");
  writeFileSync(src, source, "utf8");
  execFileSync("gcc", ["-std=c11", "-o", exe, src], { stdio: "pipe" });
  return execFileSync(exe, [], { input, encoding: "utf8" });
}

describe.skipIf(!cOk)("C harness end-to-end (free-function convention)", () => {
  beforeAll(() => ensureHarnessRegistered());

  it("twoSum: int* twoSum(int* nums, int numsSize, int target, int* returnSize)", { timeout: 30000 }, () => {
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
      "int* twoSum(int* nums, int numsSize, int target, int* returnSize) {",
      "    for (int i = 0; i < numsSize; i++)",
      "        for (int j = i + 1; j < numsSize; j++)",
      "            if (nums[i] + nums[j] == target) { int* r = malloc(sizeof(int) * 2); r[0] = i; r[1] = j; *returnSize = 2; return r; }",
      "    *returnSize = 0; return NULL;",
      "}",
    ].join("\n");
    expect(runC(spec, user, "[2,7,11,15]\n9")).toBe("[0,1]");
    expect(runC(spec, user, "[3,2,4]\n6")).toBe("[1,2]");
  });

  it("numIslands: int numIslands(char** grid, int gridSize, int* gridColSize)", { timeout: 30000 }, () => {
    const spec: HarnessSpec = {
      schemaVersion: HARNESS_SCHEMA_VERSION,
      entryMethod: "numIslands",
      parameters: [{ name: "grid", type: t("char[][]") }],
      returnType: t("int"),
    };
    const user = [
      "void __dfs(char** g, int n, int* cs, int i, int j) {",
      "    if (i < 0 || j < 0 || i >= n || j >= cs[i] || g[i][j] != '1') return;",
      "    g[i][j] = '0'; __dfs(g,n,cs,i+1,j); __dfs(g,n,cs,i-1,j); __dfs(g,n,cs,i,j+1); __dfs(g,n,cs,i,j-1);",
      "}",
      "int numIslands(char** grid, int gridSize, int* gridColSize) {",
      "    int cnt = 0;",
      "    for (int i = 0; i < gridSize; i++) for (int j = 0; j < gridColSize[i]; j++) if (grid[i][j] == '1') { cnt++; __dfs(grid, gridSize, gridColSize, i, j); }",
      "    return cnt;",
      "}",
    ].join("\n");
    expect(runC(spec, user, '[["1","1","0"],["1","0","0"],["0","0","1"]]')).toBe("2");
  });

  it("reverseList: struct ListNode* reverseList(struct ListNode* head)", { timeout: 30000 }, () => {
    const spec: HarnessSpec = {
      schemaVersion: HARNESS_SCHEMA_VERSION,
      entryMethod: "reverseList",
      parameters: [{ name: "head", type: t("ListNode") }],
      returnType: t("ListNode"),
    };
    const user = [
      "struct ListNode* reverseList(struct ListNode* head) {",
      "    struct ListNode* prev = NULL;",
      "    while (head) { struct ListNode* nxt = head->next; head->next = prev; prev = head; head = nxt; }",
      "    return prev;",
      "}",
    ].join("\n");
    expect(runC(spec, user, "[1,2,3,4,5]")).toBe("[5,4,3,2,1]");
  });

  it("invertTree: struct TreeNode* invertTree(struct TreeNode* root)", { timeout: 30000 }, () => {
    const spec: HarnessSpec = {
      schemaVersion: HARNESS_SCHEMA_VERSION,
      entryMethod: "invertTree",
      parameters: [{ name: "root", type: t("TreeNode") }],
      returnType: t("TreeNode"),
    };
    const user = [
      "struct TreeNode* invertTree(struct TreeNode* root) {",
      "    if (!root) return NULL;",
      "    struct TreeNode* l = invertTree(root->left); struct TreeNode* r = invertTree(root->right);",
      "    root->left = r; root->right = l; return root;",
      "}",
    ].join("\n");
    expect(runC(spec, user, "[4,2,7,1,3,6,9]")).toBe("[4,7,2,9,6,3,1]");
  });
});
