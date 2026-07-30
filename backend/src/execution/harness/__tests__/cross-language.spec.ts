import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { ExecutableLanguage } from "../../../shared/types/domain";
import { HARNESS_SCHEMA_VERSION, type HarnessSpec, type TypeRef } from "../contract";
import { generateSubmissionProgram } from "../index";
import { ensureHarnessRegistered } from "../register";

const PYTHON = process.env.PYTHON_BIN ?? "python3";
let pythonOk = true;
try {
  execFileSync(PYTHON, ["--version"], { stdio: "ignore" });
} catch {
  pythonOk = false;
}

const dir = mkdtempSync(join(tmpdir(), "harness-x-"));
const t = (base: string, of?: TypeRef[]): TypeRef => ({ base, of });

function runLang(language: ExecutableLanguage, spec: HarnessSpec, source: string, input: string): string {
  const { source: program } = generateSubmissionProgram(language, source, spec);
  const ext = language === "python" ? "py" : "js";
  const file = join(dir, `x_${Math.random().toString(36).slice(2)}.${ext}`);
  writeFileSync(file, program, "utf8");
  const bin = language === "python" ? PYTHON : process.execPath;
  return execFileSync(bin, [file], { input, encoding: "utf8" });
}

interface Case {
  name: string;
  spec: HarnessSpec;
  py: string;
  js: string;
  inputs: string[];
}

const cases: Case[] = [
  {
    name: "twoSum int[] -> int[]",
    spec: {
      schemaVersion: HARNESS_SCHEMA_VERSION,
      entryMethod: "twoSum",
      parameters: [
        { name: "nums", type: t("int[]") },
        { name: "target", type: t("int") },
      ],
      returnType: t("int[]"),
    },
    py: [
      "class Solution:",
      "    def twoSum(self, nums, target):",
      "        seen = {}",
      "        for i, x in enumerate(nums):",
      "            if target - x in seen: return [seen[target - x], i]",
      "            seen[x] = i",
      "        return []",
    ].join("\n"),
    js: [
      "class Solution {",
      "  twoSum(nums, target) {",
      "    const seen = new Map();",
      "    for (let i = 0; i < nums.length; i++) {",
      "      if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];",
      "      seen.set(nums[i], i);",
      "    }",
      "    return [];",
      "  }",
      "}",
    ].join("\n"),
    inputs: ["[2,7,11,15]\n9", "[3,2,4]\n6"],
  },
  {
    name: "inorderTraversal TreeNode -> List<int>",
    spec: {
      schemaVersion: HARNESS_SCHEMA_VERSION,
      entryMethod: "inorderTraversal",
      parameters: [{ name: "root", type: t("TreeNode") }],
      returnType: t("List", [t("int")]),
    },
    py: [
      "class Solution:",
      "    def inorderTraversal(self, root):",
      "        out = []",
      "        def dfs(n):",
      "            if not n: return",
      "            dfs(n.left); out.append(n.val); dfs(n.right)",
      "        dfs(root); return out",
    ].join("\n"),
    js: [
      "class Solution {",
      "  inorderTraversal(root) {",
      "    const out = [];",
      "    const dfs = (n) => { if (!n) return; dfs(n.left); out.push(n.val); dfs(n.right); };",
      "    dfs(root); return out;",
      "  }",
      "}",
    ].join("\n"),
    inputs: ["[1,null,2,3]", "[]", "[4,2,6,1,3,5,7]"],
  },
  {
    name: "reverseList ListNode -> ListNode",
    spec: {
      schemaVersion: HARNESS_SCHEMA_VERSION,
      entryMethod: "reverseList",
      parameters: [{ name: "head", type: t("ListNode") }],
      returnType: t("ListNode"),
    },
    py: [
      "class Solution:",
      "    def reverseList(self, head):",
      "        prev = None",
      "        while head:",
      "            nxt = head.next; head.next = prev; prev = head; head = nxt",
      "        return prev",
    ].join("\n"),
    js: [
      "class Solution {",
      "  reverseList(head) {",
      "    let prev = null;",
      "    while (head) { const nxt = head.next; head.next = prev; prev = head; head = nxt; }",
      "    return prev;",
      "  }",
      "}",
    ].join("\n"),
    inputs: ["[1,2,3,4,5]", "[]"],
  },
  {
    name: "cloneGraph GraphNode -> GraphNode",
    spec: {
      schemaVersion: HARNESS_SCHEMA_VERSION,
      entryMethod: "cloneGraph",
      parameters: [{ name: "node", type: t("GraphNode") }],
      returnType: t("GraphNode"),
    },
    py: [
      "class Solution:",
      "    def cloneGraph(self, node):",
      "        if not node: return None",
      "        mp = {}",
      "        def dfs(n):",
      "            if n in mp: return mp[n]",
      "            c = Node(n.val); mp[n] = c",
      "            c.neighbors = [dfs(x) for x in n.neighbors]",
      "            return c",
      "        return dfs(node)",
    ].join("\n"),
    js: [
      "class Solution {",
      "  cloneGraph(node) {",
      "    if (!node) return null;",
      "    const mp = new Map();",
      "    const dfs = (n) => {",
      "      if (mp.has(n)) return mp.get(n);",
      "      const c = new Node(n.val); mp.set(n, c);",
      "      c.neighbors = n.neighbors.map(dfs);",
      "      return c;",
      "    };",
      "    return dfs(node);",
      "  }",
      "}",
    ].join("\n"),
    inputs: ["[[2,4],[1,3],[2,4],[1,3]]", "[]"],
  },
];

describe.skipIf(!pythonOk)("cross-language canonical output", () => {
  beforeAll(() => ensureHarnessRegistered());

  for (const c of cases) {
    it(`${c.name}: python and javascript agree`, () => {
      for (const input of c.inputs) {
        const py = runLang("python", c.spec, c.py, input);
        const js = runLang("javascript", c.spec, c.js, input);
        expect(js, `input=${JSON.stringify(input)}`).toBe(py);
      }
    });
  }
});
