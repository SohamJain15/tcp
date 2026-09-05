import { BlockList, isIP } from "node:net";

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
