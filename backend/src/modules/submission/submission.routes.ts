import { Router } from "express";
import type { ApplicationDependencies } from "../../bootstrap/dependencies";
import { requireRole } from "../../middleware/require-role";
import { createFinalSubmissionRateLimiters } from "../../middleware/rate-limit";
import { asyncHandler } from "../../shared/middleware/async-handler";
import { createSubmissionController } from "./submission.controller";

export function createSubmissionRouter(dependencies: ApplicationDependencies): Router {
  const router = Router();
  const controller = createSubmissionController(dependencies.submissionService);

  router.use(dependencies.authMiddleware);
  router.use(dependencies.profileCompletionMiddleware);
  router.post("/run", asyncHandler(controller.runSubmission));
  router.post(
    "/",
    requireRole("STUDENT"),
    ...createFinalSubmissionRateLimiters(),
    asyncHandler(controller.createSubmission),
  );
  router.get("/", asyncHandler(controller.listSubmissions));
  router.get("/:submissionId", asyncHandler(controller.getSubmissionById));

  return router;
}
