export function toCsv(rows: Array<Record<string, string | number | null>>): string {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const escapeValue = (value: string | number | null): string => {
    const raw = value === null ? "" : String(value);
    return `"${raw.replace(/"/g, '""')}"`;
  };

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeValue(row[header] ?? "")).join(",")),
  ].join("\n");
}
