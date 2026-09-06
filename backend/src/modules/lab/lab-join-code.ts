import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The rotating join code a teacher projects during a lab.
 *
 * The code is *derived* from the session secret and the current 30-second step (RFC 4226 dynamic
 * truncation, the same construction as TOTP), so rotation writes nothing to the database and there
 * is no expiry sweep to run. Verification accepts the neighbouring steps too — a student typing a
 * code they read off the board a moment ago should not be punished for the clock.
 */

export const JOIN_CODE_STEP_MS = 30_000;
export const JOIN_CODE_DIGITS = 6;

/** Steps either side of "now" that still verify. One step of slack in each direction. */
const STEP_TOLERANCE = 1;

const CODE_PATTERN = /^\d{6}$/;

export function createJoinCodeSecret(): string {
  return randomBytes(32).toString("hex");
}

export function stepForTime(now: Date): number {
  return Math.floor(now.getTime() / JOIN_CODE_STEP_MS);
}

export function joinCodeForStep(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));

  const digest = createHmac("sha256", secret).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binary % 10 ** JOIN_CODE_DIGITS).toString().padStart(JOIN_CODE_DIGITS, "0");
}

export function currentJoinCode(secret: string, now: Date): { code: string; expiresAt: Date; stepSeconds: number } {
  const step = stepForTime(now);
  return {
    code: joinCodeForStep(secret, step),
    expiresAt: new Date((step + 1) * JOIN_CODE_STEP_MS),
    stepSeconds: JOIN_CODE_STEP_MS / 1000,
  };
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function verifyJoinCode(secret: string, candidate: string | null | undefined, now: Date): boolean {
  if (typeof candidate !== "string") {
    return false;
  }

  const trimmed = candidate.trim();
  // Shape-check before hashing so a malformed value costs nothing.
  if (!CODE_PATTERN.test(trimmed)) {
    return false;
  }

  const step = stepForTime(now);
  let matched = false;
  for (let offset = -STEP_TOLERANCE; offset <= STEP_TOLERANCE; offset += 1) {
    // No early return: keep the work constant regardless of which step matched.
    if (constantTimeEquals(joinCodeForStep(secret, step + offset), trimmed)) {
      matched = true;
    }
  }

  return matched;
}
