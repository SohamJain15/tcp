import type { Request, Response } from "express";
import { z } from "zod";

import type { ReportService } from "./report.service";
import {
  DEFAULT_REPORT_PDF_SECTIONS,
  renderContestReportPdf,
  type ReportPdfSections,
} from "./report-pdf";
import { generateReportSchema } from "./report.validator";

const routeIdSchema = z.string().regex(/^[a-z0-9_-]{4,64}$/i);
const pdfQuerySchema = z.object({
  subtitle: z.string().trim().max(160).optional(),
  narrative: z.enum(["true", "false"]).optional(),
  questionBreakdown: z.enum(["true", "false"]).optional(),
  languageEfficiency: z.enum(["true", "false"]).optional(),
  optimalCode: z.enum(["true", "false"]).optional(),
  proctoring: z.enum(["true", "false"]).optional(),
});

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function parsePdfSections(query: z.infer<typeof pdfQuerySchema>): ReportPdfSections {
  const sections = { ...DEFAULT_REPORT_PDF_SECTIONS };
  (Object.keys(sections) as (keyof ReportPdfSections)[]).forEach((key) => {
    const value = query[key];
    if (value !== undefined) {
      sections[key] = value === "true";
    }
  });
  return sections;
}

export function createReportController(reportService: ReportService) {
  return {
    async getContestReport(req: Request, res: Response): Promise<void> {
      const contestId = routeIdSchema.parse(getRouteParam(req.params.contestId));
      const envelope = await reportService.getReport(req.user!, contestId);
      res.json(envelope);
    },

    async getContestReportMetrics(req: Request, res: Response): Promise<void> {
      const contestId = routeIdSchema.parse(getRouteParam(req.params.contestId));
      const metrics = await reportService.getMetrics(req.user!, contestId);
      res.json({ metrics });
    },

    async getContestReportPdf(req: Request, res: Response): Promise<void> {
      const contestId = routeIdSchema.parse(getRouteParam(req.params.contestId));
      const query = pdfQuerySchema.parse(req.query);
      const report = await reportService.getReadyReport(req.user!, contestId);
      const pdf = await renderContestReportPdf(report, {
        subtitle: query.subtitle,
        sections: parsePdfSections(query),
      });

      res
        .status(200)
        .type("application/pdf")
        .set("Content-Disposition", `inline; filename="contest-${contestId}-report.pdf"`)
        .send(pdf);
    },

    async generateContestReport(req: Request, res: Response): Promise<void> {
      const contestId = routeIdSchema.parse(getRouteParam(req.params.contestId));
      const payload = generateReportSchema.parse(req.body ?? {});
      const report = await reportService.generateReport(req.user!, contestId, payload);

      // 202 while the model runs in the background; 200 once there is a finished report to hand back.
      res.status(report.status === "GENERATING" ? 202 : 200).json({ report });
    },
  };
}
