/**
 * Triggers a client-side file download from in-memory contents.
 *
 * The CSV exports are server-rendered text fetched with `responseType: "text"`, so there is no URL to
 * link to — the blob has to be turned into a download here.
 */
export function downloadTextFile(filename: string, contents: string, mimeType: string): void {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  // Firefox needs the anchor in the document for a synthetic click to register.
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename: string, contents: string): void {
  downloadTextFile(filename, contents, "text/csv;charset=utf-8");
}

export function downloadJson(filename: string, value: unknown): void {
  downloadTextFile(filename, JSON.stringify(value, null, 2), "application/json;charset=utf-8");
}
