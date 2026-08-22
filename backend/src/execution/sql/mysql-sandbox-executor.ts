import { randomBytes } from "node:crypto";
import mysql from "mysql2/promise";

import { compareResultSets } from "./sql-compare";
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
  /** Per-statement ceiling for the student's query (server-side MAX_EXECUTION_TIME + client wall). */
  statementTimeoutMs: number;
  /** Row cap on a captured grid. */
  maxRows: number;
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
 *  - a fresh `lab_<ts>_<rand>` database and a fresh `labu_<ts>_<rand>` MySQL user are created per
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
    });
  }

  async run(input: { studentSql: string; context: SqlExperimentContext }): Promise<SqlRunResult> {
    return this.withEphemeralDb(input.context, async (names) => {
      const ran = await this.runAsUser(names, input.studentSql);
      return {
        ok: ran.error === undefined,
        result: ran.result,
        error: ran.error,
        timedOut: ran.timedOut,
        runtimeMs: ran.runtimeMs,
      };
    }).catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : "Sandbox error",
      timedOut: false,
      runtimeMs: 0,
    }));
  }

  async grade(input: { studentSql: string; context: SqlExperimentContext }): Promise<SqlGradeResult> {
    try {
      return await this.withEphemeralDb(input.context, async (names, admin) => {
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
      });
    } catch (error) {
      return {
        status: "INTERNAL_ERROR",
        passed: false,
        runtimeMs: 0,
        provider: this.provider,
        message: error instanceof Error ? error.message : "Sandbox error",
      };
    }
  }

  /** Drops `lab_%` databases and `labu_%` users left behind by crashed runs older than `staleMs`. */
  async sweepOrphans(staleMs: number): Promise<void> {
    const admin = await this.pool.getConnection();
    try {
      const cutoff = Date.now() - staleMs;
      const [dbs] = await admin.query("SHOW DATABASES LIKE 'lab\\_%'");
      for (const row of dbs as Record<string, string>[]) {
        const name = Object.values(row)[0];
        if (this.timestampOf(name) < cutoff) {
          await admin.query(`DROP DATABASE IF EXISTS \`${name}\``).catch(() => undefined);
        }
      }
      const [users] = await admin.query("SELECT User AS u FROM mysql.user WHERE User LIKE 'labu\\_%'");
      for (const row of users as { u: string }[]) {
        if (this.timestampOf(row.u) < cutoff) {
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

  private timestampOf(name: string): number {
    const parts = name.split("_");
    const ts = Number.parseInt(parts[1] ?? "", 36);
    return Number.isFinite(ts) ? ts : 0;
  }

  private async withEphemeralDb<T>(
    context: SqlExperimentContext,
    body: (names: EphemeralNames, admin: mysql.PoolConnection) => Promise<T>,
  ): Promise<T> {
    const suffix = `${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
    const names: EphemeralNames = {
      db: `lab_${suffix}`,
      user: `labu_${suffix}`,
      password: randomBytes(16).toString("hex"),
    };

    const admin = await this.pool.getConnection();
    try {
      await admin.query(`CREATE DATABASE \`${names.db}\``);
      await admin.query(`CREATE USER '${names.user}'@'%' IDENTIFIED BY '${names.password}'`);
      await admin.query(`GRANT ALL PRIVILEGES ON \`${names.db}\`.* TO '${names.user}'@'%'`);
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
    });
    const start = Date.now();
    try {
      await connection.query(`SET SESSION MAX_EXECUTION_TIME = ${this.config.statementTimeoutMs}`);
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
    const columns = Array.isArray(fields)
      ? (fields as { name: string }[]).map((field) => field.name)
      : [];
    const allRows = Array.isArray(rows) ? (rows as unknown[]) : [];
    const truncated = allRows.length > this.config.maxRows;
    const capped = allRows.slice(0, this.config.maxRows).map((row) =>
      Array.isArray(row) ? (row as SqlCell[]) : (Object.values(row as object) as SqlCell[]),
    );
    return { columns, rows: capped, truncated };
  }
}

interface EphemeralNames {
  db: string;
  user: string;
  password: string;
}
