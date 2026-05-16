import type { UserRole } from "@/api/types";

export function getHomePathForRole(role: UserRole): string {
  return role === "FACULTY" ? "/faculty/dashboard" : "/student/dashboard";
}
