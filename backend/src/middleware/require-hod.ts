import type { RequestHandler } from "express";
import type { UserRepository } from "../modules/user/user.repository";
import { AppError } from "../shared/errors/app-error";

/**
 * Gate for the department participation views.
 *
 * The HOD's department is resolved here, from the saved profile, and attached to the
 * request as `hodContext`. It is deliberately never read from the query string: the
 * scope of every department endpoint is therefore fixed by who the caller is, and a
 * client cannot widen it by asking for another department.
 *
 * The record is loaded fresh from the repository because the authenticated identity
 * (`req.user`) carries only email/role/name — the CoE token has no department, and no
 * HOD flag. That also means revoking HOD takes effect on the next request.
 */
export function createRequireHod(userRepository: UserRepository): RequestHandler {
  return async (req, _res, next) => {
    try {
      if (!req.user) {
        return next(new AppError(401, "Authentication required"));
      }

      const user = await userRepository.getByEmail(req.user.email);

      // One message for every rejection, so the response never reveals whether the
      // caller merely lacks the flag or the route exists at all.
      if (!user || user.role !== "FACULTY" || user.isHod !== true) {
        return next(new AppError(403, "You are not allowed to access this resource"));
      }

      if (!user.department) {
        return next(new AppError(403, "Set your department in your profile to use department views"));
      }

      req.hodContext = { department: user.department };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
