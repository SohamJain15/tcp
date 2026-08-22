import type { Request, Response } from "express";
import { z } from "zod";

import { classTestProctorEventSchema } from "../classtest/classtest.validator";
import type { LabSessionService } from "./lab-session.service";
import { createLabSessionSchema, labSessionResultsSchema, updateLabSessionSchema } from "./lab-session.validator";
import { labCodingRunSchema, labSqlRunSchema } from "./lab.validator";

const routeIdSchema = z.string().regex(/^[a-z0-9_-]{4,90}$/i);

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function createLabSessionController(service: LabSessionService) {
  return {
    // --- faculty ------------------------------------------------------------
    async list(req: Request, res: Response): Promise<void> {
      res.json({ items: await service.listForFaculty(req.user!) });
    },
    async get(req: Request, res: Response): Promise<void> {
      const sessionId = routeIdSchema.parse(getRouteParam(req.params.sessionId));
      res.json({ session: await service.getForFaculty(req.user!, sessionId) });
    },
    async create(req: Request, res: Response): Promise<void> {
      const payload = createLabSessionSchema.parse(req.body);
      res.status(201).json({ session: await service.createSession(req.user!, payload) });
    },
    async update(req: Request, res: Response): Promise<void> {
      const sessionId = routeIdSchema.parse(getRouteParam(req.params.sessionId));
      const payload = updateLabSessionSchema.parse(req.body);
      res.json({ session: await service.updateSession(req.user!, sessionId, payload) });
    },
    async listAttempts(req: Request, res: Response): Promise<void> {
      const sessionId = routeIdSchema.parse(getRouteParam(req.params.sessionId));
      res.json({ items: await service.listAttempts(req.user!, sessionId) });
    },
    async publishResults(req: Request, res: Response): Promise<void> {
      const sessionId = routeIdSchema.parse(getRouteParam(req.params.sessionId));
      const payload = labSessionResultsSchema.parse(req.body);
      res.json({ session: await service.publishResults(req.user!, sessionId, payload.resultsPublished) });
    },

    // --- student ------------------------------------------------------------
    async listAssigned(req: Request, res: Response): Promise<void> {
      res.json({ items: await service.listAssigned(req.user!) });
    },
    async getForStudent(req: Request, res: Response): Promise<void> {
      const sessionId = routeIdSchema.parse(getRouteParam(req.params.sessionId));
      res.json({ session: await service.getForStudent(req.user!, sessionId) });
    },
    async startAttempt(req: Request, res: Response): Promise<void> {
      const sessionId = routeIdSchema.parse(getRouteParam(req.params.sessionId));
      res.status(201).json({ session: await service.startAttempt(req.user!, sessionId) });
    },
    async runSql(req: Request, res: Response): Promise<void> {
      const sessionId = routeIdSchema.parse(getRouteParam(req.params.sessionId));
      const payload = labSqlRunSchema.parse(req.body);
      res.json(await service.runSql(req.user!, sessionId, payload.experimentId, payload.sql));
    },
    async saveSql(req: Request, res: Response): Promise<void> {
      const sessionId = routeIdSchema.parse(getRouteParam(req.params.sessionId));
      const payload = labSqlRunSchema.parse(req.body);
      await service.saveSql(req.user!, sessionId, payload.experimentId, payload.sql);
      res.json({ saved: true });
    },
    async runCoding(req: Request, res: Response): Promise<void> {
      const sessionId = routeIdSchema.parse(getRouteParam(req.params.sessionId));
      const payload = labCodingRunSchema.parse(req.body);
      res.json({ result: await service.runCoding(req.user!, sessionId, payload) });
    },
    async submitCoding(req: Request, res: Response): Promise<void> {
      const sessionId = routeIdSchema.parse(getRouteParam(req.params.sessionId));
      const payload = labCodingRunSchema.parse(req.body);
      res.status(201).json(await service.submitCoding(req.user!, sessionId, payload));
    },
    async saveCodingDraft(req: Request, res: Response): Promise<void> {
      const sessionId = routeIdSchema.parse(getRouteParam(req.params.sessionId));
      const payload = labCodingRunSchema.parse(req.body);
      await service.saveCodingDraft(req.user!, sessionId, payload);
      res.json({ saved: true });
    },
    async submitAttempt(req: Request, res: Response): Promise<void> {
      const sessionId = routeIdSchema.parse(getRouteParam(req.params.sessionId));
      await service.submitAttempt(req.user!, sessionId);
      res.json({ submitted: true });
    },
    async recordProctorEvent(req: Request, res: Response): Promise<void> {
      const sessionId = routeIdSchema.parse(getRouteParam(req.params.sessionId));
      const payload = classTestProctorEventSchema.parse(req.body);
      res.json(await service.recordProctorEvent(req.user!, sessionId, payload.type));
    },
    async getResult(req: Request, res: Response): Promise<void> {
      const sessionId = routeIdSchema.parse(getRouteParam(req.params.sessionId));
      res.json({ result: await service.getResult(req.user!, sessionId) });
    },
  };
}
