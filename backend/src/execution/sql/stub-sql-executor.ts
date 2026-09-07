import { splitSqlStatements } from "./sql-policy";
import type { SqlCheck } from "./sql-checks";
import type {
  SqlExecutor,
  SqlExperimentContext,
  SqlGradeResult,
  SqlResultSet,
  SqlRunResult,
  SqlSchemaPreview,
  SqlScriptResult,
  SqlStatementResult,
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

  /**
   * Script mode without a database. Every statement is reported as having succeeded, a single
   * placeholder table stands in for the snapshot, and checks pass unless the script says otherwise
   * — enough for the classroom flow and the frontend to be exercised end to end in tests.
   */
  async runScript(input: {
    studentSql: string;
    context: SqlExperimentContext;
    checks?: SqlCheck[];
  }): Promise<SqlScriptResult> {
    const lowered = input.studentSql.toLowerCase();
    const statements = splitSqlStatements(input.studentSql);
    if (lowered.includes("runtime_error")) {
      return {
        ok: false,
        statements: [{ sql: statements[0] ?? input.studentSql, kind: "ddl", error: "Simulated SQL error" }],
        snapshot: [],
        snapshotTruncated: false,
        error: "Simulated SQL error",
        timedOut: false,
        runtimeMs: 1,
      };
    }
    const executed: SqlStatementResult[] = statements.map((sql) =>
      /^\s*select/i.test(sql)
        ? { sql, kind: "select", result: SAMPLE_RESULT }
        : { sql, kind: "ddl", affectedRows: 0 },
    );
    const failChecks = lowered.includes("wrong_answer");
    return {
      ok: true,
      statements: executed,
      snapshot: [
        {
          name: "stub_table",
          columns: [{ name: "result", dataType: "varchar(16)", nullable: true, key: "", extra: "" }],
          rows: [["stub"]],
          rowCount: 1,
          truncated: false,
        },
      ],
      snapshotTruncated: false,
      checks: input.checks?.map((check) => ({
        label: check.label,
        passed: !failChecks,
        detail: failChecks ? "Simulated failing check" : undefined,
      })),
      timedOut: false,
      runtimeMs: 1,
    };
  }

  async previewSchema(input: { schemaSql: string }): Promise<SqlSchemaPreview> {
    if (input.schemaSql.trim() === "") {
      return { tables: [] };
    }
    return {
      tables: [
        {
          name: "stub_table",
          columns: [{ name: "result", dataType: "varchar(16)", nullable: true, key: "", extra: "" }],
          rows: [["stub"]],
          rowCount: 1,
          truncated: false,
        },
      ],
    };
  }
}
