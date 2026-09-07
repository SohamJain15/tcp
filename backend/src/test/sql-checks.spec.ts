import type mysql from "mysql2/promise";
import { describe, expect, it } from "vitest";

import { runSqlChecks, type SqlCheck } from "../execution/sql/sql-checks";

interface FakeColumn {
  table: string;
  column: string;
  dataType: string;
  nullable?: boolean;
  key?: string;
}

interface FakeSchema {
  tables: string[];
  columns: FakeColumn[];
  constraints?: Array<{ table: string; type: string; column?: string }>;
  checkConstraintTables?: string[];
  rowCounts?: Record<string, number>;
  queryRows?: Record<string, unknown[]>;
}

/**
 * A stand-in for the schema-owner connection. `runSqlChecks` reads only information_schema, the row
 * counts, and any faculty verification query, so answering those four shapes is enough to exercise
 * every check without a MySQL server.
 */
function fakeConnection(schema: FakeSchema): mysql.Connection {
  const query = async (sql: string | { sql: string }) => {
    const text = typeof sql === "string" ? sql : sql.sql;
    if (text.includes("information_schema.TABLES")) {
      return [schema.tables.map((TABLE_NAME) => ({ TABLE_NAME }))];
    }
    if (text.includes("information_schema.COLUMNS")) {
      return [
        schema.columns.map((column) => ({
          TABLE_NAME: column.table,
          COLUMN_NAME: column.column,
          DATA_TYPE: column.dataType,
          IS_NULLABLE: column.nullable === false ? "NO" : "YES",
          COLUMN_KEY: column.key ?? "",
          EXTRA: "",
        })),
      ];
    }
    if (text.includes("CONSTRAINT_TYPE = 'CHECK'")) {
      return [(schema.checkConstraintTables ?? []).map((TABLE_NAME) => ({ TABLE_NAME }))];
    }
    if (text.includes("TABLE_CONSTRAINTS")) {
      return [
        (schema.constraints ?? []).map((constraint) => ({
          TABLE_NAME: constraint.table,
          CONSTRAINT_TYPE: constraint.type,
          COLUMN_NAME: constraint.column ?? null,
        })),
      ];
    }
    const count = /SELECT COUNT\(\*\) AS n FROM `(.+)`/.exec(text);
    if (count) {
      return [[{ n: schema.rowCounts?.[count[1]] ?? 0 }]];
    }
    const rows = schema.queryRows?.[text];
    if (rows === undefined) {
      throw Object.assign(new Error("no such table"), { sqlMessage: "Table 'x.missing' doesn't exist" });
    }
    return [rows];
  };
  return { query } as unknown as mysql.Connection;
}

/** A student who did the task but named everything their own way. */
const studentSchema: FakeSchema = {
  tables: ["dept_tbl", "student_tbl"],
  columns: [
    { table: "dept_tbl", column: "dept_id", dataType: "int", nullable: false, key: "PRI" },
    { table: "dept_tbl", column: "dept_name", dataType: "varchar", key: "UNI" },
    { table: "student_tbl", column: "roll", dataType: "int", nullable: false, key: "PRI" },
    { table: "student_tbl", column: "full_name", dataType: "varchar" },
    { table: "student_tbl", column: "dept_id", dataType: "int", key: "MUL" },
  ],
  constraints: [
    { table: "dept_tbl", type: "PRIMARY KEY", column: "dept_id" },
    { table: "dept_tbl", type: "UNIQUE", column: "dept_name" },
    { table: "student_tbl", type: "PRIMARY KEY", column: "roll" },
    { table: "student_tbl", type: "FOREIGN KEY", column: "dept_id" },
  ],
  checkConstraintTables: ["student_tbl"],
  rowCounts: { dept_tbl: 3, student_tbl: 8 },
};

const run = (checks: SqlCheck[], schema: FakeSchema = studentSchema) =>
  runSqlChecks(fakeConnection(schema), "tcp_lab_x", checks);

describe("SQL structural checks", () => {
  it("passes name-agnostic checks for a student who invented their own table names", async () => {
    const results = await run([
      { type: "tableCount", label: "At least 2 tables", min: 2 },
      { type: "hasConstraint", label: "A primary key", anyTable: true, constraint: "PRIMARY KEY" },
      { type: "hasConstraint", label: "A foreign key", anyTable: true, constraint: "FOREIGN KEY" },
      { type: "hasConstraint", label: "A unique constraint", anyTable: true, constraint: "UNIQUE" },
      { type: "hasConstraint", label: "A check constraint", anyTable: true, constraint: "CHECK" },
      { type: "hasConstraint", label: "A not-null column", anyTable: true, constraint: "NOT NULL" },
      { type: "hasColumn", label: "A VARCHAR column", anyTable: true, column: "full_name", dataType: "varchar" },
      { type: "rowCount", label: "At least 5 rows somewhere", anyTable: true, min: 5 },
    ]);
    expect(results.every((result) => result.passed)).toBe(true);
    expect(results.map((result) => result.label)).toContain("A foreign key");
  });

  it("fails a pinned table name that the student did not use, and says what they did create", async () => {
    const [result] = await run([{ type: "tableExists", label: "students exists", table: "students" }]);
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("dept_tbl, student_tbl");
  });

  it("matches a pinned table name case-insensitively", async () => {
    const [result] = await run([{ type: "tableExists", label: "STUDENT_TBL exists", table: "STUDENT_TBL" }]);
    expect(result.passed).toBe(true);
  });

  it("reports a missing table rather than crashing when a check pins one", async () => {
    const results = await run([
      { type: "hasColumn", label: "column in a missing table", table: "nope", column: "id" },
      { type: "rowCount", label: "rows in a missing table", table: "nope", min: 1 },
      { type: "hasConstraint", label: "key in a missing table", table: "nope", constraint: "PRIMARY KEY" },
    ]);
    expect(results.every((result) => !result.passed)).toBe(true);
    expect(results.every((result) => result.detail?.includes('table "nope" does not exist'))).toBe(true);
  });

  it("fails a scoped constraint check when only another table satisfies it", async () => {
    const [result] = await run([
      { type: "hasConstraint", label: "dept_tbl has a foreign key", table: "dept_tbl", constraint: "FOREIGN KEY" },
    ]);
    expect(result.passed).toBe(false);
    expect(result.detail).toContain('table "dept_tbl"');
  });

  it("reports how far short a row-count check fell", async () => {
    const [result] = await run([{ type: "rowCount", label: "At least 50 rows", anyTable: true, min: 50 }]);
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("8 rows");
  });

  it("enforces tableCount bounds in both directions", async () => {
    const results = await run([
      { type: "tableCount", label: "At least 3", min: 3 },
      { type: "tableCount", label: "At most 1", max: 1 },
    ]);
    expect(results.map((result) => result.passed)).toEqual([false, false]);
    expect(results[0].detail).toContain("2 tables");
  });

  it("runs a faculty verification query and fails cleanly when it references a missing table", async () => {
    const schema: FakeSchema = { ...studentSchema, queryRows: { "SELECT 1": [[1]] } };
    const results = await run(
      [
        { type: "queryReturns", label: "returns a row", sql: "SELECT 1" },
        { type: "queryReturns", label: "counts joined rows", sql: "SELECT * FROM missing" },
      ],
      schema,
    );
    expect(results[0].passed).toBe(true);
    expect(results[1].passed).toBe(false);
    expect(results[1].detail).toContain("doesn't exist");
  });

  it("returns nothing when an experiment declares no checks", async () => {
    expect(await run([])).toEqual([]);
  });
});
