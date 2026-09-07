import type { SqlResultSet } from "@/api/types";

export function SqlResultTable({ result }: { result: SqlResultSet }) {
  if (result.columns.length === 0) {
    return <p className="text-sm text-muted-foreground">Query ran, but returned no columns.</p>;
  }
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50">
            {result.columns.map((column, index) => (
              <th key={index} className="border-b border-border px-3 py-1.5 text-left font-semibold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="odd:bg-muted/20">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border-b border-border px-3 py-1.5 font-mono-code">
                  {cell === null ? <span className="text-muted-foreground italic">NULL</span> : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.truncated && (
        <p className="px-3 py-1.5 text-xs text-muted-foreground">Showing the first {result.rows.length} rows.</p>
      )}
      {result.rows.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No rows.</p>}
    </div>
  );
}
