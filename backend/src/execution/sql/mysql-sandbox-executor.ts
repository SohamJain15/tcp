import { randomBytes } from "node:crypto";
import mysql from "mysql2/promise";

import { EXECUTION_SERVICE_UNAVAILABLE_MESSAGE } from "../../shared/errors/public-messages";
import { logServerError } from "../../shared/logging/error-logger";
import { runSqlChecks, type SqlCheck } from "./sql-checks";
import { compareResultSets } from "./sql-compare";
import { validateSqlTextLength, validateStudentScript, validateStudentSql } from "./sql-policy";
import type {
  SqlCell,
  SqlColumnInfo,
  SqlExecutor,
  SqlExperimentContext,
  SqlGradeResult,
  SqlResultSet,
  SqlRunResult,
  SqlScriptResult,
  SqlStatementResult,
  SqlTableSnapshot,
} from "./sql-executor";

/** Statement ceiling for one script. High enough for a mini-project schema, low enough to bound work. */
const MAX_SCRIPT_STATEMENTS = 100;
/** Tables shown in a script's closing snapshot. */
const MAX_SNAPSHOT_TABLES = 20;
/** Rows shown per table in that snapshot. Kept small: the whole snapshot persists on the work record. */
const MAX_SNAPSHOT_ROWS = 50;

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

/**
 * `_` and `%` are LIKE wildcards in the database position of a GRANT, and backticks do not escape
 * them. Namespaced database names are full of underscores, so they must be escaped explicitly or
 * the grant covers far more than the one throwaway database it names.
 */
function escapeGrantDatabase(database: string): string {
  return database.replace(/[_%]/g, (character) => `\\${character}`);
}

/** Classify a statement by its leading verb, to decide what to show the student for it. */
function statementKind(sql: string): SqlStatementResult["kind"] {
  const leading = sql.trimStart().replace(/^\(+/, "").slice(0, 12).toLowerCase();
  if (/^(select|with|show|desc|explain|table|values)/.test(leading)) {
    return "select";
  }
  if (/^(insert|update|delete|replace|merge)/.test(leading)) {
    return "write";
  }
  return "ddl";
}

/**
 * Turn a raw MySQL error into something a student can act on.
 *
 * "Table 'tcp_lab_mtrplj8r_f5a2c6b83d4a.STUDENT' doesn't exist" tells a first-year nothing except
 * that a machine name they have never seen is angry at them — the actual mistake is that the seed
 * created `students`. Listing the tables that do exist turns it into a one-second fix, and the long
 * generated database name is stripped because it is noise to the reader.
 */
async function describeSqlError(error: unknown, connection: mysql.Connection): Promise<string> {
  const err = error as { code?: string; sqlMessage?: string; message?: string };
  const base = (err.sqlMessage ?? err.message ?? "SQL error").replace(/'[a-z0-9_]*_lab_[a-z0-9_]+\./gi, "'");
  if (err.code !== "ER_NO_SUCH_TABLE") {
    return base;
  }
  try {
    const [rows] = await connection.query({ sql: "SHOW TABLES", rowsAsArray: true });
    const tables = Array.isArray(rows) ? (rows as unknown[][]).map((row) => String(row[0])) : [];
    return tables.length === 0
      ? `${base} This database has no tables yet.`
      : `${base} Tables in this database: ${tables.join(", ")}.`;
  } catch {
    return base;
  }
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

  async runScript(input: {
    studentSql: string;
    context: SqlExperimentContext;
    checks?: SqlCheck[];
  }): Promise<SqlScriptResult> {
    const validation = validateStudentScript(input.studentSql, this.config.maxQueryLength, MAX_SCRIPT_STATEMENTS);
    if (!validation.ok || !validation.statements) {
      return {
        ok: false,
        statements: [],
        snapshot: [],
        snapshotTruncated: false,
        error: validation.error,
        timedOut: false,
        runtimeMs: 0,
      };
    }
    const script = validation.statements;

    return this.withRunPermit(() =>
      this.withEphemeralDb(input.context, async (names, owner) => {
        const started = Date.now();
        const { statements, timedOut } = await this.runScriptAsUser(names, script);
        const failure = statements.find((statement) => statement.error !== undefined);

        // The snapshot and the checks describe whatever the student actually built, so they are
        // still worth showing after a statement failed — that is usually the most useful moment.
        const snapshot = await this.captureSnapshot(owner, names.db).catch(() => []);
        const checks =
          input.checks && input.checks.length > 0
            ? await runSqlChecks(owner, names.db, input.checks).catch(() => undefined)
            : undefined;

        return {
          ok: failure === undefined,
          statements,
          snapshot: snapshot.slice(0, MAX_SNAPSHOT_TABLES),
          snapshotTruncated: snapshot.length > MAX_SNAPSHOT_TABLES,
          checks,
          error: failure?.error,
          timedOut,
          runtimeMs: Date.now() - started,
        };
      }),
    ).catch((error) => {
      logServerError("SQL sandbox script run failed", error, { provider: this.provider });
      return {
        ok: false,
        statements: [],
        snapshot: [],
        snapshotTruncated: false,
        error: EXECUTION_SERVICE_UNAVAILABLE_MESSAGE,
        internalError: true,
        timedOut: false,
        runtimeMs: 0,
      };
    });
  }

  /**
   * Execute a script statement by statement as the restricted user, stopping at the first error.
   * One connection is reused so temporary tables and session state survive across statements, which
   * a `CREATE TABLE` / `INSERT` / `SELECT` script depends on.
   */
  private async runScriptAsUser(
    names: EphemeralNames,
    script: string[],
  ): Promise<{ statements: SqlStatementResult[]; timedOut: boolean }> {
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
    const statements: SqlStatementResult[] = [];
    let timedOut = false;
    try {
      await connection.query(`SET SESSION MAX_EXECUTION_TIME = ${this.config.statementTimeoutMs}`);
      await connection.query("SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION'");
      for (const sql of script) {
        const kind = statementKind(sql);
        try {
          const [rows, fields] = await connection.query({
            sql,
            rowsAsArray: true,
            timeout: this.config.statementTimeoutMs + 1000,
          });
          statements.push(
            kind === "select"
              ? { sql, kind, result: this.capture(rows, fields) }
              : { sql, kind, affectedRows: (rows as mysql.ResultSetHeader).affectedRows ?? 0 },
          );
        } catch (error) {
          timedOut = isTimeout(error);
          statements.push({
            sql,
            kind,
            error: timedOut ? "Statement timed out" : await describeSqlError(error, connection),
          });
          break;
        }
      }
    } finally {
      await connection.end().catch(() => undefined);
    }
    return { statements, timedOut };
  }

  /**
   * Every table in the student's database with its columns and first rows — the "print the actual
   * tables" payload. Read as the schema owner so a table the student dropped privileges on, or a
   * view, still reports.
   */
  private async captureSnapshot(owner: mysql.Connection, database: string): Promise<SqlTableSnapshot[]> {
    const [tableRows] = await owner.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
      [database],
    );
    const tables = (tableRows as { TABLE_NAME: string }[]).map((row) => row.TABLE_NAME);

    const [columnRows] = await owner.query(
      "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION",
      [database],
    );
    const columnsByTable = new Map<string, SqlColumnInfo[]>();
    for (const row of columnRows as Array<Record<string, string>>) {
      const list = columnsByTable.get(row.TABLE_NAME) ?? [];
      list.push({
        name: row.COLUMN_NAME,
        dataType: row.COLUMN_TYPE,
        nullable: row.IS_NULLABLE === "YES",
        key: row.COLUMN_KEY,
        extra: row.EXTRA,
      });
      columnsByTable.set(row.TABLE_NAME, list);
    }

    const snapshot: SqlTableSnapshot[] = [];
    for (const table of tables.slice(0, MAX_SNAPSHOT_TABLES)) {
      // Table names come from information_schema, never from user input, so interpolation is safe.
      const [countRows] = await owner.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
      const rowCount = Number((countRows as { n: number }[])[0]?.n ?? 0);
      const [dataRows] = await owner.query({
        sql: `SELECT * FROM \`${table}\` LIMIT ${MAX_SNAPSHOT_ROWS}`,
        rowsAsArray: true,
      });
      snapshot.push({
        name: table,
        columns: columnsByTable.get(table) ?? [],
        rows: Array.isArray(dataRows) ? (dataRows as SqlCell[][]) : [],
        rowCount,
        truncated: rowCount > MAX_SNAPSHOT_ROWS,
      });
    }
    return snapshot;
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
    body: (names: EphemeralNames, owner: mysql.Connection) => Promise<T>,
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
      // In the database position of a GRANT, `_` is a LIKE wildcard and backticks do not escape it,
      // so an unescaped name would grant across every database matching the pattern.
      await admin.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, CREATE TEMPORARY TABLES, LOCK TABLES, CREATE VIEW, SHOW VIEW ON \`${escapeGrantDatabase(names.db)}\`.* TO '${names.user}'@'%'`,
      );
      // The seed and everything the body does run on a connection whose default schema is the
      // throwaway database. `USE` on the pooled connection would instead leave a long-lived pooled
      // connection pointing at a database this `finally` is about to drop.
      const owner = await this.adminConnection(names.db);
      try {
        if (context.schemaSql.trim() !== "") {
          await owner.query(context.schemaSql);
        }
        return await body(names, owner);
      } finally {
        await owner.end().catch(() => undefined);
      }
    } finally {
      await admin.query(`DROP USER IF EXISTS '${names.user}'@'%'`).catch(() => undefined);
      await admin.query(`DROP DATABASE IF EXISTS \`${names.db}\``).catch(() => undefined);
      admin.release();
    }
  }

  /** A short-lived admin connection scoped to one throwaway database. */
  private adminConnection(database: string): Promise<mysql.Connection> {
    return mysql.createConnection({
      host: this.config.host,
      port: this.config.port,
      user: this.config.adminUser,
      password: this.config.adminPassword,
      database,
      multipleStatements: true,
      dateStrings: true,
      connectTimeout: 5000,
      enableKeepAlive: false,
    });
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
      return {
        error: timedOut ? "Query timed out" : await describeSqlError(error, connection),
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
