import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import { HARNESS_SCHEMA_VERSION, type HarnessSpec, type TypeRef } from "../contract";
import { generateSubmissionProgram } from "../index";
import { ensureHarnessRegistered } from "../register";
import { E2E_SUITE_TIMEOUT_MS } from "./e2e-timeout";

const t = (base: string, of?: TypeRef[]): TypeRef => ({ base, of });

// Transpile the generated TS harness with the installed `typescript` package,
// then run it on Node — the same shape Judge0 uses.
function runTs(spec: HarnessSpec, userSource: string, input: string): string {
  const { source } = generateSubmissionProgram("typescript", userSource, spec);
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const dir = mkdtempSync(join(tmpdir(), "harness-ts-"));
  const file = join(dir, "main.js");
  writeFileSync(file, js, "utf8");
  return execFileSync(process.execPath, [file], { input, encoding: "utf8" });
}

describe("TypeScript harness end-to-end", { timeout: E2E_SUITE_TIMEOUT_MS }, () => {
  beforeAll(() => ensureHarnessRegistered());

  it("twoSum(number[], number) -> number[]", () => {
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
      "  twoSum(nums: number[], target: number): number[] {",
      "    const seen = new Map<number, number>();",
      "    for (let i = 0; i < nums.length; i++) {",
      "      if (seen.has(target - nums[i])) return [seen.get(target - nums[i])!, i];",
      "      seen.set(nums[i], i);",
      "    }",
      "    return [];",
      "  }",
      "}",
    ].join("\n");
    expect(runTs(spec, user, "[2,7,11,15]\n9")).toBe("[0,1]");
    expect(runTs(spec, user, "[3,2,4]\n6")).toBe("[1,2]");
  });

  it("inorderTraversal(TreeNode) -> number[]", () => {
    const spec: HarnessSpec = {
      schemaVersion: HARNESS_SCHEMA_VERSION,
      entryMethod: "inorderTraversal",
      parameters: [{ name: "root", type: t("TreeNode") }],
      returnType: t("List", [t("int")]),
    };
    const user = [
      "class Solution {",
      "  inorderTraversal(root: any): number[] {",
      "    const out: number[] = [];",
      "    const dfs = (n: any) => { if (!n) return; dfs(n.left); out.push(n.val); dfs(n.right); };",
      "    dfs(root); return out;",
      "  }",
      "}",
    ].join("\n");
    expect(runTs(spec, user, "[1,null,2,3]")).toBe("[1,3,2]");
  });
});
