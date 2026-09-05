import { Router } from "express";
import { z } from "zod";
import type { ApplicationDependencies } from "../../bootstrap/dependencies";
import { createClientErrorRateLimiter } from "../../middleware/rate-limit";
import { asyncHandler } from "../../shared/middleware/async-handler";
import { logServerError } from "../../shared/logging/error-logger";

const clientErrorSchema = z.object({
  source: z.enum(["react", "window", "unhandled_rejection"]),
  message: z.string().trim().min(1).max(2_000),
  stack: z.string().max(10_000).optional(),
  componentStack: z.string().max(10_000).optional(),
  pathname: z.string().max(500).regex(/^\/[^?#]*$/),
}).strict();

export function createClientErrorRouter(dependencies: ApplicationDependencies): Router {
  const router = Router();
  router.use(dependencies.authMiddleware);
  router.use(createClientErrorRateLimiter());
  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const report = clientErrorSchema.parse(req.body);
      logServerError("Frontend crash report", new Error(report.message), {
        source: report.source,
        pathname: report.pathname,
        clientStack: report.stack,
        componentStack: report.componentStack,
        userEmail: req.user?.email,
      });
      res.status(204).end();
    }),
  );
  return router;
}

