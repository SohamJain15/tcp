import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { env } from "../../config/env";
import { AppError } from "../errors/app-error";
import { GENERIC_PRODUCTION_ERROR_MESSAGE } from "../errors/public-messages";
import { logServerError } from "../logging/error-logger";

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, "Route not found"));
}

export function formatErrorResponse(
  error: unknown,
  production: boolean,
): { statusCode: number; body: Record<string, unknown> } {
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: {
        message: "Validation failed",
        details: {
          ...error.flatten(),
          fieldIssues: error.issues.map((issue) => ({
            path: issue.path.length > 0 ? issue.path.join(".") : "json",
            message: issue.message,
          })),
        },
      },
    };
  }

  if (error instanceof AppError) {
    const hideInternalDetails = production && error.statusCode >= 500;
    return {
      statusCode: error.statusCode,
      body: {
        message: hideInternalDetails
          ? error.publicMessage ?? GENERIC_PRODUCTION_ERROR_MESSAGE
          : error.message,
        ...(!hideInternalDetails && error.details !== undefined ? { details: error.details } : {}),
      },
    };
  }

  return {
    statusCode: 500,
    body: {
      message:
        production
          ? GENERIC_PRODUCTION_ERROR_MESSAGE
          : error instanceof Error
            ? error.message
            : "Internal server error",
    },
  };
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  const formatted = formatErrorResponse(error, env.NODE_ENV === "production");
  logServerError("HTTP request failed", error, {
    method: req.method,
    path: req.path,
    statusCode: formatted.statusCode,
  });
  res.status(formatted.statusCode).json(formatted.body);
}
