import type { Request, Response } from "express";
import { z } from "zod";

import type { LabService } from "./lab.service";
import { createLabSchema, labSqlPreviewSchema, labSqlRunSchema, updateLabSchema } from "./lab.validator";

const routeIdSchema = z.string().regex(/^[a-z0-9_-]{4,80}$/i);

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function createLabController(labService: LabService) {
  return {
    // --- faculty ------------------------------------------------------------
    async listLabs(req: Request, res: Response): Promise<void> {
      res.json({ items: await labService.listForFaculty(req.user!) });
    },

    async getLab(req: Request, res: Response): Promise<void> {
      const labId = routeIdSchema.parse(getRouteParam(req.params.labId));
      res.json({ lab: await labService.getForFaculty(req.user!, labId) });
    },

    async createLab(req: Request, res: Response): Promise<void> {
      const payload = createLabSchema.parse(req.body);
      const lab = await labService.createLab(req.user!, payload);
      res.status(201).json({ lab });
    },

    async updateLab(req: Request, res: Response): Promise<void> {
      const labId = routeIdSchema.parse(getRouteParam(req.params.labId));
      const payload = updateLabSchema.parse(req.body);
      res.json({ lab: await labService.updateLab(req.user!, labId, payload) });
    },

    async previewSql(req: Request, res: Response): Promise<void> {
      const payload = labSqlPreviewSchema.parse(req.body);
      res.json(await labService.previewSql(req.user!, payload));
    },

    // --- student ------------------------------------------------------------
    async listStudentLabs(req: Request, res: Response): Promise<void> {
      res.json({ items: await labService.listForStudent(req.user!) });
    },

    async getStudentLab(req: Request, res: Response): Promise<void> {
      const labId = routeIdSchema.parse(getRouteParam(req.params.labId));
      res.json({ lab: await labService.getForStudent(req.user!, labId) });
    },

    async runSql(req: Request, res: Response): Promise<void> {
      const labId = routeIdSchema.parse(getRouteParam(req.params.labId));
      const payload = labSqlRunSchema.parse(req.body);
      res.json(await labService.runSql(req.user!, labId, payload.experimentId, payload.sql));
    },

    async submitSql(req: Request, res: Response): Promise<void> {
      const labId = routeIdSchema.parse(getRouteParam(req.params.labId));
      const payload = labSqlRunSchema.parse(req.body);
      res.status(201).json(await labService.submitSql(req.user!, labId, payload.experimentId, payload.sql));
    },
  };
}
