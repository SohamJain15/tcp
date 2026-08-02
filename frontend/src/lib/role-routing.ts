import type { UserRole } from "@/api/types";

/**
 * Where a role lands after sign-in, and where RoleRoute redirects someone who reached a route that
 * is not theirs. A `switch` rather than a ternary so a new role becomes a compile error instead of a
 * silent redirect to the student dashboard.
 */
export function getHomePathForRole(role: UserRole): string {
  switch (role) {
    case "ADMIN":
      return "/admin/dashboard";
    case "FACULTY":
      return "/faculty/dashboard";
    case "STUDENT":
      return "/student/dashboard";
  }
}
