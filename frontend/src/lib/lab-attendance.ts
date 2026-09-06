import type { FacultyAttendanceSession } from "@/api/types";

/**
 * Whether a session is still accepting students.
 *
 * `state` alone is not enough. A session auto-closes by reaching `expiresAt` — the hard stop that
 * stops a forgotten session gating the lab overnight — and that happens without anything writing
 * `state: "CLOSED"` back to the record. Reading `state === "OPEN"` on its own would leave last
 * week's lab showing as live on the teacher's console, and keep it out of the history list.
 */
export function isAttendanceSessionLive(
  session: Pick<FacultyAttendanceSession, "state" | "expiresAt">,
  now: Date = new Date(),
): boolean {
  return session.state === "OPEN" && new Date(session.expiresAt).getTime() > now.getTime();
}
