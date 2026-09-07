/**
 * Structural checks for application-based SQL experiments.
 *
 * A query experiment ("select every student ordered by id") can be graded by comparing result
 * grids, because the answer is the data. An application experiment ("create three related tables
 * with a primary key and a foreign key, then populate them") cannot: two students who both did the
 * task correctly will name their tables `students` and `student_tbl`, and diffing their databases
 * against the faculty's reference would fail both. There is no reference to diff against.
 *
 * So instead the faculty declares what must be *true* of whatever the student built, and each check
 * is evaluated against the student's own schema through `information_schema`. `anyTable: true` is
 * the escape hatch that makes a check name-agnostic: it passes if any one of the student's tables
 * satisfies it. Whatever cannot be expressed this way stays a faculty mark — these checks inform
 * the verdict, they do not replace the human.
 */
import type mysql from "mysql2/promise";

import type { SqlCheckResult } from "./sql-executor";

export type SqlCheck =
  /** A table with this name exists. Name matching is case-insensitive. */
  | { type: "tableExists"; label: string; table: string }
  /** At least `min` tables exist (and at most `max`, when given). */
  | { type: "tableCount"; label: string; min?: number; max?: number }
  /** A column exists, optionally of a given SQL data type. */
  | {
      type: "hasColumn";
      label: string;
      column: string;
      dataType?: string;
      table?: string;
      anyTable?: boolean;
    }
  /** A PRIMARY KEY / FOREIGN KEY / UNIQUE / NOT NULL / CHECK / INDEX constraint is present. */
  | {
      type: "hasConstraint";
      label: string;
      constraint: "PRIMARY KEY" | "FOREIGN KEY" | "UNIQUE" | "NOT NULL" | "CHECK" | "INDEX";
      table?: string;
      anyTable?: boolean;
      /** For NOT NULL and CHECK, the column the constraint must sit on. */
      column?: string;
    }
  /** A table holds at least `min` rows. */
  | { type: "rowCount"; label: string; min: number; max?: number; table?: string; anyTable?: boolean }
  /** A verification query the faculty writes; it must return between `minRows` and `maxRows`. */
  | { type: "queryReturns"; label: string; sql: string; minRows?: number; maxRows?: number };

export const SQL_CHECK_TYPES = [
  "tableExists",
  "tableCount",
  "hasColumn",
  "hasConstraint",
  "rowCount",
  "queryReturns",
] as const;

interface ColumnRow {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  DATA_TYPE: string;
  IS_NULLABLE: string;
  COLUMN_KEY: string;
  EXTRA: string;
}

interface ConstraintRow {
  TABLE_NAME: string;
  CONSTRAINT_TYPE: string;
  COLUMN_NAME: string | null;
}

/** Everything the checks read, fetched once so 30 checks cost one round trip each, not three. */
interface SchemaFacts {
  tables: string[];
  columns: ColumnRow[];
  constraints: ConstraintRow[];
  checkConstraintTables: string[];
  rowCounts: Map<string, number>;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

async function loadSchemaFacts(admin: mysql.Connection, database: string): Promise<SchemaFacts> {
  const [tableRows] = await admin.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
    [database],
  );
  const tables = (tableRows as { TABLE_NAME: string }[]).map((row) => row.TABLE_NAME);

  const [columnRows] = await admin.query(
    "SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?",
    [database],
  );

  // KEY_COLUMN_USAGE carries the column a key sits on; TABLE_CONSTRAINTS carries its type. Joining
  // them gives "this column participates in a FOREIGN KEY" rather than only "this table has one".
  const [constraintRows] = await admin.query(
    `SELECT tc.TABLE_NAME, tc.CONSTRAINT_TYPE, kcu.COLUMN_NAME
       FROM information_schema.TABLE_CONSTRAINTS tc
       LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu
         ON kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
        AND kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
        AND kcu.TABLE_NAME = tc.TABLE_NAME
      WHERE tc.TABLE_SCHEMA = ?`,
    [database],
  );

  // CHECK constraints live in their own table on MySQL 8 and are absent on older servers, so a
  // failure here degrades to "no CHECK constraints found" rather than failing the whole run.
  let checkConstraintTables: string[] = [];
  try {
    const [checkRows] = await admin.query(
      `SELECT DISTINCT tc.TABLE_NAME
         FROM information_schema.TABLE_CONSTRAINTS tc
        WHERE tc.TABLE_SCHEMA = ? AND tc.CONSTRAINT_TYPE = 'CHECK'`,
      [database],
    );
    checkConstraintTables = (checkRows as { TABLE_NAME: string }[]).map((row) => row.TABLE_NAME);
  } catch {
    checkConstraintTables = [];
  }

  // information_schema.TABLES.TABLE_ROWS is an InnoDB estimate and is routinely wrong, so count
  // for real. Table names come from information_schema, never from user input.
  const rowCounts = new Map<string, number>();
  for (const table of tables) {
    try {
      const [rows] = await admin.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
      rowCounts.set(table, Number((rows as { n: number }[])[0]?.n ?? 0));
    } catch {
      rowCounts.set(table, 0);
    }
  }

  return { tables, columns: columnRows as ColumnRow[], constraints: constraintRows as ConstraintRow[], checkConstraintTables, rowCounts };
}

/** The tables a check applies to: one named table, or every table when `anyTable` is set. */
function targetTables(
  facts: SchemaFacts,
  check: { table?: string; anyTable?: boolean },
): { tables: string[]; missing?: string } {
  if (check.table && !check.anyTable) {
    const match = facts.tables.find((table) => same(table, check.table!));
    return match ? { tables: [match] } : { tables: [], missing: check.table };
  }
  return { tables: facts.tables };
}

function describeScope(check: { table?: string; anyTable?: boolean }): string {
  return check.table && !check.anyTable ? `table "${check.table}"` : "any table";
}

function evaluateSchemaCheck(check: SqlCheck, facts: SchemaFacts): SqlCheckResult {
  switch (check.type) {
    case "tableExists": {
      const passed = facts.tables.some((table) => same(table, check.table));
      return {
        label: check.label,
        passed,
        detail: passed
          ? undefined
          : facts.tables.length === 0
            ? "no tables were created"
            : `no table named "${check.table}" — found: ${facts.tables.join(", ")}`,
      };
    }

    case "tableCount": {
      const count = facts.tables.length;
      const belowMin = check.min !== undefined && count < check.min;
      const aboveMax = check.max !== undefined && count > check.max;
      return {
        label: check.label,
        passed: !belowMin && !aboveMax,
        detail: belowMin || aboveMax ? `${count} table${count === 1 ? "" : "s"} created` : undefined,
      };
    }

    case "hasColumn": {
      const { tables, missing } = targetTables(facts, check);
      if (missing) {
        return { label: check.label, passed: false, detail: `table "${missing}" does not exist` };
      }
      const match = facts.columns.find(
        (column) =>
          tables.some((table) => same(table, column.TABLE_NAME)) &&
          same(column.COLUMN_NAME, check.column) &&
          (check.dataType === undefined || same(column.DATA_TYPE, check.dataType)),
      );
      return {
        label: check.label,
        passed: match !== undefined,
        detail: match
          ? undefined
          : `${describeScope(check)} has no ${check.dataType ? `${check.dataType.toUpperCase()} ` : ""}column named "${check.column}"`,
      };
    }

    case "hasConstraint": {
      const { tables, missing } = targetTables(facts, check);
      if (missing) {
        return { label: check.label, passed: false, detail: `table "${missing}" does not exist` };
      }
      const inScope = (table: string) => tables.some((candidate) => same(candidate, table));
      const columnMatches = (column: string | null) =>
        check.column === undefined || (column !== null && same(column, check.column));

      let passed = false;
      if (check.constraint === "NOT NULL") {
        passed = facts.columns.some(
          (column) =>
            inScope(column.TABLE_NAME) && column.IS_NULLABLE === "NO" && columnMatches(column.COLUMN_NAME),
        );
      } else if (check.constraint === "INDEX") {
        passed = facts.columns.some(
          (column) => inScope(column.TABLE_NAME) && column.COLUMN_KEY !== "" && columnMatches(column.COLUMN_NAME),
        );
      } else if (check.constraint === "CHECK") {
        passed = facts.checkConstraintTables.some((table) => inScope(table));
      } else {
        passed = facts.constraints.some(
          (constraint) =>
            inScope(constraint.TABLE_NAME) &&
            constraint.CONSTRAINT_TYPE === check.constraint &&
            columnMatches(constraint.COLUMN_NAME),
        );
      }
      return {
        label: check.label,
        passed,
        detail: passed
          ? undefined
          : `${describeScope(check)} has no ${check.constraint}${check.column ? ` on "${check.column}"` : ""}`,
      };
    }

    case "rowCount": {
      const { tables, missing } = targetTables(facts, check);
      if (missing) {
        return { label: check.label, passed: false, detail: `table "${missing}" does not exist` };
      }
      const withinRange = (count: number) =>
        count >= check.min && (check.max === undefined || count <= check.max);
      const passed = tables.some((table) => withinRange(facts.rowCounts.get(table) ?? 0));
      const largest = tables.reduce((best, table) => Math.max(best, facts.rowCounts.get(table) ?? 0), 0);
      return {
        label: check.label,
        passed,
        detail: passed ? undefined : `the fullest table in scope holds ${largest} row${largest === 1 ? "" : "s"}`,
      };
    }

    default:
      return { label: (check as SqlCheck).label, passed: false, detail: "unsupported check" };
  }
}

/**
 * Run every check against the student's finished database. Faculty-authored `queryReturns` SQL is
 * executed as the admin against that same database; a query referencing a table the student never
 * created fails the check with the SQL error rather than aborting the run.
 */
export async function runSqlChecks(
  admin: mysql.Connection,
  database: string,
  checks: SqlCheck[],
): Promise<SqlCheckResult[]> {
  if (checks.length === 0) {
    return [];
  }
  const facts = await loadSchemaFacts(admin, database);
  const results: SqlCheckResult[] = [];

  for (const check of checks) {
    if (check.type !== "queryReturns") {
      results.push(evaluateSchemaCheck(check, facts));
      continue;
    }
    try {
      const [rows] = await admin.query({ sql: check.sql, rowsAsArray: true });
      const count = Array.isArray(rows) ? rows.length : 0;
      const min = check.minRows ?? 1;
      const passed = count >= min && (check.maxRows === undefined || count <= check.maxRows);
      results.push({
        label: check.label,
        passed,
        detail: passed ? undefined : `the verification query returned ${count} row${count === 1 ? "" : "s"}`,
      });
    } catch (error) {
      const err = error as { sqlMessage?: string; message?: string };
      results.push({
        label: check.label,
        passed: false,
        detail: err.sqlMessage ?? err.message ?? "the verification query could not run",
      });
    }
  }

  return results;
}
