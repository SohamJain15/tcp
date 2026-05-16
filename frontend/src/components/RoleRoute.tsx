import { useQuery } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router-dom";

import type { UserRole } from "@/api/types";
import { userApi } from "@/api/services";
import { getHomePathForRole } from "@/lib/role-routing";

type RoleRouteProps = {
  allowedRole: UserRole | UserRole[];
  children: JSX.Element;
};

function requiresStudentProfileCompletion(user: { role: UserRole; isProfileComplete: boolean; uid: string | null }): boolean {
  if (user.role !== "STUDENT") {
    return !user.isProfileComplete;
  }

  const normalizedUid = user.uid?.trim() ?? "";
  return !user.isProfileComplete || normalizedUid === "" || normalizedUid.toLowerCase().includes("mock");
}

export function RoleRoute({ allowedRole, children }: RoleRouteProps) {
  const { pathname } = useLocation();
  const userQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => userApi.me(pathname),
    retry: false,
    staleTime: 30_000,
  });

  if (userQuery.isLoading) {
    return <div className="container py-8 text-sm text-muted-foreground">Checking your session...</div>;
  }

  if (userQuery.isError) {
    return <div className="container py-8 text-sm text-destructive">{(userQuery.error as Error)?.message ?? "Authentication failed"}</div>;
  }

  const user = userQuery.data?.user;
  if (!user) {
    return <div className="container py-8 text-sm text-muted-foreground">Authenticating...</div>;
  }

  const allowedRoles = Array.isArray(allowedRole) ? allowedRole : [allowedRole];
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={getHomePathForRole(user.role)} replace />;
  }

  const mustCompleteProfile = requiresStudentProfileCompletion(user);

  if (mustCompleteProfile && pathname !== "/complete-profile") {
    return <Navigate to="/complete-profile" replace />;
  }

  if (!mustCompleteProfile && pathname === "/complete-profile") {
    return <Navigate to={getHomePathForRole(user.role)} replace />;
  }

  return children;
}
