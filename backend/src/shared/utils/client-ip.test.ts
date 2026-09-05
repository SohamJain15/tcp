import { describe, expect, it, vi } from "vitest";
import { buildTrustedProxyBlockList, isTrustedProxyIp, normalizeIp } from "./client-ip";

/**
 * The list deployed in backend/.env. It mixes plain, IPv4-mapped and CIDR forms, including
 * `::ffff:100.116.102.63/32`, which once expanded to `::/32` and trusted every IPv4 client.
 */
const DEPLOYED_ENTRIES = [
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
  "::ffff:172.17.0.3",
  "::ffff:172.17.0.2",
  "100.116.102.63/32",
  "::ffff:100.116.102.63/32",
  "172.17.0.1",
  "172.17.0.3",
];

const silent = () => {};

describe("normalizeIp", () => {
  it("unwraps IPv4-mapped IPv6 addresses to plain IPv4", () => {
    expect(normalizeIp("::ffff:127.0.0.1")).toEqual({ ip: "127.0.0.1", family: "ipv4" });
    expect(normalizeIp("  ::FFFF:100.116.102.63 ")).toEqual({ ip: "100.116.102.63", family: "ipv4" });
  });

  it("leaves plain IPv4 and real IPv6 addresses alone", () => {
    expect(normalizeIp("203.0.113.9")).toEqual({ ip: "203.0.113.9", family: "ipv4" });
    expect(normalizeIp("::1")).toEqual({ ip: "::1", family: "ipv6" });
  });

  it("rejects non-addresses", () => {
    expect(normalizeIp("not-an-ip")).toBeNull();
    expect(normalizeIp("")).toBeNull();
    expect(normalizeIp(undefined)).toBeNull();
  });
});

describe("buildTrustedProxyBlockList with the deployed .env list", () => {
  const blockList = buildTrustedProxyBlockList(DEPLOYED_ENTRIES, silent);

  it("does not trust arbitrary public IPv4 sources", () => {
    for (const ip of ["203.0.113.9", "8.8.8.8", "1.1.1.1", "192.0.2.55", "::ffff:203.0.113.9"]) {
      expect(isTrustedProxyIp(blockList, ip), `${ip} must not be trusted`).toBe(false);
    }
  });

  it("still trusts the intended proxy hops in both plain and IPv4-mapped form", () => {
    for (const ip of [
      "127.0.0.1",
      "::ffff:127.0.0.1",
      "100.116.102.63",
      "::ffff:100.116.102.63",
      "172.17.0.1",
      "172.17.0.2",
      "172.17.0.3",
      "::1",
    ]) {
      expect(isTrustedProxyIp(blockList, ip), `${ip} must stay trusted`).toBe(true);
    }
  });

  it("keeps the /32 host route tight around its neighbours", () => {
    expect(isTrustedProxyIp(blockList, "100.116.102.62")).toBe(false);
    expect(isTrustedProxyIp(blockList, "100.116.102.64")).toBe(false);
  });
});

describe("buildTrustedProxyBlockList entry handling", () => {
  it("clamps an IPv4-mapped CIDR entry to a host route instead of a mapped-range wildcard", () => {
    const warn = vi.fn();
    const blockList = buildTrustedProxyBlockList(["::ffff:10.0.0.5/32"], warn);

    expect(isTrustedProxyIp(blockList, "10.0.0.5")).toBe(true);
    expect(isTrustedProxyIp(blockList, "10.0.0.6")).toBe(false);
    expect(isTrustedProxyIp(blockList, "203.0.113.9")).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Clamping"), expect.anything());
  });

  it("honours genuine IPv4 CIDR ranges", () => {
    const blockList = buildTrustedProxyBlockList(["172.17.0.0/16"], silent);
    expect(isTrustedProxyIp(blockList, "172.17.5.4")).toBe(true);
    expect(isTrustedProxyIp(blockList, "172.18.5.4")).toBe(false);
  });

  it("honours genuine IPv6 CIDR ranges", () => {
    const blockList = buildTrustedProxyBlockList(["2001:db8::/32"], silent);
    expect(isTrustedProxyIp(blockList, "2001:db8::1")).toBe(true);
    expect(isTrustedProxyIp(blockList, "2001:db9::1")).toBe(false);
    expect(isTrustedProxyIp(blockList, "203.0.113.9")).toBe(false);
  });

  it("ignores malformed entries", () => {
    const warn = vi.fn();
    const blockList = buildTrustedProxyBlockList(
      ["nonsense", "10.0.0.1/33", "10.0.0.1/-1", "10.0.0.1/16/8", "::1/129", ""],
      warn,
    );

    expect(isTrustedProxyIp(blockList, "10.0.0.1")).toBe(false);
    expect(isTrustedProxyIp(blockList, "::1")).toBe(false);
    expect(warn).toHaveBeenCalledTimes(5);
  });
});
