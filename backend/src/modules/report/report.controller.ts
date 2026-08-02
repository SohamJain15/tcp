import type { Request, Response } from "express";
import { z } from "zod";

import type { ReportService } from "./report.service";
import { generateReportSchema } from "./report.validator";

const routeIdSchema = z.string().regex(/^[a-z0-9_-]{4,64}$/i);

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
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

    async generateContestReport(req: Request, res: Response): Promise<void> {
      const contestId = routeIdSchema.parse(getRouteParam(req.params.contestId));
      const payload = generateReportSchema.parse(req.body ?? {});
      const report = await reportService.generateReport(req.user!, contestId, payload);

      // 202 while the model runs in the background; 200 once there is a finished report to hand back.
      res.status(report.status === "GENERATING" ? 202 : 200).json({ report });
    },
  };
}
