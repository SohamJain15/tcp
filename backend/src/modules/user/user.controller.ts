import type { Request, Response } from "express";
import { env } from "../../config/env";
import type { UserRecord } from "./user.model";
import type { UserRepository } from "./user.repository";
import type { UserService } from "./user.service";
import { toUserProfileResponse } from "./user.model";
import { parseUpdateProfilePayload } from "./user.validator";

const DEFAULT_FRONTEND_HOME = "http://localhost:5173";
function normalizeOrigin(origin: string): string {
  return origin.trim().toLowerCase().replace(/\/$/, "");
}

function resolveAllowedOrigins(): Set<string> {
  const configuredOrigins = env.corsOrigins.map(normalizeOrigin);
  return new Set<string>([
    normalizeOrigin(DEFAULT_FRONTEND_HOME),
    ...configuredOrigins,
    ...configuredOrigins
      .filter((origin) => origin.includes("localhost"))
      .map((origin) => origin.replace("localhost", "127.0.0.1")),
    normalizeOrigin(DEFAULT_FRONTEND_HOME.replace("localhost", "127.0.0.1")),
  ]);
}

function resolveSafeFrontendOrigin(candidateOrigin: unknown): string {
  if (typeof candidateOrigin !== "string" || candidateOrigin.trim() === "") {
    return DEFAULT_FRONTEND_HOME;
  }

  const normalizedOrigin = normalizeOrigin(candidateOrigin);
  return resolveAllowedOrigins().has(normalizedOrigin) ? normalizedOrigin : DEFAULT_FRONTEND_HOME;
}

function getDashboardPathForRole(role: "STUDENT" | "FACULTY"): string {
  return role === "FACULTY" ? "/faculty/dashboard" : "/student/dashboard";
}

function hasInvalidStudentUid(uid: string | null): boolean {
  const normalizedUid = uid?.trim() ?? "";
  return normalizedUid === "" || normalizedUid.toLowerCase().includes("mock");
}

function shouldRedirectToCompleteProfile(user: Pick<UserRecord, "role" | "isProfileComplete" | "uid">): boolean {
  if (user.role !== "STUDENT") {
    return !user.isProfileComplete;
  }

  return !user.isProfileComplete || hasInvalidStudentUid(user.uid);
}

interface UserControllerDependencies {
  userService: UserService;
  userRepository: UserRepository;
}

export function createUserController({ userService, userRepository }: UserControllerDependencies) {
  return {
    async handleSsoCallback(req: Request, res: Response): Promise<void> {
      try {
        if (!req.user) {
          res.status(401).json({ message: "Authentication required." });
          return;
        }

        const existingUser = await userRepository.findByEmail(req.user.email);
        const syncedUser = existingUser ?? (await userService.syncAuthenticatedUser(req.user));
        const frontendOrigin = resolveSafeFrontendOrigin(req.query.frontendOrigin);
        const destinationPath = shouldRedirectToCompleteProfile(syncedUser)
          ? "/complete-profile"
          : getDashboardPathForRole(syncedUser.role);

        if (req.method === "POST") {
          res.json({
            ok: true,
            user: toUserProfileResponse(syncedUser, null),
          });
          return;
        }

        const redirectUrl = new URL(destinationPath, `${frontendOrigin}/`);
        redirectUrl.searchParams.set("sso", "success");
        res.redirect(302, redirectUrl.toString());
      } catch (error) {
        console.error("[SSO AUTH FATAL ERROR]:", error);
        res.status(500).json({
          message: "SSO authentication failed. Check backend logs for the exact cause.",
        });
      }
    },

    async getCurrentUser(req: Request, res: Response): Promise<void> {
      const profile = await userService.getCurrentUser(req.user!);
      res.json({ user: profile });
    },

    async getUserByEmail(req: Request, res: Response): Promise<void> {
      const email = Array.isArray(req.params.email) ? req.params.email[0] : req.params.email;
      const profile = await userService.getUserByEmail(email);
      res.json({ user: profile });
    },

    async getCurrentUserAnalytics(req: Request, res: Response): Promise<void> {
      const analytics = await userService.getCurrentUserAnalytics(req.user!);
      res.json({ analytics });
    },

    async getUserAnalyticsByEmail(req: Request, res: Response): Promise<void> {
      const email = Array.isArray(req.params.email) ? req.params.email[0] : req.params.email;
      const analytics = await userService.getUserAnalyticsByEmail(req.user!, email);
      res.json({ analytics });
    },

    async getLegacyProfile(req: Request, res: Response): Promise<void> {
      const profile = await userService.getCurrentUser(req.user!);
      res.json(profile);
    },

    async updateCurrentUserProfile(req: Request, res: Response): Promise<void> {
      const payload = parseUpdateProfilePayload(req.user!.role, req.body);
      const baseUser = (await userRepository.findByEmail(req.user!.email)) ?? (await userService.syncAuthenticatedUser(req.user!));

      if (req.user!.role === "STUDENT") {
        const updatedStudent = await userRepository.update(req.user!.email, {
          name: payload.name,
          uid: payload.uid ?? null,
          rollNumber: payload.rollNumber ?? null,
          department: payload.department,
          semester: payload.semester ?? null,
          linkedInUrl: payload.linkedInUrl,
          githubUrl: payload.githubUrl,
          isProfileComplete: true,
          updatedAt: new Date(),
        });

        req.user = {
          ...req.user!,
          name: updatedStudent.name ?? req.user!.name,
          uid: updatedStudent.uid ?? undefined,
          department: updatedStudent.department ?? undefined,
        };

        const profile = await userService.getCurrentUser(req.user);
        res.json({ user: profile });
        return;
      }

      const updatedFaculty = await userRepository.update(req.user!.email, {
        name: payload.name,
        designation: payload.designation ?? baseUser.designation,
        department: payload.department,
        linkedInUrl: payload.linkedInUrl,
        githubUrl: payload.githubUrl,
        isProfileComplete: true,
        updatedAt: new Date(),
      });

      req.user = {
        ...req.user!,
        name: updatedFaculty.name ?? req.user!.name,
        uid: updatedFaculty.uid ?? undefined,
        department: updatedFaculty.department ?? undefined,
      };

      const profile = await userService.getCurrentUser(req.user);
      res.json({ user: profile });
    },
  };
}
