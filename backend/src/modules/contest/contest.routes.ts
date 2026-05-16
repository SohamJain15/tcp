import { Router } from "express";
import type { ApplicationDependencies } from "../../bootstrap/dependencies";
import { createFinalSubmissionRateLimiters } from "../../middleware/rate-limit";
import { requireRole } from "../../middleware/require-role";
import { asyncHandler } from "../../shared/middleware/async-handler";
import { createContestController } from "./contest.controller";

export function createContestRouter(dependencies: ApplicationDependencies): Router {
  const router = Router();
  const controller = createContestController(dependencies.contestService);

  router.use(dependencies.authMiddleware);
  router.use(dependencies.profileCompletionMiddleware);

  router.get("/", asyncHandler(controller.listContests));
  router.get("/:contestId", asyncHandler(controller.getContestById));
  router.get("/:contestId/standings", asyncHandler(controller.getStandings));
  router.get("/:contestId/standings/export", requireRole("FACULTY"), asyncHandler(controller.exportStandingsCsv));
  router.get("/:contestId/attempts", requireRole("FACULTY"), asyncHandler(controller.listAttempts));
  router.get("/:contestId/attempts/:attemptId", requireRole("FACULTY"), asyncHandler(controller.getAttemptReview));
  router.get("/:contestId/questions/:questionId", requireRole("STUDENT"), asyncHandler(controller.getQuestionById));

  router.post("/", requireRole("FACULTY"), asyncHandler(controller.createContest));
  router.patch("/:contestId", requireRole("FACULTY"), asyncHandler(controller.updateContest));
  router.patch("/:contestId/results", requireRole("FACULTY"), asyncHandler(controller.updateContestResults));

  router.post("/:contestId/attempts", requireRole("STUDENT"), asyncHandler(controller.startAttempt));
  router.post("/:contestId/attempts/submit", requireRole("STUDENT"), asyncHandler(controller.submitAttempt));
  router.post("/:contestId/proctor-events", requireRole("STUDENT"), asyncHandler(controller.recordProctorEvent));
  router.post("/:contestId/answers", requireRole("STUDENT"), asyncHandler(controller.answerObjectiveQuestion));
  router.post("/:contestId/coding-run", requireRole("STUDENT"), asyncHandler(controller.runCodingQuestion));
  router.post(
    "/:contestId/coding-submissions",
    requireRole("STUDENT"),
    ...createFinalSubmissionRateLimiters(),
    asyncHandler(controller.submitCodingQuestion),
  );

  return router;
}
