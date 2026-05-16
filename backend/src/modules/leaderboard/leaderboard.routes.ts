import { Router } from "express";
import type { ApplicationDependencies } from "../../bootstrap/dependencies";
import { requireRole } from "../../middleware/require-role";
import { asyncHandler } from "../../shared/middleware/async-handler";
import { createLeaderboardController } from "./leaderboard.controller";

export function createLeaderboardRouter(dependencies: ApplicationDependencies): Router {
  const router = Router();
  const controller = createLeaderboardController(dependencies.leaderboardService);

  router.use(dependencies.authMiddleware);
  router.use(dependencies.profileCompletionMiddleware);
  router.get("/", asyncHandler(controller.listLeaderboard));
  router.get("/export", requireRole("FACULTY"), asyncHandler(controller.exportLeaderboard));

  return router;
}
