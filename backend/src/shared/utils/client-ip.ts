import { BlockList, isIP } from "node:net";
import type { Request } from "express";

import { env } from "../../config/env";

export type IpFamily = "ipv4" | "ipv6";

export type NormalizedIp = {
  /** The address in its canonical family form (IPv4-mapped IPv6 unwrapped to plain IPv4). */
  ip: string;
  family: IpFamily;
};

/** `::ffff:127.0.0.1` and friends — the IPv4-mapped IPv6 form Node hands us on dual-stack sockets. */
const IPV4_MAPPED_PREFIX = /^::ffff:/i;

/**
 * Parse an address into its canonical form, unwrapping IPv4-mapped IPv6 (`::ffff:a.b.c.d`)
 * to plain IPv4. Returns null for anything that is not a valid IP.
 *
 * Unwrapping matters because `BlockList.check(ip, "ipv4")` treats an IPv4 address as
 * equivalent to its mapped IPv6 form: a rule stored in mapped space silently applies to
 * plain IPv4 traffic, so mapped entries must never reach `addSubnet` with their 128-bit
 * prefix length intact.
 */
export function normalizeIp(rawValue: unknown): NormalizedIp | null {
  const value = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!value) {
    return null;
  }

  const version = isIP(value);
  if (version === 4) {
    return { ip: value, family: "ipv4" };
  }
  if (version !== 6) {
    return null;
  }

  if (IPV4_MAPPED_PREFIX.test(value)) {
    const unwrapped = value.replace(IPV4_MAPPED_PREFIX, "");
    if (isIP(unwrapped) === 4) {
      return { ip: unwrapped, family: "ipv4" };
    }
  }

  return { ip: value, family: "ipv6" };
}

type WarnFn = (message: string, details: Record<string, unknown>) => void;

const defaultWarn: WarnFn = (message, details) => {
  console.warn(message, details);
};

/**
 * Build a BlockList of trusted reverse-proxy sources from configured entries
 * (`127.0.0.1`, `::1`, `::ffff:172.17.0.3`, `100.116.102.63/32`, ...).
 *
 * Every entry is normalized through {@link normalizeIp} first. A CIDR entry written in
 * IPv4-mapped form carries a prefix measured against the 128-bit address, which cannot be
 * reinterpreted against the unwrapped 32-bit address — `::ffff:100.116.102.63/32` would
 * otherwise land as `::/32`, covering the whole `::ffff:0:0/96` mapped range and trusting
 * every IPv4 client. Such entries are clamped to a /32 host route, which is what they were
 * meant to express.
 */
export function buildTrustedProxyBlockList(entries: readonly string[], warn: WarnFn = defaultWarn): BlockList {
  const blockList = new BlockList();

  for (const entry of entries.map((value) => value.trim()).filter(Boolean)) {
    const separatorIndex = entry.indexOf("/");

    if (separatorIndex === -1) {
      const normalized = normalizeIp(entry);
      if (!normalized) {
        warn("[AUTH] Ignoring invalid trusted proxy IP entry.", { entry });
        continue;
      }
      blockList.addAddress(normalized.ip, normalized.family);
      continue;
    }

    const network = entry.slice(0, separatorIndex);
    const rawPrefix = entry.slice(separatorIndex + 1).trim();
    const writtenVersion = isIP(network.trim());
    const normalized = normalizeIp(network);

    if (!normalized || (writtenVersion !== 4 && writtenVersion !== 6) || !/^\d{1,3}$/.test(rawPrefix)) {
      warn("[AUTH] Ignoring invalid trusted proxy CIDR entry.", { entry });
      continue;
    }

    const parsedPrefix = Number.parseInt(rawPrefix, 10);
    const maxWrittenPrefix = writtenVersion === 4 ? 32 : 128;
    if (parsedPrefix < 0 || parsedPrefix > maxWrittenPrefix) {
      warn("[AUTH] Ignoring invalid trusted proxy CIDR entry.", { entry });
      continue;
    }

    const unwrappedFromIpv6 = normalized.family === "ipv4" && writtenVersion === 6;
    const prefix = unwrappedFromIpv6 ? 32 : parsedPrefix;

    if (unwrappedFromIpv6 && parsedPrefix !== 128) {
      warn("[AUTH] Clamping IPv4-mapped trusted proxy CIDR entry to a /32 host route.", {
        entry,
        address: normalized.ip,
      });
    }

    blockList.addSubnet(normalized.ip, prefix, normalized.family);
  }

  return blockList;
}

/** Check a raw remote address (possibly IPv4-mapped) against a trusted-proxy BlockList. */
export function isTrustedProxyIp(blockList: BlockList, rawIp: unknown): boolean {
  const normalized = normalizeIp(rawIp);
  return normalized ? blockList.check(normalized.ip, normalized.family) : false;
}

// --- client address resolution, for access decisions -------------------------

/**
 * `app.ts` sets `trust proxy` to `true`, which makes Express hand back the *leftmost* forwarded
 * entry as `req.ip` — an address the client chose. That is fine for logging and rate-limit keying,
 * but it must never be the basis of an access decision: a student could send
 * `X-Forwarded-For: <teacher-ip>` and walk straight through the lab network gate.
 *
 * These helpers instead walk the forwarded chain from the right (nearest proxy) and return the
 * first hop that is not one of our own trusted proxies. Everything to its left was supplied by the
 * client and is discarded.
 */

let cachedTrustedProxies: BlockList | null = null;

function trustedProxies(): BlockList {
  cachedTrustedProxies ??= buildTrustedProxyBlockList(env.coeTrustedProxyIps);
  return cachedTrustedProxies;
}

/**
 * The pure core of {@link resolveClientIp}, with the trusted-proxy list passed in.
 *
 * `chain` is ordered left (claimed origin) → right (nearest proxy). The first hop from the right
 * that we do not recognise as our own proxy is the furthest address our own infrastructure
 * actually observed. If every hop is trusted — or the header is absent — we fall back to the
 * socket address, which cannot be forged.
 */
export function resolveClientIpFromChain(
  chain: readonly string[],
  remoteAddress: string | null | undefined,
  trustedEntries: readonly string[],
): string | null {
  return resolveFromChain(chain, remoteAddress, buildTrustedProxyBlockList(trustedEntries, () => {}));
}

function resolveFromChain(
  chain: readonly string[],
  remoteAddress: string | null | undefined,
  blockList: BlockList,
): string | null {
  // Forwarded headers are meaningful only when the immediate peer is our proxy.
  const remote = normalizeIp(remoteAddress);
  if (!remote) return null;
  if (!blockList.check(remote.ip, remote.family)) return remote.ip;
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const hop = normalizeIp(chain[index]);
    if (!hop) return null;
    if (hop && !blockList.check(hop.ip, hop.family)) {
      return hop.ip;
    }
  }

  return normalizeIp(remoteAddress)?.ip ?? null;
}

/** The real client address, ignoring anything a client could have forged into `X-Forwarded-For`. */
export function resolveClientIp(req: Request): string | null {
  return resolveFromChain(Array.isArray(req.ips) ? req.ips : [], req.socket?.remoteAddress, trustedProxies());
}

/** The network an address belongs to, e.g. "10.20.30.4" → "10.20.30.0/24". */
export function toNetworkCidr(ip: string, ipv4Prefix = 24, ipv6Prefix = 64): string | null {
  const normalized = normalizeIp(ip);
  if (!normalized) {
    return null;
  }

  if (normalized.family === "ipv4") {
    const prefix = Math.min(Math.max(ipv4Prefix, 0), 32);
    const octets = normalized.ip.split(".").map((part) => Number.parseInt(part, 10));
    const asInt = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const network = (asInt & mask) >>> 0;
    const networkOctets = [network >>> 24, (network >>> 16) & 0xff, (network >>> 8) & 0xff, network & 0xff];
    return `${networkOctets.join(".")}/${prefix}`;
  }

  // IPv6: BlockList masks for us, so the address paired with the prefix is a valid subnet
  // specification. Normalising the host bits away is not required for containment checks.
  return `${normalized.ip}/${Math.min(Math.max(ipv6Prefix, 0), 128)}`;
}

/** Whether `candidate` falls inside the `<network>/<prefix>` produced by {@link toNetworkCidr}. */
export function ipInNetwork(candidate: string | null | undefined, cidr: string | null | undefined): boolean {
  const normalized = normalizeIp(candidate);
  if (!normalized || typeof cidr !== "string" || !cidr.includes("/")) {
    return false;
  }

  const separatorIndex = cidr.indexOf("/");
  const network = normalizeIp(cidr.slice(0, separatorIndex));
  const prefix = Number.parseInt(cidr.slice(separatorIndex + 1), 10);

  // Never match across address families, and fail closed on anything malformed.
  if (!network || network.family !== normalized.family || !Number.isInteger(prefix)) {
    return false;
  }

  const list = new BlockList();
  list.addSubnet(network.ip, prefix, network.family);
  return list.check(normalized.ip, normalized.family);
}

/** Test seam — the trusted-proxy list is read once and cached. */
export function resetClientIpCacheForTests(): void {
  cachedTrustedProxies = null;
}
