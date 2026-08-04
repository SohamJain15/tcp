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
  // Problems are a student/faculty feature; admins are read-only analytics accounts and must not
  // reach problem statements or test cases.
  router.use(requireRole("STUDENT", "FACULTY"));

  router.get("/manage", requireRole("FACULTY"), asyncHandler(controller.listManageProblems));
  router.get("/manage/:problemId", requireRole("FACULTY"), asyncHandler(controller.getManageProblemDetail));
  router.post("/import-draft", requireRole("FACULTY"), asyncHandler(controller.importProblemDraft));
  router.post("/", requireRole("FACULTY"), asyncHandler(controller.createProblem));
  router.patch("/:problemId/state", requireRole("FACULTY"), asyncHandler(controller.updateProblemState));
  router.patch("/:problemId", requireRole("FACULTY"), asyncHandler(controller.updateProblem));
  router.post("/:problemId/hints/generate", requireRole("FACULTY"), asyncHandler(controller.generateProblemHints));
  router.patch("/:problemId/hints", requireRole("FACULTY"), asyncHandler(controller.updateProblemHints));
  router.get("/", asyncHandler(controller.listStudentProblems));
  // Registered before the bare `/:problemId` so the literal segments are not swallowed by it.
  router.get("/:problemId/leaderboard", asyncHandler(controller.getProblemLeaderboard));
  router.get("/:problemId/hints", requireRole("STUDENT"), asyncHandler(controller.getProblemHints));
  router.post(
    "/:problemId/hints/reveal",
    requireRole("STUDENT"),
    asyncHandler(controller.revealProblemHint),
  );
  router.get("/:problemId", asyncHandler(controller.getStudentProblemDetail));

  return router;
}
