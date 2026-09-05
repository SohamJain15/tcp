import { randomBytes } from "node:crypto";
import mysql from "mysql2/promise";

import { EXECUTION_SERVICE_UNAVAILABLE_MESSAGE } from "../../shared/errors/public-messages";
import { logServerError } from "../../shared/logging/error-logger";
import { compareResultSets } from "./sql-compare";
import { validateSqlTextLength, validateStudentSql } from "./sql-policy";
import type {
  SqlCell,
  SqlExecutor,
  SqlExperimentContext,
  SqlGradeResult,
  SqlResultSet,
  SqlRunResult,
} from "./sql-executor";

export interface MysqlSandboxConfig {
  host: string;
  port: number;
  adminUser: string;
  adminPassword: string;
  namespace: string;
  /** Per-statement ceiling for the student's query (server-side MAX_EXECUTION_TIME + client wall). */
  statementTimeoutMs: number;
  /** Row cap on a captured grid. */
  maxRows: number;
  maxColumns: number;
  maxQueryLength: number;
  maxSchemaLength: number;
  maxSolutionLength: number;
  maxConcurrentRuns: number;
  poolSize: number;
}

interface RanQuery {
  result?: SqlResultSet;
  error?: string;
  timedOut: boolean;
  runtimeMs: number;
}

/** A MySQL query timeout surfaces under a few different codes depending on how it tripped. */
function isTimeout(error: unknown): boolean {
  const err = error as { code?: string; errno?: number; message?: string };
  return (
    err?.code === "PROTOCOL_SEQUENCE_TIMEOUT" ||
    err?.code === "ER_QUERY_TIMEOUT" ||
    err?.errno === 3024 ||
    /max_execution_time|query execution was interrupted|timeout/i.test(err?.message ?? "")
  );
}

/**
 * Runs student SQL against a REAL MySQL, one throwaway database per attempt.
 *
 * Isolation is the whole point:
 *  - a fresh namespaced database and MySQL user are created per
 *    call; the user is granted privileges on *only* that database, so a student query cannot read
 *    `mysql.*` or another attempt's data;
 *  - the schema is seeded by the admin (schema owner); the student query runs as the restricted
 *    user with a server-side `MAX_EXECUTION_TIME` and a client-side wall timeout;
 *  - the database and user are always dropped in a `finally`, so `DROP`/`DELETE` damage is contained
 *    to the throwaway schema, and {@link sweepOrphans} reaps anything a crash left behind.
 *
 * The database/user names embed only a timestamp and hex, never user input, so interpolating them
 * into DDL is safe.
 */
export class MysqlSandboxExecutor implements SqlExecutor {
  readonly provider = "sql-mysql";
  private readonly pool: mysql.Pool;
  private activeRuns = 0;
  private readonly waitingRuns: Array<() => void> = [];

  constructor(private readonly config: MysqlSandboxConfig) {
    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.adminUser,
      password: config.adminPassword,
      connectionLimit: config.poolSize,
      waitForConnections: true,
      multipleStatements: true,
      dateStrings: true,
      connectTimeout: 5000,
    });
  }

  async run(input: { studentSql: string; context: SqlExperimentContext }): Promise<SqlRunResult> {
    const validation = validateStudentSql(input.studentSql, this.config.maxQueryLength);
    if (!validation.ok) {
      return { ok: false, error: validation.error, timedOut: false, runtimeMs: 0 };
    }

    return this.withRunPermit(() =>
      this.withEphemeralDb(input.context, async (names) => {
        const ran = await this.runAsUser(names, input.studentSql);
        return {
          ok: ran.error === undefined,
          result: ran.result,
          error: ran.error,
          timedOut: ran.timedOut,
          runtimeMs: ran.runtimeMs,
        };
      }),
    ).catch((error) => {
      logServerError("SQL sandbox run failed", error, { provider: this.provider });
      return {
        ok: false,
        error: EXECUTION_SERVICE_UNAVAILABLE_MESSAGE,
        internalError: true,
        timedOut: false,
        runtimeMs: 0,
      };
    });
  }

  async grade(input: { studentSql: string; context: SqlExperimentContext }): Promise<SqlGradeResult> {
    const validation = validateStudentSql(input.studentSql, this.config.maxQueryLength);
    if (!validation.ok) {
      return {
        status: "RUNTIME_ERROR",
        passed: false,
        runtimeMs: 0,
        provider: this.provider,
        message: validation.error,
      };
    }

    try {
      return await this.withRunPermit(() => this.withEphemeralDb(input.context, async (names, admin) => {
        // Reference result first, on pristine seeded data, as the trusted schema owner.
        const [expectedRows, expectedFields] = await admin.query({
          sql: input.context.solutionSql,
          rowsAsArray: true,
        });
        const expected = this.capture(expectedRows, expectedFields);

        const ran = await this.runAsUser(names, input.studentSql);
        if (ran.timedOut) {
          return { status: "TIME_LIMIT_EXCEEDED", passed: false, runtimeMs: ran.runtimeMs, provider: this.provider, message: "Your query took too long and was stopped." };
        }
        if (ran.error !== undefined || !ran.result) {
          return { status: "RUNTIME_ERROR", passed: false, runtimeMs: ran.runtimeMs, provider: this.provider, message: ran.error ?? "Your query produced no result set." };
        }

        const comparison = compareResultSets(ran.result, expected, input.context.ordered);
        return {
          status: comparison.match ? "ACCEPTED" : "WRONG_ANSWER",
          passed: comparison.match,
          runtimeMs: ran.runtimeMs,
          provider: this.provider,
          studentResult: ran.result,
          expectedResult: expected,
          message: comparison.reason,
        };
      }));
    } catch (error) {
      logServerError("SQL sandbox grading failed", error, { provider: this.provider });
      return {
        status: "INTERNAL_ERROR",
        passed: false,
        runtimeMs: 0,
        provider: this.provider,
        message: EXECUTION_SERVICE_UNAVAILABLE_MESSAGE,
      };
    }
  }

  /** Drops `lab_%` databases and `labu_%` users left behind by crashed runs older than `staleMs`. */
  async sweepOrphans(staleMs: number): Promise<void> {
    const admin = await this.pool.getConnection();
    try {
      const cutoff = Date.now() - staleMs;
      const databasePrefix = `${this.config.namespace}_lab`;
      const userPrefix = `${this.config.namespace}_labu`;
      const [dbs] = await admin.query(`SHOW DATABASES LIKE '${databasePrefix}\\_%'`);
      for (const row of dbs as Record<string, string>[]) {
        const name = Object.values(row)[0];
        if (this.timestampOf(name, databasePrefix) < cutoff) {
          await admin.query(`DROP DATABASE IF EXISTS \`${name}\``).catch(() => undefined);
        }
      }
      const [users] = await admin.query(`SELECT User AS u FROM mysql.user WHERE User LIKE '${userPrefix}\\_%'`);
      for (const row of users as { u: string }[]) {
        if (this.timestampOf(row.u, userPrefix) < cutoff) {
          await admin.query(`DROP USER IF EXISTS '${row.u}'@'%'`).catch(() => undefined);
        }
      }
    } finally {
      admin.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private timestampOf(name: string, prefix: string): number {
    const ts = Number.parseInt(name.slice(prefix.length + 1).split("_")[0] ?? "", 36);
    return Number.isFinite(ts) ? ts : 0;
  }

  private async withRunPermit<T>(operation: () => Promise<T>): Promise<T> {
    if (this.activeRuns >= this.config.maxConcurrentRuns) {
      await new Promise<void>((resolve) => this.waitingRuns.push(resolve));
    }
    this.activeRuns += 1;
    try {
      return await operation();
    } finally {
      this.activeRuns -= 1;
      this.waitingRuns.shift()?.();
    }
  }

  private async withEphemeralDb<T>(
    context: SqlExperimentContext,
    body: (names: EphemeralNames, admin: mysql.PoolConnection) => Promise<T>,
  ): Promise<T> {
    const schemaLength = validateSqlTextLength(context.schemaSql, this.config.maxSchemaLength, "Schema SQL");
    const solutionLength = validateSqlTextLength(context.solutionSql, this.config.maxSolutionLength, "Solution SQL");
    if (!schemaLength.ok || !solutionLength.ok) {
      throw new Error(schemaLength.error ?? solutionLength.error ?? "SQL configuration is too large.");
    }

    const suffix = `${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
    const databasePrefix = `${this.config.namespace}_lab`;
    const userPrefix = `${this.config.namespace}_labu`;
    const names: EphemeralNames = {
      db: `${databasePrefix}_${suffix}`,
      user: `${userPrefix}_${suffix}`,
      password: randomBytes(16).toString("hex"),
    };

    const admin = await this.pool.getConnection();
    try {
      await admin.query(`CREATE DATABASE \`${names.db}\``);
      await admin.query(`CREATE USER '${names.user}'@'%' IDENTIFIED BY '${names.password}'`);
      await admin.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, CREATE TEMPORARY TABLES, LOCK TABLES, CREATE VIEW, SHOW VIEW ON \`${names.db}\`.* TO '${names.user}'@'%'`,
      );
      await admin.query(`USE \`${names.db}\``);
      if (context.schemaSql.trim() !== "") {
        await admin.query(context.schemaSql);
      }
      return await body(names, admin);
    } finally {
      await admin.query(`DROP USER IF EXISTS '${names.user}'@'%'`).catch(() => undefined);
      await admin.query(`DROP DATABASE IF EXISTS \`${names.db}\``).catch(() => undefined);
      admin.release();
    }
  }

  private async runAsUser(names: EphemeralNames, studentSql: string): Promise<RanQuery> {
    const connection = await mysql.createConnection({
      host: this.config.host,
      port: this.config.port,
      user: names.user,
      password: names.password,
      database: names.db,
      multipleStatements: false,
      dateStrings: true,
      connectTimeout: 5000,
      enableKeepAlive: false,
    });
    const start = Date.now();
    try {
      await connection.query(`SET SESSION MAX_EXECUTION_TIME = ${this.config.statementTimeoutMs}`);
      await connection.query("SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION'");
      const [rows, fields] = await connection.query({
        sql: studentSql,
        rowsAsArray: true,
        timeout: this.config.statementTimeoutMs + 1000,
      });
      return { result: this.capture(rows, fields), timedOut: false, runtimeMs: Date.now() - start };
    } catch (error) {
      const timedOut = isTimeout(error);
      const err = error as { sqlMessage?: string; message?: string };
      return {
        error: timedOut ? "Query timed out" : err.sqlMessage ?? err.message ?? "SQL error",
        timedOut,
        runtimeMs: Date.now() - start,
      };
    } finally {
      await connection.end().catch(() => undefined);
    }
  }

  private capture(rows: unknown, fields: unknown): SqlResultSet {
    const allColumns = Array.isArray(fields)
      ? (fields as { name: string }[]).map((field) => field.name)
      : [];
    const columns = allColumns.slice(0, this.config.maxColumns);
    const allRows = Array.isArray(rows) ? (rows as unknown[]) : [];
    const truncated = allRows.length > this.config.maxRows || allColumns.length > this.config.maxColumns;
    const capped = allRows.slice(0, this.config.maxRows).map((row) =>
      (Array.isArray(row) ? (row as SqlCell[]) : (Object.values(row as object) as SqlCell[])).slice(0, this.config.maxColumns),
    );
    return { columns, rows: capped, truncated };
  }
}

interface EphemeralNames {
  db: string;
  user: string;
  password: string;
}
