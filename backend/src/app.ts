import cookieParser from "cookie-parser";
import cors, { type CorsOptions } from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { ApplicationDependencies } from "./bootstrap/dependencies";
import { env } from "./config/env";
import { COE_TOKEN_COOKIE_NAMES } from "./middleware/auth";
import { createGlobalApiRateLimiter } from "./middleware/rate-limit";
import { createLeaderboardRouter } from "./modules/leaderboard/leaderboard.routes";
import { createProblemRouter } from "./modules/problem/problem.routes";
import { createSubmissionRouter } from "./modules/submission/submission.routes";
import { createContestRouter } from "./modules/contest/contest.routes";
import { createAuthRouter, createLegacyUserRouter, createUserRouter } from "./modules/user/user.routes";
import { errorHandler, notFoundHandler } from "./shared/middleware/error-handler";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizeOrigin(origin: string): string {
  return origin.trim().toLowerCase().replace(/\/$/, "");
}

function resolveAllowedOrigins(): Set<string> {
  const configuredOrigins = env.corsOrigins.map(normalizeOrigin);
  return new Set<string>([
    normalizeOrigin(env.FRONTEND_BASE_URL),
    ...configuredOrigins,
    // Helpful local aliases for development when the browser uses 127.0.0.1.
    ...configuredOrigins
      .filter((origin) => origin.includes("localhost"))
      .map((origin) => origin.replace("localhost", "127.0.0.1")),
    normalizeOrigin(env.FRONTEND_BASE_URL.replace("localhost", "127.0.0.1")),
  ]);
}

function resolveSafeFrontendOrigin(candidateOrigin: unknown, allowedOrigins: Set<string>): string {
  if (typeof candidateOrigin !== "string" || candidateOrigin.trim() === "") {
    return normalizeOrigin(env.FRONTEND_BASE_URL);
  }

  const normalizedOrigin = normalizeOrigin(candidateOrigin);
  return allowedOrigins.has(normalizedOrigin) ? normalizedOrigin : normalizeOrigin(env.FRONTEND_BASE_URL);
}

function resolveCorsOptions(): CorsOptions {
  const allowedOrigins = resolveAllowedOrigins();

  return {
    origin: (requestOrigin, callback) => {
      // Allow non-browser callers (e.g. curl/postman/health checks)
      if (!requestOrigin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.has(normalizeOrigin(requestOrigin))) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  };
}

function isAllowedInternalSource(sourceIp: string): boolean {
  if (!sourceIp) {
    return false;
  }

  const normalizedSource = sourceIp.trim();
  if (["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(normalizedSource)) {
    return true;
  }

  return env.coeTrustedProxyIps.some((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) {
      return false;
    }

    if (trimmed.includes("/")) {
      const [network, prefix] = trimmed.split("/", 2);
      return network === normalizedSource && Boolean(prefix);
    }

    return trimmed === normalizedSource;
  });
}

function createMutationOriginGuard(allowedOrigins: Set<string>) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const origin = typeof req.get("origin") === "string" ? req.get("origin") : "";
    const referer = typeof req.get("referer") === "string" ? req.get("referer") : "";
    const source = origin || referer;

    if (!source) {
      res.status(403).json({ message: "Missing request origin." });
      return;
    }

    try {
      const parsed = new URL(source);
      const normalizedOrigin = `${parsed.protocol}//${parsed.host}`.toLowerCase().replace(/\/$/, "");
      if (!allowedOrigins.has(normalizedOrigin)) {
        res.status(403).json({ message: "Request origin not allowed." });
        return;
      }
    } catch {
      res.status(403).json({ message: "Invalid request origin." });
      return;
    }

    next();
  };
}

function createFrontendPathnameGuard() {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const pathname = req.get("x-frontend-pathname");
    if (!pathname) {
      next();
      return;
    }

    if (!/^\/[a-zA-Z0-9/_-]*$/.test(pathname)) {
      res.status(400).json({ message: "Invalid frontend pathname." });
      return;
    }

    next();
  };
}

export function createApp(dependencies: ApplicationDependencies): Express {
  const app = express();
  app.set("trust proxy", true);
  const corsOptions = resolveCorsOptions();
  const allowedOrigins = resolveAllowedOrigins();
  const globalLimiter = createGlobalApiRateLimiter();
  const mutationOriginGuard = createMutationOriginGuard(allowedOrigins);
  const frontendPathnameGuard = createFrontendPathnameGuard();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors(corsOptions));
  // Express 5 rejects "*" here; use a regex to match all routes for preflight.
  app.options(/.*/, cors(corsOptions));
  app.use(cookieParser());
  app.use(express.json({ limit: "100kb" }));
  app.use("/api", globalLimiter);
  app.use("/api", frontendPathnameGuard);
  app.use("/api", mutationOriginGuard);

  app.get("/", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/health", (req, res) => {
    if (!isAllowedInternalSource(req.socket?.remoteAddress ?? "")) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
    res.json({ ok: true });
  });

  if (dependencies.databaseHealthcheck && env.NODE_ENV !== "production") {
    app.get("/test-db", async (req, res, next) => {
      try {
        if (!isAllowedInternalSource(req.socket?.remoteAddress ?? "")) {
          res.status(403).json({ message: "Forbidden" });
          return;
        }
        await dependencies.databaseHealthcheck?.();
        res.send("Database working");
      } catch (error) {
        next(error);
      }
    });
  }

  app.get("/api/logout", (req, res) => {
    const frontendOrigin = resolveSafeFrontendOrigin(req.get("origin"), allowedOrigins);
    const secure = req.secure || env.NODE_ENV === "production";

    // Clear the SSO auth cookie ourselves instead of bouncing through the SSO's
    // /logout page (which does not exist on the production SSO host). A cookie is
    // only deleted when name + Domain + Path match how it was set, so clear the
    // host-only variant plus the SSO-domain-wide variants shared across subdomains.
    const domains: (string | undefined)[] = [undefined];
    try {
      const ssoHost = new URL(env.COE_AUTH_BASE_URL).hostname;
      if (ssoHost.includes(".") && !/^\d+(\.\d+){3}$/.test(ssoHost)) {
        domains.push(ssoHost, `.${ssoHost}`);
      }
    } catch {
      // Unparsable SSO base URL — fall back to host-only clearing.
    }

    for (const cookieName of COE_TOKEN_COOKIE_NAMES) {
      for (const domain of domains) {
        res.clearCookie(cookieName, { path: "/", domain, httpOnly: true, secure, sameSite: "lax" });
      }
    }

    res.redirect(302, frontendOrigin);
  });

  app.use("/api/auth", createAuthRouter(dependencies));
  app.use("/api/users", createUserRouter(dependencies));
  app.use("/api/user", createLegacyUserRouter(dependencies));
  app.use("/api/problems", createProblemRouter(dependencies));
  app.use("/api/contests", createContestRouter(dependencies));
  app.use("/api/submissions", createSubmissionRouter(dependencies));
  app.use("/api/leaderboard", createLeaderboardRouter(dependencies));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
