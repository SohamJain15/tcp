import { Router } from "express";

import type { ApplicationDependencies } from "../../bootstrap/dependencies";
import { requireRole } from "../../middleware/require-role";
import { asyncHandler } from "../../shared/middleware/async-handler";
import { createAdminController } from "./admin.controller";

/**
 * Read-only, cross-department analytics for institute leadership (principal / CERCD).
 *
 * The same guarantee the HOD router makes applies here and is what keeps this surface safe to widen
 * beyond a single department: every response is an aggregate. There is no member anywhere in
 * `DepartmentOverviewResponse` or `DepartmentStudentDetailResponse` for a problem statement, a contest
 * question, an answer key, a test case, or submitted code — so this router cannot grow one by accident.
 *
 * Authorization is plain `requireRole("ADMIN")`. Unlike the HOD gate, which must re-read Mongo because
 * the CoE token carries no HOD flag, the admin role *is* a token claim and `syncAuthenticatedUser`
 * re-derives it from the token on every request; a bespoke middleware would only re-read a value the
 * auth layer just resolved.
 *
 * `profileCompletionMiddleware` is intentionally absent: admins have no profile to complete. (They are
 * marked complete on sync anyway, so this is about stating intent rather than dodging a check.)
 */
export function createAdminRouter(dependencies: ApplicationDependencies): Router {
  const router = Router();
  const controller = createAdminController({
    departmentService: dependencies.departmentService,
    contestService: dependencies.contestService,
  });

  router.use(dependencies.authMiddleware);
  // Before any parameter parsing, so a non-admin never reaches department resolution.
  router.use(requireRole("ADMIN"));

  router.get("/departments", asyncHandler(controller.listDepartments));
  // Contest metadata and rankings only — questions, answer keys and test cases are never loaded.
  router.get("/contests", asyncHandler(controller.listContests));
  router.get("/contests/:contestId/standings", asyncHandler(controller.getContestStandings));
  router.get("/departments/:department/overview", asyncHandler(controller.getDepartmentOverview));
  router.get("/departments/:department/students", asyncHandler(controller.listDepartmentStudents));
  router.get("/departments/:department/students/:email", asyncHandler(controller.getDepartmentStudentDetail));

  return router;
}
