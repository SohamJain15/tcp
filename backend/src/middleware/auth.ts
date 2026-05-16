import { BlockList, isIP } from "node:net";
import type { Request, RequestHandler } from "express";
import { env } from "../config/env";
import type { UserService } from "../modules/user/user.service";
import type { UserRole } from "../shared/types/auth";

const REQUIRED_COE_HEADERS = ["x-coe-email", "x-coe-name", "x-coe-role", "x-coe-status"] as const;
const ACTIVE_STATUS = "ACTIVE";

type CoeHeaderRole = "ADMIN" | "FACULTY" | "INDUSTRY" | "STUDENT";
type CoeHeaderName = (typeof REQUIRED_COE_HEADERS)[number];

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

function normalizeRole(rawRole: string): CoeHeaderRole | null {
  const normalized = rawRole.trim().toUpperCase();
  if (!ALLOWED_COE_ROLES.has(normalized as CoeHeaderRole)) {
    return null;
  }

  return normalized as CoeHeaderRole;
}

function mapCoeRoleToPlatformRole(rawRole: CoeHeaderRole): UserRole {
  return rawRole === "STUDENT" ? "STUDENT" : "FACULTY";
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

function parseTrustedProxyEntries(entries: string[]): BlockList {
  const blockList = new BlockList();

  for (const entry of entries.map((value) => value.trim()).filter(Boolean)) {
    if (entry.includes("/")) {
      const [network, rawPrefix] = entry.split("/", 2);
      const ipVersion = isIP(network);
      const parsedPrefix = Number.parseInt(rawPrefix, 10);

      if (ipVersion === 4 && Number.isInteger(parsedPrefix) && parsedPrefix >= 0 && parsedPrefix <= 32) {
        blockList.addSubnet(network, parsedPrefix, "ipv4");
        continue;
      }

      if (ipVersion === 6 && Number.isInteger(parsedPrefix) && parsedPrefix >= 0 && parsedPrefix <= 128) {
        blockList.addSubnet(network, parsedPrefix, "ipv6");
        continue;
      }

      console.warn("[AUTH] Ignoring invalid trusted proxy CIDR entry.", { entry });
      continue;
    }

    const ipVersion = isIP(entry);
    if (ipVersion === 4) {
      blockList.addAddress(entry, "ipv4");
      continue;
    }
    if (ipVersion === 6) {
      blockList.addAddress(entry, "ipv6");
      continue;
    }

    console.warn("[AUTH] Ignoring invalid trusted proxy IP entry.", { entry });
  }

  return blockList;
}

function isTrustedProxySource(req: Request, trustedProxyBlockList: BlockList): boolean {
  const sourceIp = normalizeHeaderValue(req.socket?.remoteAddress);
  const ipVersion = isIP(sourceIp);

  if (ipVersion !== 4 && ipVersion !== 6) {
    return false;
  }

  return trustedProxyBlockList.check(sourceIp, ipVersion === 4 ? "ipv4" : "ipv6");
}

function logSecurityEvent(
  event: "auth_missing_headers" | "auth_inactive_user" | "auth_invalid_header_payload" | "auth_untrusted_proxy",
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

export function createAuthMiddleware(userService: Pick<UserService, "syncAuthenticatedUser">): RequestHandler {
  const trustedProxyBlockList = parseTrustedProxyEntries([
    "127.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    ...env.coeTrustedProxyIps,
  ]);
  const requiresTrustedProxySource = env.COE_REQUIRE_TRUSTED_PROXY;

  return async (req, res, next) => {
    try {
      // Trusted reverse-proxy architecture:
      // CoE auth is handled upstream (Cloudflare/Tailscale/reverse proxy), and only authenticated
      // requests are forwarded to this backend with x-coe-* identity headers.
      // Do NOT expose this backend directly to the public internet, or clients could spoof headers.
      if (requiresTrustedProxySource && !isTrustedProxySource(req, trustedProxyBlockList)) {
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
      if (missingHeaders.length > 0) {
        logSecurityEvent("auth_missing_headers", req, {
          missingHeaders,
        });
        res.status(401).json({ message: "Unauthorized: missing authentication headers." });
        return;
      }

      if (!isValidEmail(email)) {
        logSecurityEvent("auth_invalid_header_payload", req, {
          message: "Invalid x-coe-email format.",
          email,
        });
        res.status(401).json({ message: "Unauthorized: invalid authentication headers." });
        return;
      }

      const normalizedRole = normalizeRole(roleHeader);
      if (!normalizedRole) {
        logSecurityEvent("auth_invalid_header_payload", req, {
          message: "Invalid x-coe-role value.",
          roleHeader,
          email: maskEmail(email),
        });
        res.status(401).json({ message: "Unauthorized: invalid authentication headers." });
        return;
      }

      if (status !== ACTIVE_STATUS) {
        logSecurityEvent("auth_inactive_user", req, {
          email: maskEmail(email),
          status,
        });
        res.status(403).json({ message: `Account is ${status || "NOT_ACTIVE"}.` });
        return;
      }

      const resolvedUser = await userService.syncAuthenticatedUser({
        email,
        role: mapCoeRoleToPlatformRole(normalizedRole),
        name,
      });

      req.user = {
        email: resolvedUser.email,
        role: resolvedUser.role,
        name: resolvedUser.name ?? name,
      };

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
