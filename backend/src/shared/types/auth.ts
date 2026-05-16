export type UserRole = "STUDENT" | "FACULTY";

export interface AuthenticatedUser {
  email: string;
  role: UserRole;
  name: string;
  uid?: string;
  department?: string;
}
