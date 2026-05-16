import { Router } from "express";
import type { ApplicationDependencies } from "../../bootstrap/dependencies";
import { requireRole } from "../../middleware/require-role";
import { asyncHandler } from "../../shared/middleware/async-handler";
import { createProblemController } from "./problem.controller";

export function createProblemRouter(dependencies: ApplicationDependencies): Router {
  const router = Router();
  const controller = createProblemController(dependencies.problemService);

  router.use(dependencies.authMiddleware);
  router.use(dependencies.profileCompletionMiddleware);

  router.get("/manage", requireRole("FACULTY"), asyncHandler(controller.listManageProblems));
  router.get("/manage/:problemId", requireRole("FACULTY"), asyncHandler(controller.getManageProblemDetail));
  router.post("/", requireRole("FACULTY"), asyncHandler(controller.createProblem));
  router.patch("/:problemId/state", requireRole("FACULTY"), asyncHandler(controller.updateProblemState));
  router.patch("/:problemId", requireRole("FACULTY"), asyncHandler(controller.updateProblem));
  router.get("/", asyncHandler(controller.listStudentProblems));
  router.get("/:problemId", asyncHandler(controller.getStudentProblemDetail));

  return router;
}
