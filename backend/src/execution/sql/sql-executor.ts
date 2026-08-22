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
}
