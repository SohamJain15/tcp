import { Router } from "express";
import type { ApplicationDependencies } from "../../bootstrap/dependencies";
import { requireRole } from "../../middleware/require-role";
import { createCodeExecutionRateLimiter, createFinalSubmissionRateLimiters } from "../../middleware/rate-limit";
import { asyncHandler } from "../../shared/middleware/async-handler";
import { createSubmissionController } from "./submission.controller";

export function createSubmissionRouter(dependencies: ApplicationDependencies): Router {
  const router = Router();
  const controller = createSubmissionController(dependencies.submissionService);

  router.use(dependencies.authMiddleware);
  router.use(dependencies.profileCompletionMiddleware);
  // Submissions carry student source code. Admins are denied at the router rather than relying on
  // the ownership checks in the service, so there is no path by which code reaches an admin.
  router.use(requireRole("STUDENT", "FACULTY"));
  router.post("/run", requireRole("STUDENT"), createCodeExecutionRateLimiter(), asyncHandler(controller.runSubmission));
  router.post(
    "/",
    requireRole("STUDENT"),
    ...createFinalSubmissionRateLimiters(),
    asyncHandler(controller.createSubmission),
  );
  router.get("/", asyncHandler(controller.listSubmissions));
  // Before the bare `/:submissionId` so the literal segment is not swallowed by it.
  router.get("/:submissionId/stats", requireRole("STUDENT"), asyncHandler(controller.getSubmissionStats));
  router.get("/:submissionId", asyncHandler(controller.getSubmissionById));

  return router;
}
