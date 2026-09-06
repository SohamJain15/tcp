import { Router } from "express";

import type { ApplicationDependencies } from "../../bootstrap/dependencies";
import { createLabJoinRateLimiter } from "../../middleware/rate-limit";
import { requireRole } from "../../middleware/require-role";
import { asyncHandler } from "../../shared/middleware/async-handler";
import { createLabAttendanceController } from "./lab-attendance.controller";

/**
 * Lab attendance routes — the live lobby a teacher runs during a lab period.
 *
 * Mounted at the top level rather than under `/api/labs/:labId` so it never has to fight the
 * `/:labId` pattern ordering the lab router already works around. Student "/mine/..." routes are
 * declared before the faculty "/:sessionId" pattern for the same reason.
 */
export function createLabAttendanceRouter(dependencies: ApplicationDependencies): Router {
  const router = Router();
  const controller = createLabAttendanceController(dependencies.labAttendanceService);
  // Six digits is only 10^6; without this a guesser walks in.
  const joinLimiter = createLabJoinRateLimiter();

  router.use(dependencies.authMiddleware);
  router.use(dependencies.profileCompletionMiddleware);
  router.use(requireRole("STUDENT", "FACULTY"));

  // Student surface.
  router.get("/mine", requireRole("STUDENT"), asyncHandler(controller.getMine));
  router.get("/mine/:sessionId", requireRole("STUDENT"), asyncHandler(controller.getMineById));
  router.post("/mine/:sessionId/join", requireRole("STUDENT"), joinLimiter, asyncHandler(controller.requestJoin));

  // Faculty surface.
  router.get("/", requireRole("FACULTY"), asyncHandler(controller.list));
  router.post("/", requireRole("FACULTY"), asyncHandler(controller.open));
  router.get("/:sessionId", requireRole("FACULTY"), asyncHandler(controller.get));
  router.patch("/:sessionId", requireRole("FACULTY"), asyncHandler(controller.update));
  router.get("/:sessionId/join-code", requireRole("FACULTY"), asyncHandler(controller.getJoinCode));
  router.get("/:sessionId/admissions", requireRole("FACULTY"), asyncHandler(controller.listAdmissions));
  router.post("/:sessionId/admissions/bulk", requireRole("FACULTY"), asyncHandler(controller.decideAdmissionsBulk));
  router.patch(
    "/:sessionId/admissions/:admissionId",
    requireRole("FACULTY"),
    asyncHandler(controller.decideAdmission),
  );

  return router;
}
