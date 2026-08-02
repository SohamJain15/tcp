import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";

import { userApi } from "@/api/services";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";

const pathname = "/admin/profile";

/**
 * Read-only account card.
 *
 * There is no edit form on purpose: an admin has no department, UID or designation to set, and the
 * server rejects `PATCH /api/users/me` for this role — without that guard an admin would fall into
 * the faculty branch and be able to set their own HOD flag.
 */
export default function AdminProfile() {
  const userQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => userApi.me(pathname),
    staleTime: 30_000,
  });

  const user = userQuery.data?.user;

  return (
    <AppLayout>
      <div className="container space-y-6 py-8">
        <h1 className="font-display text-3xl font-bold">Profile</h1>

        {userQuery.isLoading && <div className="text-sm text-muted-foreground">Loading profile...</div>}
        {userQuery.isError && (
          <div className="text-sm text-destructive">
            {(userQuery.error as Error)?.message ?? "Failed to load your profile"}
          </div>
        )}

        {user && (
          <>
            <Card className="border border-border bg-background p-6 shadow-none">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-border text-accent">
                  <ShieldCheck className="h-6 w-6" />
                </span>
                <div className="min-w-0 space-y-1">
                  <div className="font-display text-xl font-semibold">{user.name ?? user.email}</div>
                  <div className="text-sm text-muted-foreground">{user.email}</div>
                  <Badge variant="outline">Administrator</Badge>
                </div>
              </div>

              <div className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Account created
                  </div>
                  <div className="mt-1 text-sm">{formatDateTime(user.createdAt)}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Last sign-in
                  </div>
                  <div className="mt-1 text-sm">
                    {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "-"}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="border border-border bg-background p-5 text-sm text-muted-foreground shadow-none">
              Administrator accounts are managed in the CoE portal, so there is nothing to edit here.
              This account has read-only access to department analytics and the student leaderboard.
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
