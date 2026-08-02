import { Router } from "express";
import type { ApplicationDependencies } from "../../bootstrap/dependencies";
import { createFinalSubmissionRateLimiters } from "../../middleware/rate-limit";
import { requireRole } from "../../middleware/require-role";
import { asyncHandler } from "../../shared/middleware/async-handler";
import { createReportController } from "../report/report.controller";
import { createContestController } from "./contest.controller";

export function createContestRouter(dependencies: ApplicationDependencies): Router {
  const router = Router();
  const controller = createContestController(dependencies.contestService);
  // Contest reports live in their own module but stay under /api/contests, since they are a view of
  // a contest rather than a resource of their own.
  const reportController = createReportController(dependencies.reportService);

  router.use(dependencies.authMiddleware);
  router.use(dependencies.profileCompletionMiddleware);
  // Contests are a student/faculty feature. Stated once here rather than relying on the per-route
  // guards, because the shared routes below (list, detail, standings) branch on
  // `role === "FACULTY" ? … : student`, so a third role would silently fall into the student path.
  router.use(requireRole("STUDENT", "FACULTY"));

  router.get("/", asyncHandler(controller.listContests));
  router.get("/:contestId", asyncHandler(controller.getContestById));
  router.get("/:contestId/standings", asyncHandler(controller.getStandings));
  router.get("/:contestId/standings/export", requireRole("FACULTY"), asyncHandler(controller.exportStandingsCsv));
  router.get("/:contestId/registrations", requireRole("FACULTY"), asyncHandler(controller.listRegistrations));
  router.get("/:contestId/registrations/export", requireRole("FACULTY"), asyncHandler(controller.exportRegistrationsCsv));
  router.get("/:contestId/attempts", requireRole("FACULTY"), asyncHandler(controller.listAttempts));
  router.get("/:contestId/attempts/:attemptId", requireRole("FACULTY"), asyncHandler(controller.getAttemptReview));
  router.get("/:contestId/report", requireRole("FACULTY"), asyncHandler(reportController.getContestReport));
  router.get("/:contestId/report/pdf", requireRole("FACULTY"), asyncHandler(reportController.getContestReportPdf));
  router.get(
    "/:contestId/report/metrics",
    requireRole("FACULTY"),
    asyncHandler(reportController.getContestReportMetrics),
  );
  router.post("/:contestId/report", requireRole("FACULTY"), asyncHandler(reportController.generateContestReport));
  router.get("/:contestId/questions/:questionId", requireRole("STUDENT"), asyncHandler(controller.getQuestionById));
  router.get("/:contestId/feedback", requireRole("STUDENT"), asyncHandler(controller.getFeedbackStatus));
  router.post("/:contestId/feedback", requireRole("STUDENT"), asyncHandler(controller.submitFeedback));

  router.post("/", requireRole("FACULTY"), asyncHandler(controller.createContest));
  router.patch("/:contestId", requireRole("FACULTY"), asyncHandler(controller.updateContest));
  router.patch("/:contestId/results", requireRole("FACULTY"), asyncHandler(controller.updateContestResults));

  router.post("/:contestId/registration", requireRole("STUDENT"), asyncHandler(controller.registerForContest));
  router.delete("/:contestId/registration", requireRole("STUDENT"), asyncHandler(controller.unregisterFromContest));

  router.post("/:contestId/attempts", requireRole("STUDENT"), asyncHandler(controller.startAttempt));
  router.post("/:contestId/attempts/submit", requireRole("STUDENT"), asyncHandler(controller.submitAttempt));
  router.post("/:contestId/proctor-events", requireRole("STUDENT"), asyncHandler(controller.recordProctorEvent));
  router.post("/:contestId/answers", requireRole("STUDENT"), asyncHandler(controller.answerObjectiveQuestion));
  router.post("/:contestId/coding-run", requireRole("STUDENT"), asyncHandler(controller.runCodingQuestion));
  router.post("/:contestId/coding-draft", requireRole("STUDENT"), asyncHandler(controller.saveCodingDraft));
  router.post(
    "/:contestId/coding-submissions",
    requireRole("STUDENT"),
    ...createFinalSubmissionRateLimiters(),
    asyncHandler(controller.submitCodingQuestion),
  );

  return router;
}
