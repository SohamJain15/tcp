import { Router } from "express";
import type { ApplicationDependencies } from "../../bootstrap/dependencies";
import { requireRole } from "../../middleware/require-role";
import { asyncHandler } from "../../shared/middleware/async-handler";
import { createClassTestController } from "./classtest.controller";

/**
 * Class Test routes.
 *
 * Faculty-only for now; the student attempt surface lands in the next step. Note there is no
 * standings or leaderboard route here, and there never should be — a class test ranks nobody.
 */
export function createClassTestRouter(dependencies: ApplicationDependencies): Router {
  const router = Router();
  const controller = createClassTestController(dependencies.classTestService);

  router.use(dependencies.authMiddleware);
  router.use(dependencies.profileCompletionMiddleware);
  // Class tests are a student/faculty feature; admins get department analytics only.
  router.use(requireRole("STUDENT", "FACULTY"));

  // Student routes come first: "/assigned" and "/mine/..." must not be captured by the
  // faculty "/:classTestId" pattern below.
  router.get("/assigned", requireRole("STUDENT"), asyncHandler(controller.listAssigned));
  router.get("/mine/:classTestId", requireRole("STUDENT"), asyncHandler(controller.getForStudent));
  router.get("/mine/:classTestId/result", requireRole("STUDENT"), asyncHandler(controller.getStudentResult));
  router.post("/mine/:classTestId/attempts", requireRole("STUDENT"), asyncHandler(controller.startAttempt));
  router.post("/mine/:classTestId/answers", requireRole("STUDENT"), asyncHandler(controller.saveAnswer));
  router.post(
    "/mine/:classTestId/attempts/submit",
    requireRole("STUDENT"),
    asyncHandler(controller.submitAttempt),
  );
  router.post(
    "/mine/:classTestId/proctor-events",
    requireRole("STUDENT"),
    asyncHandler(controller.recordProctorEvent),
  );

  router.get("/", requireRole("FACULTY"), asyncHandler(controller.listClassTests));
  router.post("/", requireRole("FACULTY"), asyncHandler(controller.createClassTest));
  router.post("/audience-preview", requireRole("FACULTY"), asyncHandler(controller.previewAudience));
  router.get("/:classTestId", requireRole("FACULTY"), asyncHandler(controller.getClassTest));
  router.patch("/:classTestId", requireRole("FACULTY"), asyncHandler(controller.updateClassTest));
  router.get("/:classTestId/attempts", requireRole("FACULTY"), asyncHandler(controller.listAttempts));
  router.get(
    "/:classTestId/attempts/:attemptId",
    requireRole("FACULTY"),
    asyncHandler(controller.getAttempt),
  );
  router.patch(
    "/:classTestId/attempts/:attemptId/grade",
    requireRole("FACULTY"),
    asyncHandler(controller.gradeShortAnswer),
  );
  router.patch("/:classTestId/results", requireRole("FACULTY"), asyncHandler(controller.publishResults));

  return router;
}
