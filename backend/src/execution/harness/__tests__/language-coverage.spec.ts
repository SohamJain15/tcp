import { beforeAll, describe, expect, it } from "vitest";
import { EXECUTABLE_LANGUAGES } from "../../../shared/constants/domain";
import { HARNESS_SCHEMA_VERSION, type HarnessSpec, type TypeRef } from "../contract";
import { harnessLanguageSupported } from "../index";
import { ensureHarnessRegistered } from "../register";

/**
 * Which languages can express which signatures.
 *
 * `harnessLanguageSupported` is the single gate used by both the editor's language
 * list and submit/run, so a language silently dropping out of this matrix means
 * students get "not available in <language>" on problems that used to work. The
 * e2e specs cover *correctness* but skip when a toolchain is missing; this one is
 * pure codegen, so it always runs and catches coverage regressions.
 */

const t = (base: string): TypeRef => ({ base });

function spec(returnBase: string, parameterBases: string[]): HarnessSpec {
  return {
    schemaVersion: HARNESS_SCHEMA_VERSION,
    entryMethod: "solve",
    parameters: parameterBases.map((base, index) => ({ name: `p${index}`, type: t(base) })),
    returnType: t(returnBase),
  };
}

function supported(harness: HarnessSpec): string[] {
  return EXECUTABLE_LANGUAGES.filter((language) => harnessLanguageSupported(language, harness)).sort();
}

describe("harness language coverage", () => {
  beforeAll(() => {
    ensureHarnessRegistered();
  });

  it("supports GraphNode in every language with a graph runtime", () => {
    // Regression guard for the graph work: the typed adapters (C++/Java/Go/Kotlin)
    // implement GraphNode inline, while Python/JS/TS get it from GraphSerializer.
    expect(supported(spec("GraphNode", ["GraphNode"]))).toEqual([
      "cpp",
      "go",
      "java",
      "javascript",
      "kotlin",
      "python",
      "typescript",
      "vanilla",
    ]);
  });

  it("supports TreeNode everywhere GraphNode works, plus C", () => {
    const tree = supported(spec("TreeNode", ["TreeNode"]));
    expect(tree).toContain("c");
    for (const language of supported(spec("GraphNode", ["GraphNode"]))) {
      expect(tree).toContain(language);
    }
  });

  it("supports ListNode in the core lab languages", () => {
    const list = supported(spec("ListNode", ["ListNode"]));
    for (const language of ["c", "cpp", "java", "python", "javascript"]) {
      expect(list).toContain(language);
    }
  });

  it("supports 2D integer arrays, the DP/matrix shape", () => {
    // Widest coverage of the object-graph shapes — Rust included, unlike TreeNode.
    const grid = supported(spec("int[][]", ["int[][]"]));
    for (const language of ["c", "cpp", "java", "python", "javascript", "go", "rust", "kotlin"]) {
      expect(grid).toContain(language);
    }
  });

  it("keeps the primary lab languages available for a plain array signature", () => {
    const plain = supported(spec("int[]", ["int[]", "int"]));
    for (const language of ["c", "cpp", "java", "python", "javascript", "typescript"]) {
      expect(plain).toContain(language);
    }
  });

  it("reports a language as unsupported instead of throwing when it cannot express a type", () => {
    // Rust deliberately defers object graphs; the gate must return false, not throw,
    // so submit/run answers 400 rather than 500.
    expect(() => harnessLanguageSupported("rust", spec("GraphNode", ["GraphNode"]))).not.toThrow();
    expect(harnessLanguageSupported("rust", spec("GraphNode", ["GraphNode"]))).toBe(false);
    expect(harnessLanguageSupported("c", spec("GraphNode", ["GraphNode"]))).toBe(false);
  });

  it("honours an explicit per-language disable", () => {
    const disabled: HarnessSpec = {
      ...spec("int", ["int"]),
      languageOverrides: { python: { disabled: true } },
    };
    expect(harnessLanguageSupported("python", disabled)).toBe(false);
    expect(harnessLanguageSupported("cpp", disabled)).toBe(true);
  });
});
