import type { Request, Response } from "express";
import { z } from "zod";

import { resolveClientIp } from "../../shared/utils/client-ip";
import type { LabAttendanceService } from "./lab-attendance.service";
import {
  admissionDecisionSchema,
  bulkAdmissionSchema,
  joinRequestSchema,
  openAttendanceSessionSchema,
  updateAttendanceSessionSchema,
} from "./lab-attendance.validator";

const routeIdSchema = z.string().regex(/^[a-z0-9_-]{4,90}$/i);

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function createLabAttendanceController(service: LabAttendanceService) {
  return {
    // --- faculty ------------------------------------------------------------
    async list(req: Request, res: Response): Promise<void> {
      res.json({ items: await service.listSessions(req.user!) });
    },

    async open(req: Request, res: Response): Promise<void> {
      const payload = openAttendanceSessionSchema.parse(req.body);
      // resolveClientIp, not req.ip: `trust proxy` is on, so req.ip is the leftmost forwarded entry
      // and therefore client-controlled. An access gate must never be built on it.
      const session = await service.openSession(req.user!, payload, resolveClientIp(req));
      res.status(201).json({ session });
    },

    async get(req: Request, res: Response): Promise<void> {
      const sessionId = routeIdSchema.parse(getRouteParam(req.params.sessionId));
      res.json({ session: await service.getSession(req.user!, sessionId) });
    },

    async update(req: Request, res: Response): Promise<void> {
      const sessionId = routeIdSchema.parse(getRouteParam(req.params.sessionId));
      const payload = updateAttendanceSessionSchema.parse(req.body);
      res.json({ session: await service.updateSession(req.user!, sessionId, payload, resolveClientIp(req)) });
    },

    async getJoinCode(req: Request, res: Response): Promise<void> {
      const sessionId = routeIdSchema.parse(getRouteParam(req.params.sessionId));
      res.json(await service.getJoinCode(req.user!, sessionId));
    },

    async listAdmissions(req: Request, res: Response): Promise<void> {
      const sessionId = routeIdSchema.parse(getRouteParam(req.params.sessionId));
      res.json(await service.listAdmissions(req.user!, sessionId));
    },

    async decideAdmission(req: Request, res: Response): Promise<void> {
      const sessionId = routeIdSchema.parse(getRouteParam(req.params.sessionId));
      const admissionId = routeIdSchema.parse(getRouteParam(req.params.admissionId));
      const payload = admissionDecisionSchema.parse(req.body);
      res.json({ admission: await service.decideAdmission(req.user!, sessionId, admissionId, payload) });
    },

    async decideAdmissionsBulk(req: Request, res: Response): Promise<void> {
      const sessionId = routeIdSchema.parse(getRouteParam(req.params.sessionId));
      const payload = bulkAdmissionSchema.parse(req.body);
      res.json(await service.decideAdmissionsBulk(req.user!, sessionId, payload));
    },

    // --- student ------------------------------------------------------------
    async getMine(req: Request, res: Response): Promise<void> {
      res.json(await service.getMine(req.user!, resolveClientIp(req)));
    },

    async getMineById(req: Request, res: Response): Promise<void> {
      const sessionId = routeIdSchema.parse(getRouteParam(req.params.sessionId));
      res.json(await service.getMineById(req.user!, sessionId, resolveClientIp(req)));
    },

    async requestJoin(req: Request, res: Response): Promise<void> {
      const sessionId = routeIdSchema.parse(getRouteParam(req.params.sessionId));
      const payload = joinRequestSchema.parse(req.body ?? {});
      res.json({ admission: await service.requestJoin(req.user!, sessionId, payload, resolveClientIp(req)) });
    },
  };
}
