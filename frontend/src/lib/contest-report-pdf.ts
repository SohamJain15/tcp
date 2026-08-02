import type {
  ContestAnalytics,
  ContestReport,
  OptimalSubmission,
  ReportQuestionMetrics,
} from "@/api/types";

/**
 * Builds a self-contained, print-ready HTML document for a contest report and opens it for printing.
 *
 * Deliberately not jsPDF/html2canvas: those rasterise the page, producing a PDF whose text cannot be
 * selected, searched, or read by a screen reader, at whatever resolution the canvas happened to use.
 * Printing real HTML keeps the text as text and gives full control over pagination in CSS.
 *
 * Three browser realities shape the stylesheet, and getting any of them wrong is what makes a
 * generated PDF look amateur:
 *
 *  1. Chrome prints with "Background graphics" OFF by default. Nothing here may depend on a fill
 *     colour to be legible — hierarchy comes from rules, weight, and spacing.
 *  2. `position: fixed` elements repeat on every printed page in Chrome. That is how the running
 *     header and footer are done; CSS paged-media margin boxes are not implemented, so there is no
 *     way to number pages without a pagination library.
 *  3. Images must be embedded before printing. A linked `/logo.png` can lose the race with the print
 *     dialog and silently yield a logo-less PDF, so the logo is inlined as a data URI first.
 */

export interface ContestReportPrintSections {
  narrative: boolean;
  questionBreakdown: boolean;
  languageEfficiency: boolean;
  optimalCode: boolean;
  proctoring: boolean;
}

export const DEFAULT_PRINT_SECTIONS: ContestReportPrintSections = {
  narrative: true,
  questionBreakdown: true,
  languageEfficiency: true,
  optimalCode: true,
  proctoring: true,
};

export interface ContestReportPrintInput {
  report: ContestReport;
  metrics: ContestAnalytics;
  /** Optional line under the title, e.g. "Prepared for the Department Review Committee". */
  subtitle?: string;
  sections?: ContestReportPrintSections;
  logoDataUri?: string | null;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Reports are persisted, so a stored `metrics` blob can predate any field added since it was written
 * — `optimalCode.perLanguage` did not exist in the first release. Reading `.length` off the missing
 * array throws, and the caller's swallowed rejection turns that into a blank print window with no
 * explanation. Normalising once here keeps every renderer below free of `?.` noise.
 */
function normalizeMetrics(metrics: ContestAnalytics): ContestAnalytics {
  return {
    ...metrics,
    questions: metrics.questions ?? [],
    languages: metrics.languages ?? [],
    optimalCode: {
      ...metrics.optimalCode,
      perQuestion: metrics.optimalCode?.perQuestion ?? [],
      perLanguage: metrics.optimalCode?.perLanguage ?? [],
      overall: metrics.optimalCode?.overall ?? null,
      overallSelectionNote: metrics.optimalCode?.overallSelectionNote ?? "",
    },
    violations: {
      ...metrics.violations,
      byType: metrics.violations?.byType ?? [],
      scoreByViolationBand: metrics.violations?.scoreByViolationBand ?? [],
    },
    dataQuality: {
      ...metrics.dataQuality,
      lowSampleLanguages: metrics.dataQuality?.lowSampleLanguages ?? [],
      percentileBasisNotes: metrics.dataQuality?.percentileBasisNotes ?? [],
      excludedFromRanking: metrics.dataQuality?.excludedFromRanking ?? [],
    },
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) {
    return "—";
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatMemory(kb: number): string {
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

// ---------------------------------------------------------------------------
// Fragments
// ---------------------------------------------------------------------------

function renderBullets(items: string[]): string {
  if (items.length === 0) {
    return `<p class="muted">Nothing to report.</p>`;
  }
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

/**
 * Headers are escaped here; **cells are inserted as raw HTML** so callers can emit `<strong>`.
 * Every caller must therefore run `escapeHtml` on any value that originates from user or student
 * data — contest titles, question titles, student names, languages.
 */
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

function renderSection(title: string, body: string, options: { pageBreak?: boolean } = {}): string {
  return `<section class="section${options.pageBreak ? " page-break" : ""}">
    <h2>${escapeHtml(title)}</h2>
    ${body}
  </section>`;
}

function renderDefinitionGrid(entries: [string, string][]): string {
  return `<dl class="definitions">${entries
    .map(([term, value]) => `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("")}</dl>`;
}

function renderStatRow(entries: [string, string, string?][]): string {
  return `<div class="stats">${entries
    .map(
      ([label, value, hint]) => `<div class="stat">
        <div class="stat-label">${escapeHtml(label)}</div>
        <div class="stat-value">${escapeHtml(value)}</div>
        ${hint ? `<div class="stat-hint">${escapeHtml(hint)}</div>` : ""}
      </div>`,
    )
    .join("")}</div>`;
}

function renderQuestionTable(questions: ReportQuestionMetrics[]): string {
  return renderTable(
    ["Question", "Type", "Points", "Attempted", "Solved", "Solve rate", "Avg attempts", "Avg solve time"],
    questions.map((question) => [
      `<strong>Q${question.questionNumber}</strong> ${escapeHtml(question.title)}`,
      escapeHtml(question.difficulty ? `${question.type} · ${question.difficulty}` : question.type),
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

function renderOptimalSubmission(submission: OptimalSubmission, heading: string): string {
  const breakdownRows = submission.breakdown.map((component) => [
    escapeHtml(component.component),
    formatPercent(component.weight),
    String(component.rawValue),
    component.normalized.toFixed(3),
    component.contribution.toFixed(3),
  ]);
  breakdownRows.push([
    "<strong>Total</strong>",
    "",
    "",
    "",
    `<strong>${submission.totalScore.toFixed(3)}</strong>`,
  ]);

  return `<div class="optimal">
    <div class="optimal-head">
      <div>
        <div class="optimal-kicker">${escapeHtml(heading)}</div>
        <div class="optimal-title">Q${submission.questionNumber} · ${escapeHtml(submission.questionTitle)}</div>
        <div class="muted">${escapeHtml(submission.studentName ?? submission.studentEmail)} · ${escapeHtml(
          submission.language,
        )}</div>
      </div>
    </div>
    ${renderDefinitionGrid([
      ["Runtime", `${submission.runtimeMs} ms (${formatPercent(submission.runtimePercentile)} percentile)`],
      ["Memory", `${formatMemory(submission.memoryKb)} (${formatPercent(submission.memoryPercentile)} percentile)`],
      ["Attempts", String(submission.attemptsCount)],
      ["Solve time", formatDuration(submission.timeToSolveMs)],
      ["Violations", String(submission.violationCount)],
      ["Ranked against", `${submission.percentileBasis} (${submission.percentileSampleSize} submissions)`],
    ])}
    ${renderTable(["Component", "Weight", "Measured", "Normalized", "Contribution"], breakdownRows, 1)}
  </div>`;
}

// ---------------------------------------------------------------------------
// Stylesheet
// ---------------------------------------------------------------------------

const HEADER_HEIGHT_MM = 16;
const FOOTER_HEIGHT_MM = 10;

function buildStyles(): string {
  return `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif;
      color: #111827;
      background: #ffffff;
      font-size: 10.5pt;
      line-height: 1.5;
      /* Room for the fixed running header and footer, which overlay every page. */
      padding: ${HEADER_HEIGHT_MM + 6}mm 0 ${FOOTER_HEIGHT_MM + 4}mm;
    }

    @page { size: A4; margin: 12mm 14mm; }

    /* Chrome repeats fixed elements on every printed page — this is the running header/footer. */
    .running-header, .running-footer { position: fixed; left: 0; right: 0; }
    .running-header {
      top: 0;
      height: ${HEADER_HEIGHT_MM}mm;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1.5pt solid #111827;
      padding-bottom: 3mm;
    }
    .running-header img { width: 11mm; height: 11mm; object-fit: contain; }
    .brand { font-size: 12pt; font-weight: 700; letter-spacing: .01em; }
    .brand-sub { font-size: 7.5pt; color: #4b5563; letter-spacing: .08em; text-transform: uppercase; }
    .header-right {
      margin-left: auto; text-align: right; font-size: 8pt; color: #4b5563; max-width: 70mm;
      /* Contest titles can be a full sentence; clamp so a long one cannot push the header past its
         fixed height and overlap the first line of body text on every page. */
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .running-footer {
      bottom: 0;
      height: ${FOOTER_HEIGHT_MM}mm;
      border-top: .5pt solid #9ca3af;
      padding-top: 2mm;
      display: flex;
      justify-content: space-between;
      font-size: 7.5pt;
      color: #6b7280;
    }

    h1 { font-size: 20pt; margin: 0 0 2mm; letter-spacing: -.01em; }
    h2 {
      font-size: 12pt; margin: 8mm 0 3mm; padding-bottom: 1.5mm;
      border-bottom: .75pt solid #111827; text-transform: uppercase; letter-spacing: .06em;
    }
    h3 { font-size: 10pt; margin: 5mm 0 2mm; }
    p { margin: 0 0 3mm; orphans: 3; widows: 3; }
    ul { margin: 0 0 3mm; padding-left: 5mm; }
    li { margin-bottom: 1.5mm; orphans: 2; widows: 2; }
    .muted { color: #6b7280; }
    .lede { font-size: 11pt; }

    .title-block { margin-bottom: 6mm; }
    .subtitle { color: #4b5563; font-size: 11pt; margin-bottom: 3mm; }

    .definitions {
      display: grid; grid-template-columns: 34mm 1fr 34mm 1fr;
      gap: 1.5mm 4mm; margin: 0 0 4mm; font-size: 9.5pt;
    }
    .definitions dt { color: #6b7280; }
    .definitions dd { margin: 0; font-weight: 600; }

    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin-bottom: 4mm; }
    .stat { border: .75pt solid #d1d5db; border-left: 2pt solid #111827; padding: 2.5mm 3mm; }
    .stat-label { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; }
    .stat-value { font-size: 14pt; font-weight: 700; margin-top: 1mm; }
    .stat-hint { font-size: 7.5pt; color: #6b7280; margin-top: .5mm; }

    table { width: 100%; border-collapse: collapse; margin: 0 0 4mm; font-size: 9pt; }
    /* Long tables repeat their header row on every page they span. */
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    th, td { border-bottom: .5pt solid #d1d5db; padding: 1.6mm 2mm; text-align: left; vertical-align: top; }
    th {
      border-bottom: .75pt solid #111827; font-size: 7.5pt;
      text-transform: uppercase; letter-spacing: .05em; color: #374151;
    }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }

    .section { break-inside: auto; }
    .page-break { break-before: page; }
    .optimal { border: .75pt solid #d1d5db; padding: 3mm; margin-bottom: 4mm; break-inside: avoid; }
    .optimal-head { margin-bottom: 2.5mm; }
    .optimal-kicker {
      font-size: 7.5pt; text-transform: uppercase; letter-spacing: .07em;
      font-weight: 700; color: #374151;
    }
    .optimal-title { font-size: 11pt; font-weight: 700; margin-top: .5mm; }

    .note { border-left: 2pt solid #9ca3af; padding: 2mm 0 2mm 3mm; font-size: 9pt; color: #374151; }
    .toolbar { margin-bottom: 6mm; }
    .toolbar button {
      font: inherit; padding: 2mm 4mm; border: 1pt solid #111827;
      background: #111827; color: #fff; cursor: pointer;
    }
    @media print { .toolbar { display: none; } }
  `;
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export function buildContestReportHtml(input: ContestReportPrintInput): string {
  const { report, subtitle } = input;
  const metrics = normalizeMetrics(input.metrics);
  const sections = input.sections ?? DEFAULT_PRINT_SECTIONS;
  const narrative = report.narrative;

  const sourceLabel =
    report.source === "AI" && report.modelId
      ? `AI narrative (${report.modelId})`
      : "Generated summary (no model)";

  const parts: string[] = [];

  parts.push(`<div class="title-block">
    <h1>Contest Analysis Report</h1>
    <div class="subtitle">${escapeHtml(metrics.contest.title)}</div>
    ${subtitle ? `<p class="muted">${escapeHtml(subtitle)}</p>` : ""}
    ${renderDefinitionGrid([
      ["Contest type", metrics.contest.type],
      ["Department", metrics.contest.targetDepartment ?? "All departments"],
      ["Window opens", formatDateTime(metrics.contest.startAt)],
      ["Window closes", formatDateTime(metrics.contest.endAt)],
      ["Attempt duration", `${metrics.contest.durationMinutes} minutes`],
      ["Questions", `${metrics.contest.questionCount} (${metrics.contest.codingQuestionCount} coding)`],
      ["Report generated", formatDateTime(report.generatedAt)],
      ["Narrative source", sourceLabel],
    ])}
  </div>`);

  if (sections.narrative && narrative) {
    parts.push(
      renderSection(
        "Executive summary",
        `<p class="lede">${escapeHtml(narrative.executiveSummary)}</p>`,
      ),
    );
  }

  parts.push(
    renderSection(
      "Participation and scoring",
      renderStatRow([
        [
          "Participants",
          String(metrics.participation.attemptedCount),
          `${metrics.participation.registeredCount} registered`,
        ],
        [
          "Average score",
          `${metrics.scores.averageScore} / ${metrics.scores.totalPoints}`,
          `${metrics.scores.averageScorePercent}% of available`,
        ],
        ["Median score", String(metrics.scores.medianScore), `Range ${metrics.scores.minScore}–${metrics.scores.maxScore}`],
        ["Average time", formatDuration(metrics.scores.averageTimeTakenMs), `Limit ${metrics.contest.durationMinutes} min`],
      ]) +
        renderTable(
          ["Measure", "Value"],
          [
            ["Registered", String(metrics.participation.registeredCount)],
            ["Started the contest", String(metrics.participation.attemptedCount)],
            ["Completed", String(metrics.participation.completedCount)],
            ["Registration → attempt rate", formatPercent(metrics.participation.registrationToAttemptRate)],
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
    parts.push(
      renderSection(
        "Question breakdown",
        (hardest && easiest
          ? `<p>Hardest: <strong>Q${hardest.questionNumber} ${escapeHtml(
              hardest.title,
            )}</strong> at ${formatPercent(hardest.solveRate)} solved. Easiest: <strong>Q${
              easiest.questionNumber
            } ${escapeHtml(easiest.title)}</strong> at ${formatPercent(easiest.solveRate)} solved.</p>`
          : "") + renderQuestionTable(metrics.questions),
        { pageBreak: true },
      ),
    );
  }

  if (sections.languageEfficiency) {
    parts.push(
      renderSection(
        "Language efficiency",
        `<p class="muted">Each language is compared only against its own baseline. Runtime is never
          compared across languages, so a Python figure is not slower "than C++" — it is only faster or
          slower than other Python submissions.</p>` +
          renderTable(
            ["Language", "Submissions", "Accepted", "Median runtime", "Median memory", "Sample"],
            metrics.languages.map((entry) => [
              escapeHtml(entry.language),
              String(entry.submissionCount),
              `${entry.acceptedCount} (${formatPercent(entry.acceptanceRate)})`,
              entry.confidence === "high" ? `${entry.runtimeMs.median} ms` : "—",
              entry.confidence === "high" ? formatMemory(entry.memoryKb.median) : "—",
              entry.confidence === "high" ? String(entry.sampleSize) : `Too few (${entry.sampleSize})`,
            ]),
          ) +
          (metrics.dataQuality.lowSampleLanguages.length > 0
            ? `<p class="note">${escapeHtml(
                metrics.dataQuality.lowSampleLanguages.join(", "),
              )} had too few accepted submissions to form a reliable baseline. Their runtime and memory
              figures are withheld and they are excluded from the overall optimal pick.</p>`
            : ""),
      ),
    );
  }

  if (sections.optimalCode) {
    const overallId = metrics.optimalCode.overall?.submissionId;
    const perLanguage = metrics.optimalCode.perLanguage;
    const perQuestion = metrics.optimalCode.perQuestion;

    const body = [
      `<p class="muted">${escapeHtml(metrics.optimalCode.overallSelectionNote)}</p>`,
      metrics.optimalCode.overall
        ? renderOptimalSubmission(metrics.optimalCode.overall, "Most optimal overall")
        : "",
      perLanguage.length > 0 ? "<h3>Best per language</h3>" : "",
      perLanguage
        .map((entry) => renderOptimalSubmission(entry, `Best in ${entry.language}`))
        .join(""),
      perQuestion.length > 0 ? "<h3>Best per question</h3>" : "",
      // Every question gets an entry even when its winner is also the overall winner — a gap in the
      // sequence reads as "no one solved Q1", which would be wrong. The kicker distinguishes them.
      perQuestion
        .map((entry) =>
          renderOptimalSubmission(
            entry,
            entry.submissionId === overallId
              ? `Best for Q${entry.questionNumber} (also best overall)`
              : `Best for Q${entry.questionNumber}`,
          ),
        )
        .join(""),
      perQuestion.length === 0
        ? `<p class="muted">No fully-correct coding submission was recorded, so no optimal submission could be selected.</p>`
        : "",
    ].join("");

    parts.push(renderSection("Most optimal code", body, { pageBreak: true }));
  }

  if (sections.narrative && narrative) {
    parts.push(
      renderSection("Efficiency observations", renderBullets(narrative.efficiencyObservations)),
    );
    parts.push(
      renderSection("Student performance", renderBullets(narrative.studentPerformanceObservations)),
    );
  }

  if (sections.proctoring) {
    parts.push(
      renderSection(
        "Proctoring",
        renderTable(
          ["Measure", "Value"],
          [
            ["Total events", String(metrics.violations.totalEvents)],
            ["Average per attempt", String(metrics.violations.averagePerAttempt)],
            ["Attempts with at least one event", String(metrics.violations.attemptsWithViolations)],
          ],
        ) +
          (metrics.violations.byType.length > 0
            ? renderTable(
                ["Event type", "Count"],
                metrics.violations.byType.map((entry) => [
                  escapeHtml(entry.type.replace(/_/g, " ")),
                  String(entry.count),
                ]),
              )
            : "") +
          renderTable(
            ["Violations", "Attempts", "Average score"],
            metrics.violations.scoreByViolationBand.map((entry) => [
              escapeHtml(entry.band),
              String(entry.attemptCount),
              String(entry.averageScore),
            ]),
          ) +
          `<p class="note">This is an observed association, not evidence of cause. Violation penalties
            are already deducted from each student's score.</p>`,
      ),
    );
  }

  if (sections.narrative && narrative) {
    parts.push(
      renderSection("Recommendations", renderBullets(narrative.facultyRecommendations)),
    );
  }

  // Closing methodology note. This is what makes the report defensible if a student disputes it.
  const methodology = [
    `<p>Every figure in this report is computed from the platform's own contest records. ${
      report.source === "AI"
        ? `The written sections were phrased by a locally-run model (${escapeHtml(
            report.modelId ?? "unknown",
          )}) that receives only those computed figures — it performs no calculation and is checked against the data before publication.`
        : "The written sections were assembled from templates directly from those figures; no language model was involved."
    }</p>`,
    `<p>Runtime and memory are compared only within a language. Rankings use percentiles inside each
      language's own distribution, so no language is penalised for the speed of its runtime.</p>`,
    `<p>"Most optimal code" measures efficiency only, among submissions that passed every test case.
      It is not a grade: contest scores are calculated separately from test cases passed minus the
      proctoring violation penalty, and violations do not affect the efficiency ranking.</p>`,
    metrics.dataQuality.percentileBasisNotes.length > 0
      ? `<p class="muted">Data notes: ${escapeHtml(metrics.dataQuality.percentileBasisNotes.join(" "))}</p>`
      : "",
    report.warnings.length > 0
      ? `<p class="muted">Generation notes: ${escapeHtml(report.warnings.join(" "))}</p>`
      : "",
    report.metricsHash
      ? `<p class="muted">Data fingerprint: ${escapeHtml(report.metricsHash.slice(0, 16))}. Two reports
          sharing a fingerprint were produced from identical contest data.</p>`
      : "",
  ].join("");

  parts.push(renderSection("Methodology and limitations", methodology));

  const logo = input.logoDataUri
    ? `<img src="${escapeHtml(input.logoDataUri)}" alt="" />`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Contest Analysis Report — ${escapeHtml(metrics.contest.title)}</title>
    <style>${buildStyles()}</style>
  </head>
  <body>
    <div class="running-header">
      ${logo}
      <div>
        <div class="brand">TCET Coding Platform</div>
        <div class="brand-sub">Contest Analysis Report</div>
      </div>
      <div class="header-right">${escapeHtml(metrics.contest.title)}</div>
    </div>

    <div class="running-footer">
      <span>Generated ${escapeHtml(formatDateTime(report.generatedAt))}</span>
      <span>${escapeHtml(
        report.metricsHash ? `Data fingerprint ${report.metricsHash.slice(0, 12)}` : "TCET Coding Platform",
      )}</span>
    </div>

    <div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button></div>
    ${parts.join("\n")}
  </body>
</html>`;
}

// ---------------------------------------------------------------------------
// Logo + open
// ---------------------------------------------------------------------------

let cachedLogo: string | null | undefined;

/**
 * Reads the logo into a data URI so the print document carries no network dependency.
 *
 * Note `public/logo.png` is JPEG data despite the extension — `FileReader` reads the real MIME type
 * off the blob, so the produced URI is correct regardless of what the file is called.
 */
export async function loadLogoDataUri(): Promise<string | null> {
  if (cachedLogo !== undefined) {
    return cachedLogo;
  }

  try {
    const response = await fetch("/logo.png");
    if (!response.ok) {
      cachedLogo = null;
      return null;
    }
    const blob = await response.blob();
    cachedLogo = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    return cachedLogo;
  } catch {
    // A missing logo must never block the report — the header degrades to the wordmark alone.
    cachedLogo = null;
    return null;
  }
}

export type PrintViewResult = "opened" | "popup-blocked" | "failed";

export async function openContestReportPrintView(
  input: Omit<ContestReportPrintInput, "logoDataUri">,
): Promise<PrintViewResult> {
  // Opened synchronously, before any await. A popup requested after the click's call stack has
  // unwound has lost its user activation and Chrome blocks it.
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    return "popup-blocked";
  }

  // Something to look at while the logo loads, and — more importantly — proof the window is ours,
  // so a later failure replaces this rather than leaving a bare about:blank.
  printWindow.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>Preparing report…</title></head>
     <body style="font-family:system-ui,sans-serif;color:#374151;padding:40px">Preparing report…</body></html>`,
  );

  try {
    const logoDataUri = await loadLogoDataUri();
    const html = buildContestReportHtml({ ...input, logoDataUri });

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();

    // The logo is already inlined, so layout is settled; a beat is enough for the document to paint
    // before the print dialog takes over.
    printWindow.setTimeout(() => printWindow.print(), 200);
    return "opened";
  } catch (error) {
    // Never strand the user on a blank tab wondering what happened.
    printWindow.document.open();
    printWindow.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>Report could not be prepared</title></head>
       <body style="font-family:system-ui,sans-serif;color:#374151;padding:40px;line-height:1.6">
         <h1 style="font-size:18px;margin:0 0 8px">The report could not be prepared</h1>
         <p style="margin:0 0 8px">${escapeHtml(
           error instanceof Error ? error.message : "Unknown error",
         )}</p>
         <p style="margin:0;color:#6b7280">Try regenerating the report, then export again.</p>
       </body></html>`,
    );
    printWindow.document.close();
    return "failed";
  }
}
