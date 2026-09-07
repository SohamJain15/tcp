/**
 * The SQL sandbox boundary for the DBMS Lab.
 *
 * Unlike the Judge0 coding path, SQL grading is a *result-set comparison*, not a stdout diff, and a
 * seeded query runs in milliseconds — so it does not need the async submission queue. The lab
 * service calls a `SqlExecutor` synchronously for both "Run" (show the student their grid) and
 * "Submit" (seed, run, compare to the reference query, return a verdict).
 *
 * Two implementations exist: {@link MysqlSandboxExecutor} (a real, isolated MySQL database per
 * attempt) and a stub used when the sandbox is disabled and in tests.
 */

import type { SqlCheck } from "./sql-checks";

export type SqlCell = string | number | boolean | null;

export interface SqlResultSet {
  columns: string[];
  rows: SqlCell[][];
  /** True when the row list was capped at `SQL_MAX_ROWS`. */
  truncated: boolean;
}

/** Everything the sandbox needs to grade one SQL experiment, carried from the lab record. */
export interface SqlExperimentContext {
  /** DDL + seed data, applied as the schema owner before any student query runs. */
  schemaSql: string;
  /** The reference query; the expected result is derived by running it on the seeded schema. */
  solutionSql: string;
  /** Whether row order is part of the answer (the task required an ORDER BY). */
  ordered: boolean;
}

/**
 * One statement's outcome inside a script run.
 *
 * A `SELECT` carries a grid; `INSERT`/`UPDATE`/`DELETE` carry a row count; DDL carries neither and
 * is reported by the fact that it succeeded. Reporting all three is what lets an application
 * experiment ("create these tables, then populate them") show the student something at all —
 * a query-mode run has nothing to display for a `CREATE TABLE`.
 */
export interface SqlStatementResult {
  sql: string;
  kind: "select" | "write" | "ddl";
  result?: SqlResultSet;
  affectedRows?: number;
  /** Set when this statement failed; execution stops here and later statements are not attempted. */
  error?: string;
}

export interface SqlColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  /** MySQL's `COLUMN_KEY`: "PRI", "UNI", "MUL" or "". */
  key: string;
  extra: string;
}

/** One table as it stands after a script finished — the "show me the actual tables" payload. */
export interface SqlTableSnapshot {
  name: string;
  columns: SqlColumnInfo[];
  rows: SqlCell[][];
  /** Total rows in the table, which can exceed `rows.length`. */
  rowCount: number;
  truncated: boolean;
}

export interface SqlCheckResult {
  label: string;
  passed: boolean;
  /** One line explaining a failure, e.g. "no table has a FOREIGN KEY". */
  detail?: string;
}

export interface SqlScriptResult {
  ok: boolean;
  statements: SqlStatementResult[];
  /** Every table in the student's database once the script finished. */
  snapshot: SqlTableSnapshot[];
  /** Present only when the experiment declares checks. */
  checks?: SqlCheckResult[];
  /** True when the snapshot itself was capped (too many tables), not when a single table was. */
  snapshotTruncated: boolean;
  error?: string;
  internalError?: boolean;
  timedOut: boolean;
  runtimeMs: number;
}

export type SqlVerdict =
  | "ACCEPTED"
  | "WRONG_ANSWER"
  | "RUNTIME_ERROR"
  | "TIME_LIMIT_EXCEEDED"
  | "INTERNAL_ERROR";

export interface SqlRunResult {
  ok: boolean;
  result?: SqlResultSet;
  /** SQL error text when `ok` is false. */
  error?: string;
  /** True only for sandbox/provider failures; user SQL diagnostics remain false/undefined. */
  internalError?: boolean;
  timedOut: boolean;
  runtimeMs: number;
}

export interface SqlGradeResult {
  status: SqlVerdict;
  passed: boolean;
  runtimeMs: number;
  provider: string;
  /** The student's grid, for display. */
  studentResult?: SqlResultSet;
  /** The reference grid — the lab service decides whether a given caller may see it. */
  expectedResult?: SqlResultSet;
  /** Human-readable error or mismatch summary. */
  message?: string;
}

export interface SqlExecutor {
  readonly provider: string;
  /** Seed the schema, run the student's query, return their result grid without grading it. */
  run(input: { studentSql: string; context: SqlExperimentContext }): Promise<SqlRunResult>;
  /** Seed the schema, run the student's query and the reference query, and compare them. */
  grade(input: { studentSql: string; context: SqlExperimentContext }): Promise<SqlGradeResult>;
  /**
   * Seed the schema, run a multi-statement script, then report every statement's outcome, the
   * resulting tables and — when the experiment declares them — the structural checks.
   *
   * This is the application-experiment path (DDL, DML, constraints, a mini-project schema). It has
   * no reference-result comparison because the student designs their own tables, so two correct
   * answers legitimately differ in table and column names.
   */
  runScript(input: {
    studentSql: string;
    context: SqlExperimentContext;
    checks?: SqlCheck[];
  }): Promise<SqlScriptResult>;
}
