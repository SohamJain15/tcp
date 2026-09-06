import type { Request } from "express";
import { beforeEach, describe, expect, it } from "vitest";

import {
  ipInNetwork,
  normalizeIp,
  resetClientIpCacheForTests,
  resolveClientIp,
  resolveClientIpFromChain,
  toNetworkCidr,
} from "./client-ip";

/** The proxies these tests treat as "our own infrastructure". */
const TRUSTED = ["127.0.0.1", "::1", "172.17.0.0/16"];

function resolve(chain: string[], remoteAddress = "127.0.0.1"): string | null {
  return resolveClientIpFromChain(chain, remoteAddress, TRUSTED);
}

function request(ips: string[], remoteAddress = "127.0.0.1"): Request {
  return { ips, socket: { remoteAddress } } as unknown as Request;
}

beforeEach(() => {
  resetClientIpCacheForTests();
});

describe("normalizeIp", () => {
  it("unwraps IPv4-mapped IPv6", () => {
    expect(normalizeIp("::ffff:203.0.113.7")).toEqual({ ip: "203.0.113.7", family: "ipv4" });
  });

  it("keeps a real IPv6 address as IPv6", () => {
    expect(normalizeIp("2001:db8::1")).toEqual({ ip: "2001:db8::1", family: "ipv6" });
  });

  it("rejects anything that is not an address", () => {
    for (const value of ["", "   ", "not-an-ip", null, undefined]) {
      expect(normalizeIp(value)).toBeNull();
    }
  });
});

describe("resolveClientIp", () => {
  it("ignores a forged left-hand X-Forwarded-For prefix", () => {
    // A student claiming to be the teacher: the forged hop sits left of the real one.
    expect(resolve(["10.20.30.5", "203.0.113.9", "127.0.0.1"])).toBe("203.0.113.9");
  });

  it("returns the rightmost untrusted hop", () => {
    expect(resolve(["198.51.100.1", "203.0.113.9", "172.17.0.1"])).toBe("203.0.113.9");
  });

  it("falls back to the socket address when every hop is a trusted proxy", () => {
    expect(resolve(["127.0.0.1", "::1"], "::ffff:198.51.100.4")).toBe("198.51.100.4");
  });

  it("falls back to the socket address with no forwarded chain at all", () => {
    expect(resolve([], "198.51.100.4")).toBe("198.51.100.4");
  });

  it("returns null when nothing resolves", () => {
    expect(resolve([], "garbage")).toBeNull();
  });

  it("reads the request through the configured proxy list", () => {
    // Whatever COE_TRUSTED_PROXY_IPS holds, an untrusted public hop is still the answer.
    expect(resolveClientIp(request(["203.0.113.9"], "127.0.0.1"))).toBe("203.0.113.9");
  });
});

describe("toNetworkCidr", () => {
  it("masks an IPv4 address to its /24", () => {
    expect(toNetworkCidr("10.20.30.47")).toBe("10.20.30.0/24");
    expect(toNetworkCidr("10.20.30.47", 16)).toBe("10.20.0.0/16");
  });

  it("pairs an IPv6 address with its prefix", () => {
    expect(toNetworkCidr("2001:db8::5")).toBe("2001:db8::5/64");
  });

  it("returns null for a non-address", () => {
    expect(toNetworkCidr("not-an-ip")).toBeNull();
  });
});

describe("ipInNetwork", () => {
  it("accepts an address on the same /24", () => {
    expect(ipInNetwork("10.20.30.99", "10.20.30.0/24")).toBe(true);
  });

  it("rejects an address on another network", () => {
    expect(ipInNetwork("10.20.31.99", "10.20.30.0/24")).toBe(false);
  });

  it("accepts an IPv4-mapped form of an address on the network", () => {
    expect(ipInNetwork("::ffff:10.20.30.99", "10.20.30.0/24")).toBe(true);
  });

  it("never matches across address families", () => {
    expect(ipInNetwork("2001:db8::1", "10.20.30.0/24")).toBe(false);
  });

  it("fails closed on missing or malformed input", () => {
    expect(ipInNetwork(null, "10.20.30.0/24")).toBe(false);
    expect(ipInNetwork("10.20.30.1", null)).toBe(false);
    expect(ipInNetwork("10.20.30.1", "10.20.30.0")).toBe(false);
  });
});
