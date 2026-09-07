import { getReportBrowser } from "../report/report-pdf";
import { gradeAverage } from "./classroom.model";
import type { ClassroomService } from "./classroom.service";

type Detail = Awaited<ReturnType<ClassroomService["detail"]>>;
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function gradebookCsv(detail: Detail): string {
  const room = detail.classroom;
  const rows: unknown[][] = [
    [
      "Student name",
      "Roll number",
      ...room.experiments.map((e) => `Experiment ${e.number}`),
      "Average / 100",
    ],
  ];
  for (const student of [...(room.members ?? [])].sort((a, b) =>
    a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true }),
  )) {
    const grades = room.experiments.map((e) => ({
      mark:
        room.grades.find(
          (g) => g.email === student.email && g.experimentId === e.id,
        )?.mark ?? null,
    }));
    rows.push([
      student.name,
      student.rollNumber,
      ...grades.map((g) => g.mark),
      gradeAverage(grades),
    ]);
  }
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
export function classroomHistoryHtml(
  detail: Detail,
  email: string,
  selected: string[],
): string {
  const room = detail.classroom;
  const sections = room.sessions
    .filter(
      (s) =>
        s.attendance.some((a) => a.email === email) &&
        (!selected.length || selected.includes(s.id)),
    )
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
    .map((session) => {
      const student = session.attendance.find((a) => a.email === email)!;
      const work = detail.work.filter(
        (w) =>
          w.sessionId === session.id &&
          w.email === email &&
          w.mode === "official" &&
          w.action === "submit",
      );
      const experiments = session.experiments
        .map((experiment) => {
          const submission = work
            .filter((w) => w.experimentId === experiment.id)
            .slice(-1)[0];
          if (!submission) return "";
          const output = submission.output;
          const grid = output?.table;
          return `<article><h3>Experiment ${escape(experiment.number)}: ${escape(experiment.title)}</h3><p>${escape(submission.language)} · Submitted ${escape(new Date(submission.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} IST</p><h4>Code</h4><pre>${escape(submission.code)}</pre><h4>Output — ${escape(output?.status ?? "Pending")}</h4>${grid ? `<table><thead><tr>${grid.columns.map((c) => `<th>${escape(c)}</th>`).join("")}</tr></thead><tbody>${grid.rows.map((row) => `<tr>${row.map((c) => `<td>${escape(c === null ? "NULL" : c)}</td>`).join("")}</tr>`).join("")}</tbody></table>${!grid.rows.length ? "<p>No rows returned.</p>" : ""}` : `<pre>${escape(output?.stdout || (output ? "No standard output." : "Execution result unavailable."))}</pre>`}${output?.stderr ? `<h4>Execution message</h4><pre>${escape(output.stderr)}</pre>` : ""}${output?.truncated || grid?.truncated ? "<p>Output was truncated when captured.</p>" : ""}</article>`;
        })
        .join("");
      return `<section><header><h1>${escape(room.title)}</h1><p><strong>${escape(student.name)}</strong> · Roll no: ${escape(student.rollNumber)} · Batch: ${escape(student.batch)} · Year: ${student.year}</p><h2>${escape(session.title)}</h2><p>${escape(new Date(session.startAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} IST</p></header>${experiments || "<p>No experiments submitted in this session.</p>"}</section>`;
    })
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Lab record</title><style>body{font:11pt Arial;color:#172033}h1{font-size:20pt}h2{font-size:15pt}h3{break-after:avoid}header{border-bottom:2px solid #334155;margin-bottom:20px}section+section{break-before:page}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:9pt monospace;background:#f5f6f8;padding:12px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9pt}th,td{border:1px solid #cbd5e1;padding:5px;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}article{margin-bottom:24px}</style></head><body>${sections || "<p>No attended sessions selected.</p>"}</body></html>`;
}
export async function classroomHistoryPdf(html: string): Promise<Buffer> {
  const page = await (await getReportBrowser()).newPage();
  try {
    await page.route("**/*", (route) => route.abort());
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "15mm", bottom: "18mm", left: "14mm", right: "14mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate:
        '<div style="font:9px Arial;text-align:center;width:100%">Page <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
  } finally {
    await page.close();
  }
}
