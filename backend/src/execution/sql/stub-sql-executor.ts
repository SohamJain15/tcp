import type {
  SqlExecutor,
  SqlExperimentContext,
  SqlGradeResult,
  SqlResultSet,
  SqlRunResult,
} from "./sql-executor";

/**
 * Deterministic, database-free SQL executor.
 *
 * Used when `SQL_SANDBOX_ENABLED` is false and throughout the test suite, so the lab flow can be
 * exercised end to end without a running MySQL. It does not actually run SQL: it grades by
 * normalizing and comparing the student's query text to the reference query, and understands the
 * same magic substrings the code stub uses (`runtime_error`, `tle`) so failure paths are testable.
 */
function normalize(sql: string): string {
  return sql.trim().replace(/\s+/g, " ").replace(/;+\s*$/, "").toLowerCase();
}

const SAMPLE_RESULT: SqlResultSet = {
  columns: ["result"],
  rows: [["stub"]],
  truncated: false,
};

export class StubSqlExecutor implements SqlExecutor {
  readonly provider = "sql-stub";

  async run(input: { studentSql: string; context: SqlExperimentContext }): Promise<SqlRunResult> {
    const lowered = input.studentSql.toLowerCase();
    if (lowered.includes("runtime_error")) {
      return { ok: false, error: "Simulated SQL error", timedOut: false, runtimeMs: 1 };
    }
    if (lowered.includes("tle")) {
      return { ok: false, error: "Statement timed out", timedOut: true, runtimeMs: 1 };
    }
    return { ok: true, result: SAMPLE_RESULT, timedOut: false, runtimeMs: 1 };
  }

  async grade(input: { studentSql: string; context: SqlExperimentContext }): Promise<SqlGradeResult> {
    const lowered = input.studentSql.toLowerCase();
    if (lowered.includes("runtime_error")) {
      return { status: "RUNTIME_ERROR", passed: false, runtimeMs: 1, provider: this.provider, message: "Simulated SQL error" };
    }
    if (lowered.includes("tle")) {
      return { status: "TIME_LIMIT_EXCEEDED", passed: false, runtimeMs: 1, provider: this.provider, message: "Statement timed out" };
    }
    const passed = normalize(input.studentSql) === normalize(input.context.solutionSql);
    return {
      status: passed ? "ACCEPTED" : "WRONG_ANSWER",
      passed,
      runtimeMs: 1,
      provider: this.provider,
      studentResult: SAMPLE_RESULT,
      expectedResult: SAMPLE_RESULT,
      message: passed ? undefined : "Your result does not match the expected result.",
    };
  }
}
