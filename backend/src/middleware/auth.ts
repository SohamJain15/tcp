import type { BlockList } from "node:net";
import type { Request, RequestHandler } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "../config/env";
import { buildTrustedProxyBlockList, isTrustedProxyIp, normalizeIp } from "../shared/utils/client-ip";
import type { UserService } from "../modules/user/user.service";
import type { UserRole } from "../shared/types/auth";

const REQUIRED_COE_HEADERS = ["x-coe-email", "x-coe-name", "x-coe-role", "x-coe-status"] as const;
export const COE_TOKEN_COOKIE_NAMES = ["coe_shared_token", "coe_token", "coe_jwt", "coe_auth_token"] as const;
const ACTIVE_STATUS = "ACTIVE";

type CoeHeaderRole = "ADMIN" | "FACULTY" | "INDUSTRY" | "STUDENT";
type CoeHeaderName = (typeof REQUIRED_COE_HEADERS)[number];
type CoeTokenPayload = {
  email: string;
  name: string;
  role: CoeHeaderRole;
  status: string;
  // New optional CoE claims: stable user id and HOD flag (JWT-only, no headers).
  uid?: string;
  isHod?: boolean;
};

const ALLOWED_COE_ROLES = new Set<CoeHeaderRole>(["ADMIN", "FACULTY", "INDUSTRY", "STUDENT"]);

function normalizeHeaderValue(rawValue: unknown): string {
  if (typeof rawValue === "string") {
    return rawValue.trim();
  }

  if (Array.isArray(rawValue) && rawValue.length > 0 && typeof rawValue[0] === "string") {
    return rawValue[0].trim();
  }

  return "";
}

function getHeaderValue(req: Request, headerName: CoeHeaderName): string {
  return normalizeHeaderValue(req.headers[headerName]);
}

function getCoeTokenFromRequest(req: Request): string {
  const explicitHeaderToken = normalizeHeaderValue(req.headers["x-coe-token"]);
  if (explicitHeaderToken) {
    return explicitHeaderToken;
  }

  const authorizationHeader = normalizeHeaderValue(req.headers.authorization);
  if (authorizationHeader.toLowerCase().startsWith("bearer ")) {
    return authorizationHeader.slice("bearer ".length).trim();
  }

  for (const cookieName of COE_TOKEN_COOKIE_NAMES) {
    const cookieToken = normalizeHeaderValue(req.cookies?.[cookieName]);
    if (cookieToken) {
      return cookieToken;
    }
  }

  return "";
}

function normalizeRole(rawRole: string): CoeHeaderRole | null {
  const normalized = rawRole.trim().toUpperCase();
  if (!ALLOWED_COE_ROLES.has(normalized as CoeHeaderRole)) {
    return null;
  }

  return normalized as CoeHeaderRole;
}

/**
 * Maps a CoE role onto a platform role, or `null` when the account type has no access here.
 *
 * `ADMIN` is institute leadership and becomes a read-only analytics role — note this is a privilege
 * *reduction*: before this mapping existed, ADMIN collapsed into FACULTY and carried full authoring,
 * contest-creation and grading rights.
 *
 * `INDUSTRY` is rejected outright. It previously collapsed into FACULTY too, which handed external
 * industry accounts the ability to author problems and publish contest results. Until there is a
 * deliberate decision about what industry users should be able to do, no access is the safe answer;
 * granting them a role later is a one-line change here.
 */
function mapCoeRoleToPlatformRole(rawRole: CoeHeaderRole): UserRole | null {
  switch (rawRole) {
    case "STUDENT":
      return "STUDENT";
    case "FACULTY":
      return "FACULTY";
    case "ADMIN":
      return "ADMIN";
    case "INDUSTRY":
      return null;
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) {
    return "unknown";
  }

  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(local.length - visible.length, 0))}@${domain}`;
}

function defaultNameFromEmail(email: string): string {
  const localPart = email.split("@")[0]?.trim();
  return localPart || email;
}

function decodeAndValidateToken(token: string): CoeTokenPayload | null {
  const secret = env.COE_JWT_SECRET.trim();
  if (!token) {
    return null;
  }

  let payload: JwtPayload | string;
  try {
    payload = jwt.verify(token, secret, {
      algorithms: ["HS256"],
    });
  } catch {
    return null;
  }

  if (!payload || typeof payload === "string") {
    return null;
  }

  const email = normalizeHeaderValue(payload.email).toLowerCase();
  const normalizedRole = normalizeRole(normalizeHeaderValue(payload.role));
  const status = normalizeHeaderValue(payload.status).toUpperCase();
  const tokenName = normalizeHeaderValue(payload.name);

  if (!email || !normalizedRole || !status || !isValidEmail(email)) {
    return null;
  }

  return {
    email,
    role: normalizedRole,
    status,
    name: tokenName || defaultNameFromEmail(email),
    ...extractExtraClaims(payload),
  };
}

/**
 * Read the new optional CoE claims (`uid`, `isHod`) from a verified JWT payload.
 * These live only in the JWT (not the x-coe-* headers), so we also read them on the
 * header path (best-effort) from the forwarded token cookie.
 */
function extractExtraClaims(payload: JwtPayload): { uid?: string; isHod?: boolean } {
  const result: { uid?: string; isHod?: boolean } = {};
  const uid = normalizeHeaderValue(payload.uid);
  if (uid) {
    result.uid = uid;
  }
  if (typeof payload.isHod === "boolean") {
    result.isHod = payload.isHod;
  } else if (typeof payload.isHod === "string") {
    result.isHod = payload.isHod.trim().toLowerCase() === "true";
  }
  return result;
}

/**
 * Best-effort decode of the CoE token purely to enrich identity with `uid`/`isHod`.
 * Returns nothing if the token is absent/invalid — enrichment is optional and must
 * never block a request that authenticated via headers.
 */
function readExtraClaimsFromToken(token: string): { uid?: string; isHod?: boolean } {
  const decoded = decodeAndValidateToken(token);
  return decoded ? { uid: decoded.uid, isHod: decoded.isHod } : {};
}

function isTrustedProxySource(req: Request, trustedProxyBlockList: BlockList): boolean {
  return isTrustedProxyIp(trustedProxyBlockList, req.socket?.remoteAddress);
}

function logSecurityEvent(
  event:
    | "auth_missing_headers"
    | "auth_inactive_user"
    | "auth_invalid_header_payload"
    | "auth_invalid_token_payload"
    | "auth_untrusted_proxy"
    /** A valid, active CoE account whose role has no access to this platform (currently INDUSTRY). */
    | "auth_unsupported_role",
  req: Request,
  details: Record<string, unknown> = {},
): void {
  console.warn("[AUTH]", {
    event,
    method: req.method,
    path: req.originalUrl,
    sourceIp: req.socket?.remoteAddress,
    clientIp: req.ip,
    forwardedChain: req.ips,
    ...details,
  });
}

function logTrustedProxyDiagnostic(req: Request, trustedProxyBlockList: BlockList): void {
  const rawSourceIp = normalizeHeaderValue(req.socket?.remoteAddress);
  const normalized = normalizeIp(rawSourceIp);
  const normalizedSourceIp = normalized?.ip ?? "";
  const ipVersion = normalized ? (normalized.family === "ipv4" ? 4 : 6) : 0;
  const allowed = normalized !== null && trustedProxyBlockList.check(normalized.ip, normalized.family);

  console.warn("[AUTH] Trusted proxy diagnostic:", {
    method: req.method,
    path: req.originalUrl,
    rawSourceIp,
    normalizedSourceIp,
    ipVersion,
    allowed,
    clientIp: req.ip,
    forwardedChain: req.ips,
    xForwardedFor: normalizeHeaderValue(req.headers["x-forwarded-for"]),
    xRealIp: normalizeHeaderValue(req.headers["x-real-ip"]),
    cfConnectingIp: normalizeHeaderValue(req.headers["cf-connecting-ip"]),
    xForwardedProto: normalizeHeaderValue(req.headers["x-forwarded-proto"]),
    host: normalizeHeaderValue(req.headers.host),
  });
}

export function createAuthMiddleware(userService: Pick<UserService, "syncAuthenticatedUser">): RequestHandler {
  const trustedProxyBlockList = buildTrustedProxyBlockList(env.coeTrustedProxyIps);

  return async (req, res, next) => {
    try {
      // Trusted reverse-proxy architecture:
      // CoE auth is handled upstream (Cloudflare/Tailscale/reverse proxy), and only authenticated
      // requests are forwarded to this backend with x-coe-* identity headers.
      // Do NOT expose this backend directly to the public internet, or clients could spoof headers.
      if (!isTrustedProxySource(req, trustedProxyBlockList)) {
        logTrustedProxyDiagnostic(req, trustedProxyBlockList);
        logSecurityEvent("auth_untrusted_proxy", req, {
          message: "Rejected request from untrusted source.",
          xForwardedFor: normalizeHeaderValue(req.headers["x-forwarded-for"]),
          cfConnectingIp: normalizeHeaderValue(req.headers["cf-connecting-ip"]),
        });
        res.status(401).json({ message: "Unauthorized source." });
        return;
      }

      const email = getHeaderValue(req, "x-coe-email").toLowerCase();
      const name = getHeaderValue(req, "x-coe-name");
      const roleHeader = getHeaderValue(req, "x-coe-role");
      const status = getHeaderValue(req, "x-coe-status").toUpperCase();

      const missingHeaders = REQUIRED_COE_HEADERS.filter((headerName) => getHeaderValue(req, headerName) === "");
      let authenticatedEmail = email;
      let authenticatedName = name;
      let authenticatedRole: CoeHeaderRole | null = null;
      let authenticatedStatus = status;
      // uid/isHod live only in the JWT payload; capture them regardless of which
      // path authenticated the request.
      let extraClaims: { uid?: string; isHod?: boolean } = {};

      if (missingHeaders.length === 0) {
        if (!isValidEmail(email)) {
          logSecurityEvent("auth_invalid_header_payload", req, {
            message: "Invalid x-coe-email format.",
            email,
          });
          res.status(401).json({ message: "Unauthorized: invalid authentication headers." });
          return;
        }

        authenticatedRole = normalizeRole(roleHeader);
        if (!authenticatedRole) {
          logSecurityEvent("auth_invalid_header_payload", req, {
            message: "Invalid x-coe-role value.",
            roleHeader,
            email: maskEmail(email),
          });
          res.status(401).json({ message: "Unauthorized: invalid authentication headers." });
          return;
        }

        // Enrich with uid/isHod from the forwarded JWT cookie (best-effort).
        extraClaims = readExtraClaimsFromToken(getCoeTokenFromRequest(req));
      } else {
        const token = getCoeTokenFromRequest(req);
        const tokenPayload = decodeAndValidateToken(token);

        if (!tokenPayload) {
          logSecurityEvent("auth_missing_headers", req, {
            missingHeaders,
            hasToken: token !== "",
          });
          res.status(401).json({ message: "Unauthorized: missing authentication headers." });
          return;
        }

        authenticatedEmail = tokenPayload.email;
        authenticatedName = tokenPayload.name;
        authenticatedRole = tokenPayload.role;
        authenticatedStatus = tokenPayload.status;
        extraClaims = { uid: tokenPayload.uid, isHod: tokenPayload.isHod };
      }

      if (authenticatedRole === null) {
        logSecurityEvent("auth_invalid_token_payload", req, {
          message: "Token did not contain a valid role.",
        });
        res.status(401).json({ message: "Unauthorized: invalid authentication token." });
        return;
      }

      if (authenticatedStatus !== ACTIVE_STATUS) {
        logSecurityEvent("auth_inactive_user", req, {
          email: maskEmail(authenticatedEmail),
          status: authenticatedStatus,
        });
        res.status(403).json({ message: `Account is ${authenticatedStatus || "NOT_ACTIVE"}.` });
        return;
      }

      // Checked after the status gate so an inactive account still gets the more specific message.
      const platformRole = mapCoeRoleToPlatformRole(authenticatedRole);
      if (platformRole === null) {
        logSecurityEvent("auth_unsupported_role", req, {
          email: maskEmail(authenticatedEmail),
          role: authenticatedRole,
        });
        res.status(403).json({
          message: `${authenticatedRole} accounts do not have access to the coding platform.`,
        });
        return;
      }

      const resolvedUser = await userService.syncAuthenticatedUser({
        email: authenticatedEmail,
        role: platformRole,
        name: authenticatedName || defaultNameFromEmail(authenticatedEmail),
        uid: extraClaims.uid,
        isHod: extraClaims.isHod,
      });

      req.user = {
        email: resolvedUser.email,
        role: resolvedUser.role,
        name: resolvedUser.name ?? authenticatedName,
        uid: resolvedUser.uid ?? undefined,
        department: resolvedUser.department ?? undefined,
        isHod: resolvedUser.isHod,
      };

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
