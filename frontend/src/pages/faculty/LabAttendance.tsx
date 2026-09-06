import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { labApi, labAttendanceApi } from "@/api/services";
import type { FacultyAdmissionRow } from "@/api/types";
import { AppLayout } from "@/components/AppLayout";
import {
  AudiencePicker,
  EMPTY_AUDIENCE,
  toAudiencePayload,
  type AudienceFilterValue,
} from "@/components/faculty/AudiencePicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemedSelect } from "@/components/ThemedSelect";

const PATHNAME = "/faculty/lab-attendance";

/**
 * The console a lab teacher keeps open on the projector during a lab period.
 *
 * Two states: no session running, so you open one for the batch in the room; or a session running,
 * so you watch the lobby and admit people. The rotating code is deliberately the largest thing on
 * the screen — it is meant to be readable from the back of the room, and it is the one control
 * students physically cannot fake from home.
 */
export default function LabAttendance() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [labId, setLabId] = useState(searchParams.get("labId") ?? "");
  const [batchLabel, setBatchLabel] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("180");
  const [audience, setAudience] = useState<AudienceFilterValue>(EMPTY_AUDIENCE);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [gates, setGates] = useState({
    requireAdmission: true,
    requireNetworkMatch: false,
    requireJoinCode: false,
  });

  const labsQuery = useQuery({ queryKey: ["faculty-labs"], queryFn: () => labApi.list(PATHNAME) });
  const sessionsQuery = useQuery({
    queryKey: ["faculty-lab-attendance"],
    queryFn: () => labAttendanceApi.list(PATHNAME),
    refetchInterval: 30000,
  });

  const live = useMemo(
    () => (sessionsQuery.data?.items ?? []).find((session) => session.state === "OPEN") ?? null,
    [sessionsQuery.data],
  );

  const admissionsQuery = useQuery({
    queryKey: ["lab-admissions", live?.id],
    queryFn: () => labAttendanceApi.listAdmissions(live!.id, PATHNAME),
    enabled: Boolean(live),
    // Fast enough that a student asking to join appears while they are still looking at the screen.
    refetchInterval: 5000,
  });

  const codeQuery = useQuery({
    queryKey: ["lab-join-code", live?.id],
    queryFn: () => labAttendanceApi.getJoinCode(live!.id, PATHNAME),
    enabled: Boolean(live) && Boolean(live?.gates.requireJoinCode),
    // The code rotates every 30s and the server accepts one step either side, so polling at 10s
    // means the projected code is never dead.
    refetchInterval: 10000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["faculty-lab-attendance"] });
    void queryClient.invalidateQueries({ queryKey: ["lab-admissions"] });
  };

  const openMutation = useMutation({
    mutationFn: () =>
      labAttendanceApi.open(
        {
          labId,
          batchLabel: batchLabel.trim() === "" ? null : batchLabel.trim(),
          audience: toAudiencePayload(audience),
          assignedEmails: selectedEmails,
          gates,
          durationMinutes: Number(durationMinutes),
        },
        PATHNAME,
      ),
    onSuccess: () => {
      toast.success("Session open. Students can ask to join.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Could not open the session"),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => labAttendanceApi.update(live!.id, payload, PATHNAME),
    onSuccess: () => invalidate(),
    onError: (error: Error) => toast.error(error.message || "Could not update the session"),
  });

  const decideMutation = useMutation({
    mutationFn: (input: { admissionId: string; status: "ADMITTED" | "DENIED" | "REVOKED" }) =>
      labAttendanceApi.decideAdmission(live!.id, input.admissionId, { status: input.status }, PATHNAME),
    onSuccess: () => invalidate(),
    onError: (error: Error) => toast.error(error.message),
  });

  const bulkMutation = useMutation({
    mutationFn: (input: { admissionIds: string[]; status: "ADMITTED" | "DENIED" }) =>
      labAttendanceApi.decideAdmissionsBulk(live!.id, input, PATHNAME),
    onSuccess: (response) => {
      toast.success(`${response.updated} student${response.updated === 1 ? "" : "s"} updated`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // A newly opened session's roster is what matters now, not the draft form above it.
  useEffect(() => {
    if (live) {
      setLabId(live.labId);
    }
  }, [live]);

  const labs = labsQuery.data?.items ?? [];
  const pending = admissionsQuery.data?.pending ?? [];
  const admitted = admissionsQuery.data?.admitted ?? [];
  const denied = admissionsQuery.data?.denied ?? [];
  const counts = admissionsQuery.data?.counts;

  return (
    <AppLayout>
      <div className="container space-y-6 px-3 py-5 sm:px-6 sm:py-8">
        <div>
          <Link to="/faculty/labs" className="text-sm text-muted-foreground hover:underline">
            ← All labs
          </Link>
          <h1 className="mt-2 font-display text-3xl font-bold">Lab attendance</h1>
          <p className="mt-2 text-muted-foreground">
            Open a session for the batch in the room. Only students you admit can work the lab while it runs.
          </p>
        </div>

        {live ? (
          <>
            <Card className="profile-card space-y-4 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-widest text-accent">Live</p>
                  <h2 className="mt-1 font-display text-xl font-bold">
                    {live.labTitle}
                    {live.batchLabel ? ` · ${live.batchLabel}` : ""}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {live.roster.length} student{live.roster.length === 1 ? "" : "s"} in this batch · closes{" "}
                    {new Date(live.expiresAt).toLocaleTimeString()}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => updateMutation.mutate({ state: "CLOSED" })}
                  disabled={updateMutation.isPending}
                >
                  End session
                </Button>
              </div>

              {live.gates.requireJoinCode && (
                <div className="rounded border border-border bg-muted/30 p-6 text-center">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Join code — show this on the projector
                  </p>
                  {/* Deliberately huge: it has to be readable from the back of the lab. */}
                  <p className="mt-2 font-mono-code text-6xl font-bold tracking-[0.2em]">
                    {codeQuery.data?.code ?? "······"}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">Changes every 30 seconds.</p>
                </div>
              )}

              <div className="flex flex-wrap gap-4">
                {(
                  [
                    ["requireAdmission", "Admit each student"],
                    ["requireNetworkMatch", "Lab network only"],
                    ["requireJoinCode", "Rotating join code"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={live.gates[key]}
                      onCheckedChange={(checked) =>
                        updateMutation.mutate({ gates: { [key]: checked === true } })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>
                  Network: <span className="font-mono-code">{live.hostIpCidr ?? "unknown"}</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => updateMutation.mutate({ recaptureHostIp: true })}
                  disabled={updateMutation.isPending}
                >
                  Re-capture from this device
                </Button>
              </div>
            </Card>

            <Card className="profile-card space-y-4 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-display text-lg font-bold">
                  Waiting to join
                  {counts ? ` (${counts.pending})` : ""}
                </h3>
                {pending.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() =>
                      bulkMutation.mutate({ admissionIds: pending.map((row) => row.id), status: "ADMITTED" })
                    }
                    disabled={bulkMutation.isPending}
                  >
                    Admit all {pending.length}
                  </Button>
                )}
              </div>

              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody is waiting.</p>
              ) : (
                <div className="space-y-2">
                  {pending.map((row) => (
                    <AdmissionRow
                      key={row.id}
                      row={row}
                      actions={
                        <>
                          <Button
                            size="sm"
                            onClick={() => decideMutation.mutate({ admissionId: row.id, status: "ADMITTED" })}
                            disabled={decideMutation.isPending}
                          >
                            Admit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => decideMutation.mutate({ admissionId: row.id, status: "DENIED" })}
                            disabled={decideMutation.isPending}
                          >
                            Deny
                          </Button>
                        </>
                      }
                    />
                  ))}
                </div>
              )}

              <h3 className="pt-2 font-display text-lg font-bold">
                In the lab{counts ? ` (${counts.admitted})` : ""}
              </h3>
              {admitted.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody admitted yet.</p>
              ) : (
                <div className="space-y-2">
                  {admitted.map((row) => (
                    <AdmissionRow
                      key={row.id}
                      row={row}
                      actions={
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => decideMutation.mutate({ admissionId: row.id, status: "REVOKED" })}
                          disabled={decideMutation.isPending}
                        >
                          Remove
                        </Button>
                      }
                    />
                  ))}
                </div>
              )}

              {denied.length > 0 && (
                <>
                  <h3 className="pt-2 font-display text-lg font-bold">Not admitted ({denied.length})</h3>
                  <div className="space-y-2">
                    {denied.map((row) => (
                      <AdmissionRow
                        key={row.id}
                        row={row}
                        actions={
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => decideMutation.mutate({ admissionId: row.id, status: "ADMITTED" })}
                            disabled={decideMutation.isPending}
                          >
                            Admit
                          </Button>
                        }
                      />
                    ))}
                  </div>
                </>
              )}
            </Card>
          </>
        ) : (
          <Card className="profile-card space-y-5 p-6">
            <h2 className="font-display text-lg font-bold">Open a session</h2>

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label className="text-xs">Lab</Label>
                <ThemedSelect
                  value={labId}
                  placeholder="Select…"
                  onValueChange={setLabId}
                  options={labs.map((lab) => ({ value: lab.id, label: `${lab.title} · ${lab.subject}` }))}
                />
              </div>
              <div>
                <Label className="text-xs">Batch</Label>
                <Input
                  value={batchLabel}
                  onChange={(event) => setBatchLabel(event.target.value)}
                  placeholder="Batch 1"
                />
              </div>
              <div>
                <Label className="text-xs">Auto-close after (minutes)</Label>
                <Input
                  type="number"
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(event.target.value)}
                />
              </div>
            </div>

            <AudiencePicker
              value={audience}
              onChange={setAudience}
              selectedEmails={selectedEmails}
              onSelectedEmailsChange={setSelectedEmails}
              pathname={PATHNAME}
              title="Who is in this batch"
              description="Pick the department, year, division and roll range sitting in the room. Only these students can join."
            />

            <div className="space-y-2">
              <p className="text-sm font-semibold">How students get in</p>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={gates.requireAdmission}
                  onCheckedChange={(checked) =>
                    setGates((current) => ({ ...current, requireAdmission: checked === true }))
                  }
                />
                Admit each student myself
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={gates.requireNetworkMatch}
                  onCheckedChange={(checked) =>
                    setGates((current) => ({ ...current, requireNetworkMatch: checked === true }))
                  }
                />
                Only from this lab's network
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={gates.requireJoinCode}
                  onCheckedChange={(checked) =>
                    setGates((current) => ({ ...current, requireJoinCode: checked === true }))
                  }
                />
                Require the rotating code on my screen
              </label>
              <p className="text-xs text-muted-foreground">
                Open this page from a machine in the lab if you use the network check — it captures the network
                from this device.
              </p>
            </div>

            <div>
              <Button
                onClick={() => openMutation.mutate()}
                disabled={!labId || !audience.department || openMutation.isPending}
              >
                {openMutation.isPending ? "Opening…" : "Open session"}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

function AdmissionRow({ row, actions }: { row: FacultyAdmissionRow; actions: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-border p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {row.rollNumber ? `${row.rollNumber} · ` : ""}
          {row.name ?? row.email}
        </p>
        <p className="text-xs text-muted-foreground">
          {row.email}
          {row.requestIp ? ` · ${row.requestIp}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* Informational: a device that left the lab network is worth a glance, not an ejection. */}
        {!row.ipMatchesHost && (
          <Badge variant="destructive" className="rounded-none">
            Off network
          </Badge>
        )}
        {actions}
      </div>
    </div>
  );
}
