import type { Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env } from "../config/env";

function rateLimitHandler(_req: Request, res: Response): void {
  res.status(429).json({
    message: "Too many requests. Please wait a moment and try again.",
  });
}

function hasAuthenticationHints(req: Request): boolean {
  return Boolean(
    req.headers.authorization ||
      req.headers["x-coe-token"] ||
      req.headers["x-coe-email"] ||
      req.headers.cookie,
  );
}

export function createGlobalApiRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: (req) => (hasAuthenticationHints(req) ? 300 : 60),
    standardHeaders: true,
    legacyHeaders: false,
    // `trust proxy` is intentionally enabled for reverse-proxy deployments.
    // We enforce proxy source trust in auth middleware, so skip this warning.
    validate: {
      trustProxy: false,
    },
    keyGenerator: (req) =>
      req.headers.authorization?.toString() ??
      req.headers["x-coe-email"]?.toString() ??
      ipKeyGenerator(req.ip),
    handler: rateLimitHandler,
  });
}

function finalSubmissionKey(req: Request): string {
  return req.user?.email ?? "anonymous";
}

export function createFinalSubmissionRateLimiters() {
  return [
    rateLimit({
      windowMs: 60 * 1000,
      max: 1,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: finalSubmissionKey,
      skip: () => env.NODE_ENV === "test",
      handler: (_req, res) => {
        res.status(429).json({
          message: "Please wait at least one minute before submitting again.",
        });
      },
    }),
    rateLimit({
      windowMs: 60 * 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: finalSubmissionKey,
      skip: () => env.NODE_ENV === "test",
      handler: (_req, res) => {
        res.status(429).json({
          message: "You have reached the hourly submission limit. Please try again later.",
        });
      },
    }),
  ];
}

export function createCodeExecutionRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: finalSubmissionKey,
    skip: () => env.NODE_ENV === "test",
    handler: (_req, res) => {
      res.status(429).json({
        message: "You have reached the code execution limit. Please try again later.",
      });
    },
  });
}
