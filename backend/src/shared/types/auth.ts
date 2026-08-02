/**
 * `ADMIN` is institute leadership (principal / CERCD), sourced from the CoE `role` claim. It is a
 * read-only analytics role, deliberately *narrower* than FACULTY: no authoring, no grading, no access
 * to submitted code. See `mapCoeRoleToPlatformRole` in middleware/auth.ts.
 */
export type UserRole = "STUDENT" | "FACULTY" | "ADMIN";

export interface AuthenticatedUser {
  email: string;
  role: UserRole;
  name: string;
  uid?: string;
  department?: string;
  /**
   * Head-of-Department flag sourced from the trusted CoE JWT payload. When present
   * it is authoritative (overrides any stored value). Absent for students / older
   * tokens.
   */
  isHod?: boolean;
}
