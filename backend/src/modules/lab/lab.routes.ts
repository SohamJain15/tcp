import { Router } from "express";

import type { ApplicationDependencies } from "../../bootstrap/dependencies";
import { requireRole } from "../../middleware/require-role";
import { asyncHandler } from "../../shared/middleware/async-handler";
import { createLabController } from "./lab.controller";

/**
 * Lab routes.
 *
 * Student "/mine/..." routes are declared before the faculty "/:labId" pattern so they are not
 * captured by it, matching the class-test router's ordering.
 */
export function createLabRouter(dependencies: ApplicationDependencies): Router {
  const router = Router();
  const controller = createLabController(dependencies.labService);

  router.use(dependencies.authMiddleware);
  router.use(dependencies.profileCompletionMiddleware);
  router.use(requireRole("STUDENT", "FACULTY"));

  // Student surface.
  router.get("/mine", requireRole("STUDENT"), asyncHandler(controller.listStudentLabs));
  router.get("/mine/:labId", requireRole("STUDENT"), asyncHandler(controller.getStudentLab));
  router.post("/mine/:labId/sql-run", requireRole("STUDENT"), asyncHandler(controller.runSql));
  router.post("/mine/:labId/sql-submit", requireRole("STUDENT"), asyncHandler(controller.submitSql));

  // Faculty surface. Static "/sql-preview" before "/:labId" so it is not captured.
  router.get("/", requireRole("FACULTY"), asyncHandler(controller.listLabs));
  router.post("/", requireRole("FACULTY"), asyncHandler(controller.createLab));
  router.post("/sql-preview", requireRole("FACULTY"), asyncHandler(controller.previewSql));
  router.get("/:labId", requireRole("FACULTY"), asyncHandler(controller.getLab));
  router.patch("/:labId", requireRole("FACULTY"), asyncHandler(controller.updateLab));

  return router;
}
