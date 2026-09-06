import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { labAttendanceApi } from "@/api/services";
import type { StudentAttendanceState } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The waiting room a student sees while their lab teacher has a session running.
 *
 * Polls every 5 seconds — there is no realtime transport in this app, and 5s is well inside the
 * rate limit for a batch of ~35. Once admitted, the lab query is invalidated so the experiments
 * appear without the student having to do anything.
 */
export function LabJoinGate({
  labId,
  attendance,
  labTitle,
}: {
  labId: string;
  attendance: StudentAttendanceState;
  labTitle: string;
}) {
  const queryClient = useQueryClient();
  const pathname = `/student/labs/${labId}`;
  const [joinCode, setJoinCode] = useState("");

  const statusQuery = useQuery({
    queryKey: ["lab-attendance-mine", attendance.sessionId],
    queryFn: () => labAttendanceApi.getMineById(attendance.sessionId, pathname),
    // Fast while waiting for a teacher to look up; the moment they do, the lab unlocks.
    refetchInterval: 5000,
  });

  const status = statusQuery.data?.admission?.status ?? attendance.status;
  const denialReason = statusQuery.data?.admission?.denialReason ?? attendance.denialReason;
  const gates = statusQuery.data?.session?.gates ?? attendance.gates;

  // Admitted: drop the redacted lab payload so the experiments load. In an effect, not in render —
  // invalidating during render would loop.
  useEffect(() => {
    if (status === "ADMITTED") {
      void queryClient.invalidateQueries({ queryKey: ["student-lab", labId] });
    }
  }, [status, labId, queryClient]);

  const joinMutation = useMutation({
    mutationFn: () =>
      labAttendanceApi.join(attendance.sessionId, gates.requireJoinCode ? joinCode : undefined, pathname),
    onSuccess: (response) => {
      void statusQuery.refetch();
      if (response.admission.status === "ADMITTED") {
        void queryClient.invalidateQueries({ queryKey: ["student-lab", labId] });
        toast.success("You're in.");
      } else {
        toast.success("Sent. Your teacher will admit you shortly.");
      }
    },
    onError: (error: Error) => toast.error(error.message || "Could not join"),
  });

  const waiting = status === "PENDING";
  const refused = status === "DENIED" || status === "REVOKED";

  return (
    <Card className="profile-card space-y-4 p-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">Lab in progress</p>
        <h2 className="mt-1 font-display text-xl font-bold">
          {waiting ? "Waiting for your teacher to admit you" : `Join ${labTitle}`}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {waiting
            ? "Your request is with your lab teacher. This page unlocks the moment they admit you — keep it open."
            : refused
              ? denialReason
                ? `Your teacher did not admit you: ${denialReason}`
                : "Your teacher did not admit you. Ask them, then try again."
              : "Your lab teacher is running this lab right now. Ask to join to open the experiments."}
        </p>
      </div>

      {!waiting && (
        <div className="space-y-3">
          {gates.requireJoinCode && (
            <div className="max-w-[220px]">
              <Label className="text-xs" htmlFor="lab-join-code">
                Code on your teacher's screen
              </Label>
              <Input
                id="lab-join-code"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                placeholder="123456"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className="font-mono-code text-lg tracking-[0.3em]"
              />
              <p className="mt-1 text-xs text-muted-foreground">It changes every 30 seconds.</p>
            </div>
          )}

          <Button
            onClick={() => joinMutation.mutate()}
            disabled={joinMutation.isPending || (gates.requireJoinCode && joinCode.length !== 6)}
          >
            {joinMutation.isPending ? "Asking…" : refused ? "Ask again" : "Ask to join"}
          </Button>
        </div>
      )}

      {gates.requireNetworkMatch && (
        <p className="text-xs text-muted-foreground">
          You must be on the lab's network to join. If you are, and this still fails, tell your teacher.
        </p>
      )}
    </Card>
  );
}
