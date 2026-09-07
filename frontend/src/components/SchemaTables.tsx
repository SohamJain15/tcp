import type { ReactNode } from "react";

import type { SqlTableSnapshot } from "@/api/types";
import { SqlResultTable } from "@/components/SqlWorkspace";

/**
 * A seeded SQL schema, rendered as the tables it produces rather than as the DDL that produces them.
 *
 * A student writing a query needs to know that `students` holds Ada and Alan — not to mentally
 * execute a `CREATE TABLE` followed by an `INSERT`. The tables come from the server actually seeding
 * a database, so what is on screen is exactly what the query will run against.
 *
 * Shared by the lab workspace and the SQL practice problem, which get their tables from different
 * places: a problem carries them inline, a lab experiment may have to fetch them. This component
 * only renders — the caller decides where `tables` came from and whether it is still loading.
 */
export function SchemaTables({
  tables,
  schemaSql,
  isLoading = false,
  error = false,
  emptyMessage = "This starts with no tables.",
  heading = "Tables you can query",
  footer,
}: {
  tables?: SqlTableSnapshot[];
  /** Shown as the fallback when the tables are unavailable, and behind a disclosure when they are. */
  schemaSql: string;
  isLoading?: boolean;
  error?: boolean;
  emptyMessage?: string;
  heading?: string;
  footer?: ReactNode;
}) {
  const rawSqlBlock = (
    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded bg-secondary/60 p-3 font-mono-code text-xs">
      {schemaSql}
    </pre>
  );

  return (
    <section className="mt-6">
      <h3 className="mb-1 font-display text-base font-semibold">{heading}</h3>
      {isLoading && <p className="text-sm text-muted-foreground">Preparing the tables…</p>}
      {/* Degrade to the DDL rather than to nothing: an unavailable preview must never leave a
          student unable to see what they are querying. */}
      {error && (
        <>
          <p className="text-sm text-muted-foreground">
            The table preview is unavailable. Here is the schema as SQL.
          </p>
          {rawSqlBlock}
        </>
      )}
      {!isLoading && !error && tables && (
        <>
          {tables.length === 0 ? (
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          ) : (
            <div className="space-y-3">
              {tables.map((table) => (
                <SeedTable key={table.name} table={table} />
              ))}
            </div>
          )}
          {footer}
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Show the SQL that creates this
            </summary>
            {rawSqlBlock}
          </details>
        </>
      )}
    </section>
  );
}

/** One seeded table: its name, its columns with types and keys, and the rows it starts with. */
function SeedTable({ table }: { table: SqlTableSnapshot }) {
  return (
    <div className="rounded border border-border">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-border bg-secondary/40 px-3 py-1.5">
        <span className="font-mono-code text-sm font-semibold">{table.name}</span>
        <span className="text-xs text-muted-foreground">
          {table.rowCount} row{table.rowCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="space-y-2 p-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {table.columns.map((column) => (
            <li key={column.name} className="font-mono-code">
              <span className="text-foreground">{column.name}</span> {column.dataType}
              {column.key === "PRI" && <span className="ml-1 text-accent">PK</span>}
              {column.key === "UNI" && <span className="ml-1 text-accent">UNIQUE</span>}
              {column.key === "MUL" && <span className="ml-1 text-accent">FK</span>}
              {!column.nullable && <span className="ml-1">NOT NULL</span>}
            </li>
          ))}
        </ul>
        {table.rowCount > 0 && (
          <SqlResultTable
            result={{
              columns: table.columns.map((column) => column.name),
              rows: table.rows,
              truncated: table.truncated,
            }}
          />
        )}
      </div>
    </div>
  );
}
