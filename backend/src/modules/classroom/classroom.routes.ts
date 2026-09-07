import { Router } from "express";
import { z } from "zod";
import type { ApplicationDependencies } from "../../bootstrap/dependencies";
import { requireRole } from "../../middleware/require-role";
import { createSqlExecutionRateLimiter } from "../../middleware/rate-limit";
import { asyncHandler } from "../../shared/middleware/async-handler";
import { resolveClientIp } from "../../shared/utils/client-ip";
import {
  classroomHistoryHtml,
  classroomHistoryPdf,
  gradebookCsv,
} from "./classroom-report";

export function createClassroomRouter(deps: ApplicationDependencies) {
  const router = Router();
  const service = deps.classroomService!;
  const id = (value: unknown) => z.string().uuid().parse(value);
  router.use(
    deps.authMiddleware,
    deps.profileCompletionMiddleware,
    requireRole("FACULTY", "STUDENT"),
  );
  router.get(
    "/",
    asyncHandler(async (req, res) =>
      res.json({ items: await service.list(req.user!) }),
    ),
  );
  router.post(
    "/",
    requireRole("FACULTY"),
    asyncHandler(async (req, res) =>
      res
        .status(201)
        .json({ classroom: await service.create(req.user!, req.body) }),
    ),
  );
  router.post(
    "/join",
    requireRole("STUDENT"),
    asyncHandler(async (req, res) =>
      res.json(
        await service.join(
          req.user!,
          z.string().trim().min(1).max(32).parse(req.body.code),
        ),
      ),
    ),
  );
  router.get(
    "/:id",
    asyncHandler(async (req, res) =>
      res.json(await service.detail(req.user!, id(req.params.id))),
    ),
  );
  router.patch(
    "/:id",
    requireRole("FACULTY"),
    asyncHandler(async (req, res) =>
      res.json({
        classroom: await service.update(req.user!, id(req.params.id), req.body),
      }),
    ),
  );
  router.delete(
    "/:id/members/:email",
    requireRole("FACULTY"),
    asyncHandler(async (req, res) => {
      await service.remove(
        req.user!,
        id(req.params.id),
        z.string().email().parse(req.params.email),
      );
      res.json({ ok: true });
    }),
  );
  router.get(
    "/:id/sessions/:sessionId/experiments/:experimentId/schema",
    createSqlExecutionRateLimiter(),
    asyncHandler(async (req, res) =>
      res.json(
        await service.experimentSchema(
          req.user!,
          id(req.params.id),
          id(req.params.sessionId),
          String(req.params.experimentId),
        ),
      ),
    ),
  );
  router.post(
    "/:id/sessions",
    requireRole("FACULTY"),
    asyncHandler(async (req, res) =>
      res.json({
        classroom: await service.schedule(
          req.user!,
          id(req.params.id),
          req.body,
        ),
      }),
    ),
  );
  router.patch(
    "/:id/sessions/:sessionId",
    requireRole("FACULTY"),
    asyncHandler(async (req, res) =>
      res.json({
        classroom: await service.schedule(
          req.user!,
          id(req.params.id),
          req.body,
          id(req.params.sessionId),
        ),
      }),
    ),
  );
  for (const operation of ["activate", "close", "enter"] as const) {
    router.post(
      `/:id/sessions/:sessionId/${operation}`,
      requireRole(operation === "enter" ? "STUDENT" : "FACULTY"),
      asyncHandler(async (req, res) => {
        await service[operation](
          req.user!,
          id(req.params.id),
          id(req.params.sessionId),
          resolveClientIp(req),
        );
        res.json({ ok: true });
      }),
    );
  }
  router.post(
    "/:id/sessions/:sessionId/work",
    requireRole("STUDENT"),
    createSqlExecutionRateLimiter(),
    asyncHandler(async (req, res) =>
      res.json(
        await service.work(
          req.user!,
          id(req.params.id),
          id(req.params.sessionId),
          req.body,
          resolveClientIp(req),
        ),
      ),
    ),
  );
  router.patch(
    "/:id/grades",
    requireRole("FACULTY"),
    asyncHandler(async (req, res) => {
      await service.grade(req.user!, id(req.params.id), req.body);
      res.json({ ok: true });
    }),
  );
  router.get(
    "/:id/gradebook.csv",
    requireRole("FACULTY"),
    asyncHandler(async (req, res) => {
      const detail = await service.detail(req.user!, id(req.params.id));
      res
        .type("text/csv")
        .set("Content-Disposition", 'attachment; filename="lab-gradebook.csv"')
        .send(gradebookCsv(detail));
    }),
  );
  router.get(
    "/:id/history.pdf",
    requireRole("STUDENT"),
    asyncHandler(async (req, res) => {
      const detail = await service.detail(req.user!, id(req.params.id));
      const selected =
        z
          .string()
          .max(4000)
          .optional()
          .parse(req.query.sessions)
          ?.split(",")
          .filter(Boolean)
          .map(id) ?? [];
      const pdf = await classroomHistoryPdf(
        classroomHistoryHtml(detail, req.user!.email.toLowerCase(), selected),
      );
      res
        .type("application/pdf")
        .set("Cache-Control", "no-store")
        .set("Content-Disposition", 'inline; filename="lab-record.pdf"')
        .send(pdf);
    }),
  );
  return router;
}
