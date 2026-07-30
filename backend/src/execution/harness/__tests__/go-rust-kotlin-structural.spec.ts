import { beforeAll, describe, expect, it } from "vitest";
import { HARNESS_SCHEMA_VERSION, type HarnessSpec, type TypeRef } from "../contract";
import { generateSubmissionProgram, generateStarterCode } from "../index";
import { ensureHarnessRegistered } from "../register";

/**
 * Go / Rust / Kotlin have no toolchain in this environment, so these are
 * structural checks on the generated program (signature, typelib, call shape),
 * pending real end-to-end execution on those runtimes.
 */

const t = (base: string, of?: TypeRef[]): TypeRef => ({ base, of });

const twoSum: HarnessSpec = {
  schemaVersion: HARNESS_SCHEMA_VERSION,
  entryMethod: "twoSum",
  parameters: [
    { name: "nums", type: t("int[]") },
    { name: "target", type: t("int") },
  ],
  returnType: t("int[]"),
};

const inorder: HarnessSpec = {
  schemaVersion: HARNESS_SCHEMA_VERSION,
  entryMethod: "inorderTraversal",
  parameters: [{ name: "root", type: t("TreeNode") }],
  returnType: t("List", [t("int")]),
};

beforeAll(() => ensureHarnessRegistered());

describe("Go adapter (structural)", () => {
  it("emits a free function, encoding/json decode, and json.Marshal output", () => {
    const { source } = generateSubmissionProgram("go", "func twoSum(nums []int, target int) []int { return nil }", twoSum);
    expect(source).toContain("package main");
    expect(source).toContain("json.Unmarshal([]byte(__tLines[0]), &nums)");
    expect(source).toContain("__tRes := twoSum(nums, target)");
    expect(source).toContain("fmt.Print(__tDump(__tRes))");
    expect(source).toContain("type TreeNode struct");
  });
  it("builds a tree for TreeNode params", () => {
    const { source } = generateSubmissionProgram("go", "func inorderTraversal(root *TreeNode) []int { return nil }", inorder);
    expect(source).toContain("__tBuildTree(rootRaw)");
  });
  it("generates a Go starter signature", () => {
    expect(generateStarterCode("go", twoSum)).toContain("func twoSum(nums []int, target int) []int {");
  });
});

describe("Rust adapter (structural)", () => {
  it("emits impl-based call, a JSON reader, and canonical dump", () => {
    const { source } = generateSubmissionProgram(
      "rust",
      "struct Solution; impl Solution { pub fn twoSum(nums: Vec<i32>, target: i32) -> Vec<i32> { vec![] } }",
      twoSum,
    );
    expect(source).toContain("struct __TReader");
    expect(source).toContain("read_vec_i32()");
    expect(source).toContain("Solution::twoSum(nums, target)");
    expect(source).toContain('print!("{}", __t_dump(&__t_res))');
  });
  it("generates a Rust starter signature", () => {
    expect(generateStarterCode("rust", twoSum)).toContain("pub fn twoSum(nums: Vec<i32>, target: i32) -> Vec<i32>");
  });
});

describe("Kotlin adapter (structural)", () => {
  it("emits Solution().method call, JSON reader, and canonical dump", () => {
    const { source } = generateSubmissionProgram(
      "kotlin",
      "class Solution { fun twoSum(nums: IntArray, target: Int): IntArray { return intArrayOf() } }",
      twoSum,
    );
    expect(source).toContain("class __TJson");
    expect(source).toContain("__tIntArr(__TJson(__tLines[0]).parse())");
    expect(source).toContain("Solution().twoSum(nums, target)");
    expect(source).toContain("print(__tDump(__tRes))");
  });
  it("builds a tree for TreeNode params", () => {
    const { source } = generateSubmissionProgram(
      "kotlin",
      "class Solution { fun inorderTraversal(root: TreeNode?): List<Int> { return listOf() } }",
      inorder,
    );
    expect(source).toContain("__tBuildTree(__TJson(__tLines[0]).parse())");
  });
  it("generates a Kotlin starter signature", () => {
    expect(generateStarterCode("kotlin", twoSum)).toContain("fun twoSum(nums: IntArray, target: Int): IntArray {");
  });
});
