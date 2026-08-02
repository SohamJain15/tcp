import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium, type Browser } from "playwright";

import type {
  ContestAnalytics,
  ContestReportResponse,
  LanguageMetrics,
  OptimalSubmission,
  QuestionMetrics,
} from "./report.model";

export interface ReportPdfSections {
  narrative: boolean;
  questionBreakdown: boolean;
  languageEfficiency: boolean;
  optimalCode: boolean;
  proctoring: boolean;
}

export const DEFAULT_REPORT_PDF_SECTIONS: ReportPdfSections = {
  narrative: true,
  questionBreakdown: true,
  languageEfficiency: true,
  optimalCode: true,
  proctoring: true,
};

export interface ReportPdfOptions {
  subtitle?: string;
  sections?: ReportPdfSections;
}

let browserPromise: Promise<Browser> | null = null;

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "-";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatMemory(kb: number): string {
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function renderBullets(items: string[]): string {
  if (items.length === 0) return `<p class="muted">Nothing to report.</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderTable(headers: string[], rows: string[][], numericFrom = 1): string {
  const head = headers
    .map((header, index) => `<th${index >= numericFrom ? ' class="num"' : ""}>${escapeHtml(header)}</th>`)
    .join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, index) => `<td${index >= numericFrom ? ' class="num"' : ""}>${cell}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderDefinitions(entries: [string, string][]): string {
  return `<dl class="definitions">${entries
    .map(([term, value]) => `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("")}</dl>`;
}

function renderStats(entries: [string, string, string][]): string {
  return `<div class="stats">${entries
    .map(
      ([label, value, hint]) => `<div class="stat">
        <div class="stat-label">${escapeHtml(label)}</div>
        <div class="stat-value">${escapeHtml(value)}</div>
        <div class="stat-hint">${escapeHtml(hint)}</div>
      </div>`,
    )
    .join("")}</div>`;
}

function renderSection(title: string, body: string): string {
  return `<section class="section"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function renderQuestionTable(questions: QuestionMetrics[]): string {
  return renderTable(
    ["Question", "Type", "Points", "Attempted", "Solved", "Solve rate", "Avg attempts", "Avg solve time"],
    questions.map((question) => [
      `<strong>Q${question.questionNumber}</strong> ${escapeHtml(question.title)}`,
      escapeHtml(question.difficulty ? `${question.type} - ${question.difficulty}` : question.type),
      String(question.points),
      String(question.attemptedCount),
      String(question.solvedCount),
      formatPercent(question.solveRate),
      String(question.averageAttempts),
      formatDuration(question.averageTimeToSolveMs),
    ]),
    2,
  );
}

function renderLanguageTable(languages: LanguageMetrics[]): string {
  return renderTable(
    ["Language", "Submissions", "Accepted", "Median runtime", "Median memory", "Sample"],
    languages.map((entry) => [
      escapeHtml(entry.language),
      String(entry.submissionCount),
      `${entry.acceptedCount} (${formatPercent(entry.acceptanceRate)})`,
      entry.confidence === "high" ? `${entry.runtimeMs.median} ms` : "-",
      entry.confidence === "high" ? formatMemory(entry.memoryKb.median) : "-",
      entry.confidence === "high" ? String(entry.sampleSize) : `Too few (${entry.sampleSize})`,
    ]),
  );
}

function renderOptimalSubmission(submission: OptimalSubmission, heading: string): string {
  const rows = submission.breakdown.map((component) => [
    escapeHtml(component.component),
    formatPercent(component.weight),
    String(component.rawValue),
    component.normalized.toFixed(3),
    component.contribution.toFixed(3),
  ]);
  rows.push(["<strong>Total</strong>", "", "", "", `<strong>${submission.totalScore.toFixed(3)}</strong>`]);

  return `<div class="optimal">
    <div class="optimal-kicker">${escapeHtml(heading)}</div>
    <div class="optimal-title">Q${submission.questionNumber} - ${escapeHtml(submission.questionTitle)}</div>
    <div class="muted">${escapeHtml(submission.studentName ?? submission.studentEmail)} - ${escapeHtml(submission.language)}</div>
    ${renderDefinitions([
      ["Runtime", `${submission.runtimeMs} ms (${formatPercent(submission.runtimePercentile)} percentile)`],
      ["Memory", `${formatMemory(submission.memoryKb)} (${formatPercent(submission.memoryPercentile)} percentile)`],
      ["Attempts", String(submission.attemptsCount)],
      ["Solve time", formatDuration(submission.timeToSolveMs)],
      ["Violations", String(submission.violationCount)],
      ["Ranked against", `${submission.percentileBasis} (${submission.percentileSampleSize} submissions)`],
    ])}
    ${renderTable(["Component", "Weight", "Measured", "Normalized", "Contribution"], rows)}
  </div>`;
}

function buildBody(report: ContestReportResponse, options: ReportPdfOptions): string {
  const metrics = report.metrics as ContestAnalytics;
  const narrative = report.narrative;
  const sections = { ...DEFAULT_REPORT_PDF_SECTIONS, ...(options.sections ?? {}) };
  const parts: string[] = [];

  parts.push(`<header class="title-block">
    <div class="report-kicker">TCET CODING PLATFORM / FACULTY REPORT</div>
    <h1>Contest Analysis Report</h1>
    <div class="subtitle">${escapeHtml(metrics.contest.title)}</div>
    ${options.subtitle ? `<p class="muted">${escapeHtml(options.subtitle)}</p>` : ""}
    ${renderDefinitions([
      ["Contest type", metrics.contest.type],
      ["Department", metrics.contest.targetDepartment ?? "All departments"],
      ["Window opens", formatDateTime(metrics.contest.startAt)],
      ["Window closes", formatDateTime(metrics.contest.endAt)],
      ["Attempt duration", `${metrics.contest.durationMinutes} minutes`],
      ["Questions", `${metrics.contest.questionCount} (${metrics.contest.codingQuestionCount} coding)`],
      ["Report generated", formatDateTime(report.generatedAt)],
      ["Narrative source", report.source === "AI" ? `AI narrative (${report.modelId ?? "unknown"})` : "Generated summary"],
    ])}
  </header>`);

  if (sections.narrative && narrative) {
    parts.push(renderSection("Executive summary", `<p class="lede">${escapeHtml(narrative.executiveSummary)}</p>`));
  }

  parts.push(
    renderSection(
      "Participation and scoring",
      renderStats([
        ["Participants", String(metrics.participation.attemptedCount), `${metrics.participation.registeredCount} registered`],
        ["Average score", `${metrics.scores.averageScore} / ${metrics.scores.totalPoints}`, `${metrics.scores.averageScorePercent}% of available`],
        ["Median score", String(metrics.scores.medianScore), `Range ${metrics.scores.minScore}-${metrics.scores.maxScore}`],
        ["Average time", formatDuration(metrics.scores.averageTimeTakenMs), `Limit ${metrics.contest.durationMinutes} min`],
      ]) +
        renderTable(
          ["Measure", "Value"],
          [
            ["Registered", String(metrics.participation.registeredCount)],
            ["Started the contest", String(metrics.participation.attemptedCount)],
            ["Completed", String(metrics.participation.completedCount)],
            ["Registration -> attempt rate", formatPercent(metrics.participation.registrationToAttemptRate)],
            ["Completion rate", formatPercent(metrics.participation.completionRate)],
            ["Score standard deviation", String(metrics.scores.stdDev)],
            ["Median completion time", formatDuration(metrics.scores.medianTimeTakenMs)],
          ],
        ),
    ),
  );

  if (sections.narrative && narrative) {
    parts.push(renderSection("Contest insights", renderBullets(narrative.contestInsights)));
  }

  if (sections.questionBreakdown) {
    const hardest = metrics.hardestQuestion;
    const easiest = metrics.easiestQuestion;
    const context = hardest && easiest
      ? `<p>Hardest: <strong>Q${hardest.questionNumber} ${escapeHtml(hardest.title)}</strong> at ${formatPercent(hardest.solveRate)} solved. Easiest: <strong>Q${easiest.questionNumber} ${escapeHtml(easiest.title)}</strong> at ${formatPercent(easiest.solveRate)} solved.</p>`
      : "";
    parts.push(renderSection("Question breakdown", context + renderQuestionTable(metrics.questions)));
  }

  if (sections.languageEfficiency) {
    const note = metrics.dataQuality.lowSampleLanguages.length > 0
      ? `<p class="note">${escapeHtml(metrics.dataQuality.lowSampleLanguages.join(", "))} had too few accepted submissions to form a reliable baseline. Their runtime and memory figures are withheld.</p>`
      : "";
    parts.push(renderSection("Language efficiency", `<p class="muted">Runtime and memory are compared only against submissions in the same language.</p>${renderLanguageTable(metrics.languages)}${note}`));
  }

  if (sections.optimalCode) {
    const overallId = metrics.optimalCode.overall?.submissionId;
    const optimalParts = [
      `<p class="muted">${escapeHtml(metrics.optimalCode.overallSelectionNote)}</p>`,
      metrics.optimalCode.overall ? renderOptimalSubmission(metrics.optimalCode.overall, "Most optimal overall") : "",
      metrics.optimalCode.perLanguage.length > 0 ? "<h3>Best per language</h3>" : "",
      ...metrics.optimalCode.perLanguage.map((entry) => renderOptimalSubmission(entry, `Best in ${entry.language}`)),
      metrics.optimalCode.perQuestion.length > 0 ? "<h3>Best per question</h3>" : "",
      ...metrics.optimalCode.perQuestion.map((entry) => renderOptimalSubmission(entry, entry.submissionId === overallId ? `Best for Q${entry.questionNumber} (also best overall)` : `Best for Q${entry.questionNumber}`)),
    ].join("");
    parts.push(renderSection("Most optimal code", optimalParts || `<p class="muted">No fully-correct coding submission was recorded.</p>`));
  }

  if (sections.narrative && narrative) {
    parts.push(renderSection("Efficiency observations", renderBullets(narrative.efficiencyObservations)));
    parts.push(renderSection("Student performance", renderBullets(narrative.studentPerformanceObservations)));
  }

  if (sections.proctoring) {
    parts.push(renderSection("Proctoring", renderTable(["Measure", "Value"], [
      ["Total events", String(metrics.violations.totalEvents)],
      ["Average per attempt", String(metrics.violations.averagePerAttempt)],
      ["Attempts with at least one event", String(metrics.violations.attemptsWithViolations)],
    ]) + (metrics.violations.byType.length > 0 ? renderTable(["Event type", "Count"], metrics.violations.byType.map((entry) => [escapeHtml(entry.type.replace(/_/g, " ")), String(entry.count)])) : "") + `<p class="note">This is an observed association, not evidence of cause.</p>`));
  }

  if (sections.narrative && narrative) {
    parts.push(renderSection("Recommendations", renderBullets(narrative.facultyRecommendations)));
  }

  parts.push(renderSection("Methodology and limitations", `<p>Every figure in this report is computed from the platform's contest records. Written sections are checked against those figures before publication.</p><p>Runtime and memory are compared only within a language. The most optimal code ranking is separate from contest grading and includes only fully-correct submissions.</p>${report.metricsHash ? `<p class="muted">Data fingerprint: ${escapeHtml(report.metricsHash.slice(0, 16))}</p>` : ""}`));

  return `<main>${parts.join("\n")}</main>`;
}

function buildStyles(): string {
  return `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    @page { size: A4 portrait; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #172033; font-size: 10pt; line-height: 1.48; }
    main { width: 100%; counter-reset: report-section; }
    h1 { font-size: 24pt; margin: 0 0 2mm; color: #102a43; letter-spacing: -.025em; }
    h2 { font-size: 11.5pt; margin: 8mm 0 3mm; padding: 0 0 1.5mm; border-bottom: .75pt solid #102a43; color: #102a43; text-transform: uppercase; letter-spacing: .07em; break-after: avoid; }
    h2::before { counter-increment: report-section; content: counter(report-section, decimal-leading-zero) "  "; color: #2f6690; }
    h3 { font-size: 10pt; margin: 5mm 0 2mm; color: #102a43; break-after: avoid; }
    p { margin: 0 0 3mm; orphans: 3; widows: 3; }
    ul { margin: 0 0 3mm; padding-left: 5mm; }
    li { margin-bottom: 1.5mm; orphans: 2; widows: 2; }
    .title-block { margin-bottom: 7mm; padding-bottom: 4mm; border-bottom: 2pt solid #d69e2e; break-inside: avoid; }
    .report-kicker { margin-bottom: 2.5mm; color: #2f6690; font-size: 7.5pt; font-weight: 700; letter-spacing: .14em; }
    .subtitle { color: #486581; font-size: 11pt; margin-bottom: 3mm; }
    .muted { color: #627d98; }
    .lede { font-size: 11pt; }
    .definitions { display: grid; grid-template-columns: 34mm 1fr 34mm 1fr; gap: 1.5mm 4mm; margin: 0 0 4mm; font-size: 9pt; }
    .definitions dt { color: #627d98; }
    .definitions dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2.5mm; margin-bottom: 4mm; }
    .stat { border: .75pt solid #bcccdc; border-top: 2pt solid #2f6690; padding: 2.5mm 3mm; break-inside: avoid; background: #f7fafc; }
    .stat-label { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .06em; color: #627d98; }
    .stat-value { font-size: 14pt; font-weight: 700; margin-top: 1mm; color: #102a43; }
    .stat-hint { font-size: 7.5pt; color: #627d98; margin-top: .5mm; }
    table { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 0 0 4mm; font-size: 8.5pt; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    th, td { border-bottom: .5pt solid #d9e2ec; padding: 1.7mm 1.8mm; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #edf2f7; border-bottom: .75pt solid #102a43; font-size: 7.2pt; text-transform: uppercase; letter-spacing: .05em; color: #486581; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; overflow-wrap: normal; }
    .section { break-inside: auto; }
    .optimal { border: .75pt solid #bcccdc; border-left: 2pt solid #2f6690; padding: 3.5mm; margin-bottom: 4mm; break-inside: auto; background: #f8fafc; }
    .optimal-kicker { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .07em; font-weight: 700; color: #486581; }
    .optimal-title { font-size: 11pt; font-weight: 700; margin-top: .5mm; color: #102a43; }
    .note { border-left: 2pt solid #829ab1; padding: 2mm 0 2mm 3mm; font-size: 9pt; color: #486581; }
  `;
}

async function readLogoDataUri(): Promise<string> {
  const candidates = [
    resolve(dirname(__filename), "assets/logo.png"),
    resolve(process.cwd(), "src/modules/report/assets/logo.png"),
    resolve(process.cwd(), "backend/src/modules/report/assets/logo.png"),
  ];
  for (const candidate of candidates) {
    try {
      const data = await readFile(candidate);
      return `data:image/png;base64,${data.toString("base64")}`;
    } catch {
      // Try the next location so both ts-node and compiled deployments work.
    }
  }
  throw new Error("Report logo asset is unavailable");
}

function getBrowser(): Promise<Browser> {
  const systemBrowser = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((candidate) => existsSync(candidate));
  browserPromise ??= chromium.launch({ headless: true, ...(systemBrowser ? { executablePath: systemBrowser } : {}) });
  return browserPromise;
}

export function buildReportHeaderTemplate(title: string, logoDataUri: string): string {
  return `<div style="width:100%;padding:0 14mm 2.5mm;border-bottom:1.2px solid #102a43;display:flex;align-items:center;font-family:Arial,sans-serif;color:#102a43;"><img src="${logoDataUri}" style="width:8.5mm;height:8.5mm;object-fit:contain;margin-right:3mm;"><div style="font-size:10pt;font-weight:700;letter-spacing:.02em;line-height:1.15;">TCET Coding Platform<div style="font-size:6.5pt;font-weight:400;letter-spacing:.12em;color:#627d98;margin-top:1mm;">FACULTY CONTEST REPORT</div></div><div style="margin-left:auto;max-width:75mm;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:8pt;color:#627d98;">${escapeHtml(title)}</div></div>`;
}

export function buildReportFooterTemplate(): string {
  return `<div style="width:100%;padding:2mm 14mm 0;border-top:1px solid #bcccdc;font:7.5pt Arial;color:#627d98;display:flex;justify-content:space-between;"><span>TCET Coding Platform</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
}

export function buildContestReportHtml(report: ContestReportResponse, options: ReportPdfOptions = {}): string {
  const title = escapeHtml(report.metrics?.contest.title ?? "Contest Analysis Report");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>${buildStyles()}</style></head><body>${buildBody(report, options)}</body></html>`;
}

export async function renderContestReportPdf(report: ContestReportResponse, options: ReportPdfOptions = {}): Promise<Buffer> {
  if (!report.metrics) throw new Error("Report metrics are unavailable");
  const logoDataUri = await readLogoDataUri();
  const page = await (await getBrowser()).newPage();
  try {
    await page.setContent(buildContestReportHtml(report, options), { waitUntil: "load" });
    await page.emulateMedia({ media: "print" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: false,
      displayHeaderFooter: true,
      margin: { top: "31mm", right: "14mm", bottom: "20mm", left: "14mm" },
      headerTemplate: buildReportHeaderTemplate(report.metrics.contest.title, logoDataUri),
      footerTemplate: buildReportFooterTemplate(),
    });
  } finally {
    await page.close();
  }
}
