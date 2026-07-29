import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { userApi } from "@/api/services";
import { DEPARTMENTS, type CompleteProfilePayload, type Department } from "@/api/types";
import { AppLayout } from "@/components/AppLayout";
import { ThemedSelect } from "@/components/ThemedSelect";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

function avatarInitials(name: string | null, email: string): string {
  if (!name) {
    return email.slice(0, 2).toUpperCase();
  }

  const parts = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return email.slice(0, 2).toUpperCase();
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export default function FacultyProfile() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["faculty-profile"],
    queryFn: () => userApi.me("/faculty/profile"),
  });
  const profile = profileQuery.data?.user ?? null;

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesignation, setEditDesignation] = useState("");
  const [editDepartment, setEditDepartment] = useState<Department | "">("");
  const [editLinkedIn, setEditLinkedIn] = useState("");
  const [editGithub, setEditGithub] = useState("");

  // Keep the form in sync with whatever the server last confirmed, so reopening the
  // dialog never shows stale values from a previous edit.
  useEffect(() => {
    if (!profile) return;
    setEditName(profile.name ?? "");
    setEditDesignation(profile.designation ?? "");
    setEditDepartment(profile.department ?? "");
    setEditLinkedIn(profile.linkedInUrl ?? "");
    setEditGithub(profile.githubUrl ?? "");
  }, [profile]);

  const editMutation = useMutation({
    mutationFn: (payload: CompleteProfilePayload) => userApi.updateProfile(payload, "/faculty/profile"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["faculty-profile"] });
      // The navbar and route guards read this; without it an HOD change needs a reload.
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      toast.success("Profile updated");
      setIsEditOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Could not update your profile.");
    },
  });

  const handleEditSave = () => {
    if (!editName.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (!editDesignation.trim()) {
      toast.error("Designation is required.");
      return;
    }
    if (!editDepartment) {
      toast.error("Department is required.");
      return;
    }

    // This endpoint replaces the whole faculty profile rather than patching it, so every
    // field must be sent on every save — including the HOD flag, which is no longer editable
    // here but must be preserved so a profile edit never silently demotes an HOD.
    editMutation.mutate({
      name: editName.trim(),
      designation: editDesignation.trim(),
      department: editDepartment,
      linkedInUrl: editLinkedIn.trim() || null,
      githubUrl: editGithub.trim() || null,
      isHod: profile?.isHod ?? false,
    });
  };

  return (
    <AppLayout>
      <div className="container py-8">
        <div className="profile-shell relative mx-auto max-w-4xl overflow-hidden p-6 md:p-8">
          <div className="pointer-events-none absolute inset-0 opacity-45 [background-image:radial-gradient(circle_at_15%_10%,hsl(var(--primary)/0.2),transparent_34%),radial-gradient(circle_at_84%_18%,hsl(var(--accent)/0.16),transparent_40%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(120deg,hsl(var(--muted-foreground)/0.1)_0_1px,transparent_1px_22px)]" />

          <Card className="profile-card relative mx-auto max-w-3xl space-y-6 p-6">
            {profileQuery.isLoading ? (
              <>
                <div className="flex items-center gap-4">
                  <Skeleton className="h-14 w-14 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-56" />
                    <Skeleton className="h-4 w-72" />
                  </div>
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-4 w-64" />
                  <Skeleton className="h-4 w-52" />
                </div>
              </>
            ) : profileQuery.isError ? (
              <div className="text-sm text-destructive">
                {(profileQuery.error as Error)?.message || "Failed to load faculty profile."}
              </div>
            ) : profile ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-14 w-14 border border-border">
                      <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                        {avatarInitials(profile.name, profile.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h1 className="font-display text-2xl font-bold">{profile.name ?? "Faculty"}</h1>
                      <p className="text-sm text-muted-foreground">{profile.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {profile.isHod ? (
                      <Badge className="gap-1 bg-accent text-accent-foreground hover:bg-accent">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        HOD
                      </Badge>
                    ) : null}
                    <Badge className="bg-primary text-primary-foreground hover:bg-primary">Faculty</Badge>
                    <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      Edit Profile
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 text-sm md:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Role</p>
                    <p className="font-medium">{profile.role}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Designation</p>
                    <p className="font-medium">{profile.designation ?? "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Department</p>
                    <p className="font-medium">{profile.department ?? "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Head of Department</p>
                    <p className="font-medium">{profile.isHod ? "Yes" : "No"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">LinkedIn</p>
                    <p className="truncate font-medium">{profile.linkedInUrl ?? "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">GitHub</p>
                    <p className="truncate font-medium">{profile.githubUrl ?? "Not set"}</p>
                  </div>
                </div>
              </>
            ) : null}
          </Card>
        </div>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Edit Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="faculty-name">Name</Label>
              <Input
                id="faculty-name"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                placeholder="Your full name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="faculty-designation">Designation</Label>
              <Input
                id="faculty-designation"
                value={editDesignation}
                onChange={(event) => setEditDesignation(event.target.value)}
                placeholder="e.g. Assistant Professor"
              />
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <ThemedSelect
                value={editDepartment}
                onValueChange={(value) => setEditDepartment(value as Department)}
                placeholder="Select department"
                options={DEPARTMENTS.map((department) => ({ value: department, label: department }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="faculty-linkedin">LinkedIn URL</Label>
              <Input
                id="faculty-linkedin"
                value={editLinkedIn}
                onChange={(event) => setEditLinkedIn(event.target.value)}
                placeholder="https://www.linkedin.com/in/your-profile"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="faculty-github">GitHub URL</Label>
              <Input
                id="faculty-github"
                value={editGithub}
                onChange={(event) => setEditGithub(event.target.value)}
                placeholder="https://github.com/your-username"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)} disabled={editMutation.isPending}>
              Cancel
            </Button>
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={handleEditSave}
              disabled={editMutation.isPending}
            >
              {editMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
