import { Router } from "express";

import type { ApplicationDependencies } from "../../bootstrap/dependencies";
import { requireRole } from "../../middleware/require-role";
import { createSqlExecutionRateLimiter } from "../../middleware/rate-limit";
import { asyncHandler } from "../../shared/middleware/async-handler";
import { createLabSessionController } from "./lab-session.controller";

/** Lab Session routes — the scheduled, assigned, proctored assessment surface for labs. */
export function createLabSessionRouter(dependencies: ApplicationDependencies): Router {
  const router = Router();
  const controller = createLabSessionController(dependencies.labSessionService);
  const sqlExecutionLimiter = createSqlExecutionRateLimiter();

  router.use(dependencies.authMiddleware);
  router.use(dependencies.profileCompletionMiddleware);
  router.use(requireRole("STUDENT", "FACULTY"));

  // Student surface (declared before the faculty "/:sessionId" pattern).
  router.get("/mine", requireRole("STUDENT"), asyncHandler(controller.listAssigned));
  router.get("/mine/:sessionId", requireRole("STUDENT"), asyncHandler(controller.getForStudent));
  router.get("/mine/:sessionId/result", requireRole("STUDENT"), asyncHandler(controller.getResult));
  router.post("/mine/:sessionId/attempts", requireRole("STUDENT"), asyncHandler(controller.startAttempt));
  router.post("/mine/:sessionId/sql-run", requireRole("STUDENT"), sqlExecutionLimiter, asyncHandler(controller.runSql));
  router.post("/mine/:sessionId/sql-save", requireRole("STUDENT"), asyncHandler(controller.saveSql));
  router.post("/mine/:sessionId/coding-run", requireRole("STUDENT"), asyncHandler(controller.runCoding));
  router.post("/mine/:sessionId/coding-submit", requireRole("STUDENT"), asyncHandler(controller.submitCoding));
  router.post("/mine/:sessionId/coding-draft", requireRole("STUDENT"), asyncHandler(controller.saveCodingDraft));
  router.post("/mine/:sessionId/submit", requireRole("STUDENT"), asyncHandler(controller.submitAttempt));
  router.post("/mine/:sessionId/proctor-events", requireRole("STUDENT"), asyncHandler(controller.recordProctorEvent));

  // Faculty surface.
  router.get("/", requireRole("FACULTY"), asyncHandler(controller.list));
  router.post("/", requireRole("FACULTY"), asyncHandler(controller.create));
  router.get("/:sessionId", requireRole("FACULTY"), asyncHandler(controller.get));
  router.patch("/:sessionId", requireRole("FACULTY"), asyncHandler(controller.update));
  router.get("/:sessionId/attempts", requireRole("FACULTY"), asyncHandler(controller.listAttempts));
  router.patch("/:sessionId/results", requireRole("FACULTY"), asyncHandler(controller.publishResults));

  return router;
}
