export type UserRole = "STUDENT" | "FACULTY";

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
