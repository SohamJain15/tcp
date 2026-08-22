import { describe, expect, it } from "vitest";

import { compareResultSets } from "../execution/sql/sql-compare";
import type { SqlResultSet } from "../execution/sql/sql-executor";

/**
 * Result-set comparison is the grading rule for the DBMS Lab, so it is tested directly and without
 * a database. Column names are ignored (students alias freely); order only matters when the task
 * declared it does.
 */
function set(columns: string[], rows: (string | number | null)[][], truncated = false): SqlResultSet {
  return { columns, rows, truncated };
}

describe("compareResultSets", () => {
  it("matches identical grids", () => {
    const a = set(["id", "name"], [[1, "amy"], [2, "bob"]]);
    const b = set(["id", "name"], [[1, "amy"], [2, "bob"]]);
    expect(compareResultSets(a, b, true).match).toBe(true);
  });

  it("ignores column names — only values matter", () => {
    const student = set(["x", "y"], [[1, "amy"]]);
    const expected = set(["id", "name"], [[1, "amy"]]);
    expect(compareResultSets(student, expected, true).match).toBe(true);
  });

  it("treats 1 and 1.0 and \"1\" as equal", () => {
    const student = set(["n"], [["1"], [2]]);
    const expected = set(["n"], [[1], ["2.0"]]);
    expect(compareResultSets(student, expected, true).match).toBe(true);
  });

  it("is order-insensitive when ordered is false", () => {
    const student = set(["id"], [[2], [1], [3]]);
    const expected = set(["id"], [[1], [2], [3]]);
    expect(compareResultSets(student, expected, false).match).toBe(true);
  });

  it("is order-sensitive when ordered is true", () => {
    const student = set(["id"], [[2], [1], [3]]);
    const expected = set(["id"], [[1], [2], [3]]);
    const result = compareResultSets(student, expected, true);
    expect(result.match).toBe(false);
    expect(result.reason).toContain("Row 1");
  });

  it("fails on a different column count", () => {
    const student = set(["id"], [[1]]);
    const expected = set(["id", "name"], [[1, "amy"]]);
    expect(compareResultSets(student, expected, true).match).toBe(false);
  });

  it("fails on a different row count", () => {
    const student = set(["id"], [[1]]);
    const expected = set(["id"], [[1], [2]]);
    const result = compareResultSets(student, expected, false);
    expect(result.match).toBe(false);
    expect(result.reason).toContain("row");
  });

  it("distinguishes NULL from empty string", () => {
    const student = set(["v"], [[null]]);
    const expected = set(["v"], [[""]]);
    expect(compareResultSets(student, expected, true).match).toBe(false);
  });
});
