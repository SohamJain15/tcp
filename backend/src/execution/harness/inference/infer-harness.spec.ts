import { describe, expect, it } from "vitest";
import { inferHarness, type InferenceInput } from "./infer-harness";

function draft(partial: Partial<InferenceInput> & { title: string; cases: [string, string][] }): InferenceInput {
  const [sample, ...hidden] = partial.cases;
  return {
    title: partial.title,
    tags: partial.tags ?? [],
    topic: partial.topic,
    statement: partial.statement,
    inputFormat: partial.inputFormat,
    outputFormat: partial.outputFormat,
    sampleTestCases: [{ input: sample[0], output: sample[1] }],
    hiddenTestCases: hidden.map(([i, o]) => ({ input: i, output: o })),
  };
}

function sig(input: InferenceInput) {
  const r = inferHarness(input);
  return { ok: r.ok, conf: r.confidence, sig: r.signatureSummary, r };
}

describe("inferHarness — parameter & return detection", () => {
  it("array -> int (count line dropped)", () => {
    const r = sig(draft({ title: "Second Largest Element", tags: ["Array"], cases: [["5\n1 5 3 9 7", "7"], ["4\n10 10 10 10", "-1"]] }));
    expect(r.ok).toBe(true);
    expect(r.sig).toBe("int secondLargestElement(int[] nums)");
    expect(r.r.sampleTestCases![0]).toEqual({ input: "[1,5,3,9,7]", output: "7" });
  });

  it("array -> int[] (running sum)", () => {
    const r = sig(draft({ title: "Running Sum", tags: ["Arrays"], cases: [["5\n1 2 3 4 5", "1 3 6 10 15"]] }));
    expect(r.sig).toBe("int[] runningSum(int[] nums)");
    expect(r.r.sampleTestCases![0].output).toBe("[1,3,6,10,15]");
  });

  it("array + scalar -> (int[], int)", () => {
    const r = sig(draft({ title: "Two Sum", tags: ["Arrays"], cases: [["4\n2 7 11 15\n9", "0 1"]] }));
    expect(r.sig).toBe("int[] twoSum(int[] nums, int target)");
    expect(r.r.sampleTestCases![0].input).toBe("[2,7,11,15]\n9");
  });

  it("count line with extra scalar -> (int[], int) [coin change]", () => {
    const r = sig(draft({ title: "Coin Change", tags: ["DP"], cases: [["3 11\n1 2 5", "3"]] }));
    expect(r.sig).toBe("int coinChange(int[] nums, int target)");
    expect(r.r.sampleTestCases![0].input).toBe("[1,2,5]\n11");
  });

  it("two arrays + scalar -> knapsack", () => {
    const r = sig(draft({ title: "Knapsack", tags: ["DP"], cases: [["3 4\n1 2 3\n6 10 12", "18"]] }));
    expect(r.sig).toBe("int knapsack(int[] nums, int[] values, int target)");
    expect(r.r.sampleTestCases![0].input).toBe("[1,2,3]\n[6,10,12]\n4");
  });

  it("tree (null marker) -> List<int>", () => {
    const r = sig(draft({ title: "Binary Tree Inorder Traversal", tags: ["Tree"], cases: [["1 null 2 3", "1 3 2"], ["null", ""]] }));
    expect(r.sig).toBe("int[] binaryTreeInorderTraversal(TreeNode root)");
    expect(r.r.sampleTestCases![0]).toEqual({ input: "[1,null,2,3]", output: "[1,3,2]" });
    // empty tree output fixed to []
    expect(r.r.hiddenTestCases![0].output).toBe("[]");
  });

  it("tree (via tag, no null in sample) still detected", () => {
    const r = sig(draft({ title: "Max Depth", tags: ["Tree"], inputFormat: "level-order tokens", cases: [["3 9 20 null null 15 7", "3"], ["2 1 3", "2"]] }));
    expect(r.sig).toBe("int maxDepth(TreeNode root)");
    expect(r.r.hiddenTestCases![0].input).toBe("[2,1,3]");
  });

  it("tree + two ints -> LCA", () => {
    const r = sig(draft({ title: "Lowest Common Ancestor", tags: ["Tree"], cases: [["6 2 8 0 4 7 9 null null 3 5\n2 8", "6"]] }));
    expect(r.sig).toBe("int lowestCommonAncestor(TreeNode root, int p, int q)");
    expect(r.r.sampleTestCases![0].input).toBe("[6,2,8,0,4,7,9,null,null,3,5]\n2\n8");
  });

  it("graph edge list -> (int n, int[][] edges) boolean", () => {
    const r = sig(draft({ title: "Detect Cycle", tags: ["Graph"], cases: [["3 3\n0 1\n1 2\n2 0", "Yes"], ["3 2\n0 1\n1 2", "No"]] }));
    expect(r.sig).toBe("String detectCycle(int n, int[][] edges)");
    expect(r.r.sampleTestCases![0].input).toBe("3\n[[0,1],[1,2],[2,0]]");
    expect(r.r.hiddenTestCases![0].output).toBe('"No"');
  });

  it("single string -> boolean", () => {
    const r = sig(draft({ title: "Valid Parentheses", tags: ["Stack"], cases: [["()[]{}", "true"], ["(]", "false"]] }));
    expect(r.sig).toBe("boolean validParentheses(String s)");
    expect(r.r.sampleTestCases![0]).toEqual({ input: '"()[]{}"', output: "true" });
  });

  it("sentence string -> String (reverse words)", () => {
    const r = sig(draft({ title: "Reverse Words", tags: ["Strings"], cases: [["the sky is blue", "blue is sky the"]] }));
    expect(r.sig).toBe("String reverseWords(String s)");
    expect(r.r.sampleTestCases![0]).toEqual({ input: '"the sky is blue"', output: '"blue is sky the"' });
  });

  it("two strings -> (String, String)", () => {
    const r = sig(draft({ title: "Valid Anagram", tags: ["Strings"], cases: [["anagram\nnagaram", "true"]] }));
    expect(r.sig).toBe("boolean validAnagram(String s, String t)");
    expect(r.r.sampleTestCases![0].input).toBe('"anagram"\n"nagaram"');
  });

  it("string + count + word list -> (String, List<String>) [word break]", () => {
    const r = sig(draft({ title: "Word Break", tags: ["DP"], cases: [["leetcode\n2\nleet code", "true"]] }));
    expect(r.sig).toBe("boolean wordBreak(String s, List<String> words)");
    expect(r.r.sampleTestCases![0].input).toBe('"leetcode"\n["leet","code"]');
  });

  it("count + word list -> List<String> [LCP]", () => {
    const r = sig(draft({ title: "Longest Common Prefix", tags: ["Strings"], cases: [["3\nflower flow flight", "fl"], ["2\nx y", ""]] }));
    expect(r.sig).toBe("String longestCommonPrefix(List<String> words)");
    expect(r.r.sampleTestCases![0].input).toBe('["flower","flow","flight"]');
    expect(r.r.hiddenTestCases![0].output).toBe('""'); // empty string preserved
  });

  it("linked list via tag -> ListNode param", () => {
    const r = sig(draft({ title: "Reverse a Linked List", tags: ["Linked List"], cases: [["5\n1 2 3 4 5", "5 4 3 2 1"]] }));
    expect(r.sig).toBe("int[] reverseALinkedList(ListNode head)");
    expect(r.r.sampleTestCases![0].input).toBe("[1,2,3,4,5]");
  });

  it("single int -> int (climbing stairs)", () => {
    const r = sig(draft({ title: "Climbing Stairs", tags: ["DP"], cases: [["2", "2"], ["3", "3"]] }));
    expect(r.sig).toBe("int climbingStairs(int n)");
    expect(r.r.sampleTestCases![0]).toEqual({ input: "2", output: "2" });
  });

  it("binary-string output flagged low confidence", () => {
    const r = sig(
      draft({
        title: "Generate Binary Numbers",
        tags: ["Queue"],
        outputFormat: "binary representations",
        cases: [["5", "1 10 11 100 101"]],
      }),
    );
    expect(r.r.ok).toBe(true);
    expect(r.conf).toBe("low"); // needs faculty review
    expect(r.sig).toBe("List<String> generateBinaryNumbers(int n)");
  });
});
