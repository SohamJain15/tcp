import type { RequestHandler } from "express";
import { AppError } from "../shared/errors/app-error";
import type { UserRole } from "../shared/types/auth";

export function requireRole(...allowedRoles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError(401, "Authentication required"));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError(403, "You are not allowed to access this resource"));
    }

    return next();
  };
}
