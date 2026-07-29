import { Router } from "express";
import type { ApplicationDependencies } from "../../bootstrap/dependencies";
import { requireRole } from "../../middleware/require-role";
import { asyncHandler } from "../../shared/middleware/async-handler";
import { createDepartmentController } from "./department.controller";

/**
 * Department participation views for Heads of Department.
 *
 * Every route is aggregate-only: registrations, attempts, scores and activity, scoped
 * to the caller's own department. Nothing here exposes problem statements, contest
 * questions, answer keys, test cases or submitted code — for any teacher's content.
 * Content access continues to run through the creator-scoped problem/contest routes.
 */
export function createDepartmentRouter(dependencies: ApplicationDependencies): Router {
  const router = Router();
  const controller = createDepartmentController({ departmentService: dependencies.departmentService });

  router.use(dependencies.authMiddleware);
  router.use(dependencies.profileCompletionMiddleware);
  router.use(requireRole("FACULTY"));
  router.use(dependencies.hodMiddleware);

  router.get("/overview", asyncHandler(controller.getOverview));
  router.get("/students", asyncHandler(controller.listStudents));
  router.get("/students/:email", asyncHandler(controller.getStudentDetail));
  router.get("/contests", asyncHandler(controller.listContests));

  // Contest management delegation (HOD delegates their own contests to dept faculty).
  router.get("/faculty", asyncHandler(controller.listDepartmentFaculty));
  router.get("/managed-contests", asyncHandler(controller.listManagedContests));
  router.patch("/managed-contests/:contestId/managers", asyncHandler(controller.setContestManagers));

  return router;
}
