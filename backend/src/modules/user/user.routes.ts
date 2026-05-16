import { Router } from "express";
import type { ApplicationDependencies } from "../../bootstrap/dependencies";
import { requireRole } from "../../middleware/require-role";
import { asyncHandler } from "../../shared/middleware/async-handler";
import { createUserController } from "./user.controller";

export function createAuthRouter(dependencies: ApplicationDependencies): Router {
  const router = Router();
  const controller = createUserController({
    userService: dependencies.userService,
    userRepository: dependencies.userRepository,
  });

  router.use(dependencies.authMiddleware);
  router.get("/sso/callback", asyncHandler(controller.handleSsoCallback));
  router.post("/sso/callback", asyncHandler(controller.handleSsoCallback));

  return router;
}

export function createUserRouter(dependencies: ApplicationDependencies): Router {
  const router = Router();
  const controller = createUserController({
    userService: dependencies.userService,
    userRepository: dependencies.userRepository,
  });

  router.use(dependencies.authMiddleware);
  router.get("/me", asyncHandler(controller.getCurrentUser));
  router.get("/me/analytics", asyncHandler(controller.getCurrentUserAnalytics));
  router.patch("/me", asyncHandler(controller.updateCurrentUserProfile));
  router.get("/:email/analytics", requireRole("FACULTY"), asyncHandler(controller.getUserAnalyticsByEmail));
  router.get("/:email", requireRole("FACULTY"), asyncHandler(controller.getUserByEmail));

  return router;
}

export function createLegacyUserRouter(dependencies: ApplicationDependencies): Router {
  const router = Router();
  const controller = createUserController({
    userService: dependencies.userService,
    userRepository: dependencies.userRepository,
  });

  router.use(dependencies.authMiddleware);
  router.get("/profile", asyncHandler(controller.getLegacyProfile));

  return router;
}
