import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Download } from "lucide-react";

import { labApi, labAttendanceApi } from "@/api/services";
import { toStatusLabel } from "@/api/mappers";
import type { FacultyLabResponseRow, SubmissionStatus } from "@/api/types";
import { AppLayout } from "@/components/AppLayout";
import { SubmittedAnswerSheet } from "@/components/faculty/SubmittedAnswerSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemedSelect } from "@/components/ThemedSelect";
import { downloadCsv } from "@/lib/download";
import { isAttendanceSessionLive } from "@/lib/lab-attendance";
import { cn } from "@/lib/utils";

/**
 * Everything a faculty needs about one lab after it has been run: who was in the room, who was
 * admitted, and what each of them submitted and scored.
 *
 * Attendance sessions are kept forever — ending a session only stops students joining it, it does
 * not close the record — so this page reads exactly the same data during a lab and months later.
 */

type AttendanceStatus = "ATTENDED" | "WAITING" | "NOT_ADMITTED" | "ABSENT";

const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  ATTENDED: "Attended",
  WAITING: "Never admitted",
  NOT_ADMITTED: "Turned away",
  ABSENT: "Absent",
};

function formatDateTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function LabResponses() {
  const { id = "" } = useParams();
  const pathname = `/faculty/labs/${id}/responses`;
  const [experimentFilter, setExperimentFilter] = useState("all");
  const [unsolvedOnly, setUnsolvedOnly] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [openCell, setOpenCell] = useState<{ experimentId: string; email: string; name: string } | null>(null);

  const labQuery = useQuery({
    queryKey: ["faculty-lab", id],
    queryFn: () => labApi.get(id, pathname),
    enabled: Boolean(id),
  });

  const responsesQuery = useQuery({
    queryKey: ["faculty-lab-responses", id],
    queryFn: () => labApi.listResponses(id, undefined, pathname),
    enabled: Boolean(id),
  });

  const sessionsQuery = useQuery({
    queryKey: ["faculty-lab-attendance"],
    queryFn: () => labAttendanceApi.list(pathname),
  });

  const detailQuery = useQuery({
    queryKey: ["faculty-lab-response", id, openCell?.experimentId, openCell?.email],
    queryFn: () => labApi.getResponse(id, openCell!.experimentId, openCell!.email, pathname),
    enabled: Boolean(openCell),
  });

  const lab = labQuery.data?.lab;
  const rows = responsesQuery.data?.items ?? [];

  /** Sessions run for this lab, newest first. A closed session is still fully readable. */
  const sessions = useMemo(
    () =>
      (sessionsQuery.data?.items ?? [])
        .filter((session) => session.labId === id)
        .sort((left, right) => new Date(right.openedAt).getTime() - new Date(left.openedAt).getTime()),
    [sessionsQuery.data, id],
  );

  // Default to the most recent session so the tab is never empty on arrival.
  useEffect(() => {
    if (!sessionId && sessions.length > 0) {
      setSessionId(sessions[0].id);
    }
  }, [sessions, sessionId]);

  const session = sessions.find((item) => item.id === sessionId) ?? null;

  const admissionsQuery = useQuery({
    queryKey: ["lab-admissions", sessionId],
    queryFn: () => labAttendanceApi.listAdmissions(sessionId, pathname),
    enabled: Boolean(sessionId),
    // Live while the session is still open; a finished session never changes again.
    refetchInterval: session && isAttendanceSessionLive(session) ? 5000 : false,
  });

  const experiments = useMemo(
    () =>
      (lab?.experiments ?? [])
        .filter((experiment) => experimentFilter === "all" || experiment.id === experimentFilter)
        .sort((left, right) => left.number - right.number),
    [lab, experimentFilter],
  );

  const totalPoints = useMemo(
    () => (lab?.experiments ?? []).reduce((sum, experiment) => sum + experiment.points, 0),
    [lab],
  );

  /** Marks per student across the whole lab, keyed by email — joined into the attendance table. */
  const marksByStudent = useMemo(() => {
    const totals = new Map<string, { awarded: number; solved: number; lastSubmittedAt: string | null }>();
    for (const row of rows) {
      const existing = totals.get(row.userEmail) ?? { awarded: 0, solved: 0, lastSubmittedAt: null };
      existing.awarded += row.awardedPoints;
      existing.solved += row.passed ? 1 : 0;
      if (
        row.lastSubmittedAt &&
        (!existing.lastSubmittedAt || row.lastSubmittedAt > existing.lastSubmittedAt)
      ) {
        existing.lastSubmittedAt = row.lastSubmittedAt;
      }
      totals.set(row.userEmail, existing);
    }
    return totals;
  }, [rows]);

  /**
   * The register for one session: every student on the frozen roster, whether or not they ever
   * asked to join. A student who never showed up is the row a teacher most needs to see, so an
   * absentee is a row here rather than a silent omission.
   */
  const register = useMemo(() => {
    if (!session) {
      return [];
    }
    const admissions = admissionsQuery.data;
    const byEmail = new Map(
      [...(admissions?.pending ?? []), ...(admissions?.admitted ?? []), ...(admissions?.denied ?? [])].map(
        (row) => [row.email.toLowerCase(), row],
      ),
    );

    return session.roster
      .map((student) => {
        const admission = byEmail.get(student.email.toLowerCase()) ?? null;
        const status: AttendanceStatus = !admission
          ? "ABSENT"
          : admission.status === "ADMITTED"
            ? "ATTENDED"
            : admission.status === "PENDING"
              ? "WAITING"
              : "NOT_ADMITTED";
        const marks = marksByStudent.get(student.email) ?? { awarded: 0, solved: 0, lastSubmittedAt: null };
        return { student, admission, status, marks };
      })
      .sort((left, right) => Number(left.student.rollNumber ?? 0) - Number(right.student.rollNumber ?? 0));
  }, [session, admissionsQuery.data, marksByStudent]);

  /** One row per student, with their cell for each experiment. */
  const students = useMemo(() => {
    const byStudent = new Map<
      string,
      {
        email: string;
        name: string;
        rollNumber: string | null;
        division: string | null;
        cells: Map<string, FacultyLabResponseRow>;
      }
    >();
    for (const row of rows) {
      const existing = byStudent.get(row.userEmail) ?? {
        email: row.userEmail,
        name: row.userName ?? row.userEmail,
        rollNumber: row.rollNumber,
        division: row.division,
        cells: new Map<string, FacultyLabResponseRow>(),
      };
      existing.cells.set(row.experimentId, row);
      byStudent.set(row.userEmail, existing);
    }
    return Array.from(byStudent.values())
      .filter((student) =>
        unsolvedOnly ? experiments.some((experiment) => !student.cells.get(experiment.id)?.passed) : true,
      )
      .sort((left, right) => Number(left.rollNumber ?? 0) - Number(right.rollNumber ?? 0));
  }, [rows, experiments, unsolvedOnly]);

  const detail = detailQuery.data?.response;

  const exportRegister = () => {
    if (!session || !lab) {
      return;
    }
    downloadCsv(
      `${lab.title.replace(/\s+/g, "-").toLowerCase()}-attendance.csv`,
      toCsv(
        register.map((entry) => ({
          Roll: entry.student.rollNumber ?? "",
          Name: entry.student.name ?? "",
          UID: entry.student.uid ?? "",
          Division: entry.student.division ?? "",
          Email: entry.student.email,
          Attendance: ATTENDANCE_LABEL[entry.status],
          "Asked to join": formatDateTime(entry.admission?.requestedAt),
          "Admitted at": formatDateTime(entry.admission?.decidedAt),
          "Joined from": entry.admission?.requestIp ?? "",
          "Experiments solved": entry.marks.solved,
          Marks: entry.marks.awarded,
          "Out of": totalPoints,
          "Last submission": formatDateTime(entry.marks.lastSubmittedAt),
        })),
      ),
    );
  };

  const exportMarks = () => {
    if (!lab) {
      return;
    }
    downloadCsv(
      `${lab.title.replace(/\s+/g, "-").toLowerCase()}-marks.csv`,
      toCsv(
        students.map((student) => {
          const base: Record<string, string | number> = {
            Roll: student.rollNumber ?? "",
            Name: student.name,
            Email: student.email,
          };
          let awarded = 0;
          for (const experiment of experiments) {
            const cell = student.cells.get(experiment.id);
            base[`${experiment.number}. ${experiment.title}`] = cell ? cell.awardedPoints : "";
            awarded += cell?.awardedPoints ?? 0;
          }
          base.Total = awarded;
          base["Out of"] = experiments.reduce((sum, experiment) => sum + experiment.points, 0);
          return base;
        }),
      ),
    );
  };

  if (labQuery.isLoading || !lab) {
    return (
      <AppLayout>
        <div className="container py-8 text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container space-y-6 px-3 py-5 sm:px-6 sm:py-8">
        <div>
          <Link to="/faculty/labs" className="text-sm text-muted-foreground hover:underline">
            ← All labs
          </Link>
          <p className="mt-2 text-sm font-semibold uppercase tracking-widest text-accent">{lab.subject}</p>
          <h1 className="mt-1 font-display text-3xl font-bold">{lab.title}</h1>
          <p className="mt-2 text-muted-foreground">
            Attendance and submitted work. Sessions stay readable after they end.
          </p>
        </div>

        <Tabs defaultValue="attendance">
          <TabsList className="rounded-none">
            <TabsTrigger value="attendance" className="rounded-none">
              Attendance
            </TabsTrigger>
            <TabsTrigger value="responses" className="rounded-none">
              Submissions &amp; marks
            </TabsTrigger>
          </TabsList>

          <TabsContent value="attendance" className="mt-4 space-y-4">
            {sessions.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">
                No lab session has been run for this lab yet.
              </Card>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <ThemedSelect
                    value={sessionId}
                    onValueChange={setSessionId}
                    triggerClassName="h-9 w-auto min-w-[280px] text-sm"
                    options={sessions.map((item) => ({
                      value: item.id,
                      label: `${new Date(item.openedAt).toLocaleString()}${
                        item.batchLabel ? ` · ${item.batchLabel}` : ""
                      }${isAttendanceSessionLive(item) ? " · live" : ""}`,
                    }))}
                  />
                  {session && isAttendanceSessionLive(session) && (
                    <Badge className="rounded-none bg-emerald-600">Live now</Badge>
                  )}
                  <Button variant="outline" size="sm" onClick={exportRegister} disabled={register.length === 0}>
                    <Download className="mr-2 h-4 w-4" /> Export register
                  </Button>
                </div>

                {session && (
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                    <span>
                      Opened {formatDateTime(session.openedAt)} by {session.openedBy}
                    </span>
                    <span>
                      {isAttendanceSessionLive(session) ? "Auto-closes" : "Closed"}{" "}
                      {formatDateTime(session.closedAt ?? session.expiresAt)}
                    </span>
                    <span>
                      Attended: {register.filter((entry) => entry.status === "ATTENDED").length} of{" "}
                      {register.length}
                    </span>
                  </div>
                )}

                <Card className="profile-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          {["Roll", "Student", "Attendance", "Asked to join", "Joined from", "Solved", "Marks"].map(
                            (heading) => (
                              <th
                                key={heading}
                                className="border-b border-border px-3 py-2 text-left font-semibold"
                              >
                                {heading}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {register.map((entry) => (
                          <tr key={entry.student.email} className="odd:bg-muted/20">
                            <td className="border-b border-border px-3 py-2">{entry.student.rollNumber ?? "—"}</td>
                            <td className="border-b border-border px-3 py-2">
                              <div className="font-medium">{entry.student.name ?? entry.student.email}</div>
                              <div className="text-xs text-muted-foreground">{entry.student.email}</div>
                            </td>
                            <td className="border-b border-border px-3 py-2">
                              <span
                                className={cn(
                                  "text-xs font-medium",
                                  entry.status === "ATTENDED"
                                    ? "text-emerald-600"
                                    : entry.status === "ABSENT"
                                      ? "text-muted-foreground"
                                      : "text-amber-600",
                                )}
                              >
                                {ATTENDANCE_LABEL[entry.status]}
                              </span>
                            </td>
                            <td className="border-b border-border px-3 py-2 text-xs">
                              {formatDateTime(entry.admission?.requestedAt)}
                            </td>
                            <td className="border-b border-border px-3 py-2 font-mono-code text-xs">
                              {entry.admission?.requestIp ?? "—"}
                            </td>
                            <td className="border-b border-border px-3 py-2">{entry.marks.solved}</td>
                            <td className="border-b border-border px-3 py-2">
                              {entry.marks.awarded}/{totalPoints}
                            </td>
                          </tr>
                        ))}
                        {register.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                              {admissionsQuery.isLoading ? "Loading…" : "This session has no roster."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="responses" className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <ThemedSelect
                value={experimentFilter}
                onValueChange={setExperimentFilter}
                triggerClassName="h-9 w-auto min-w-[220px] text-sm"
                options={[
                  { value: "all", label: "All experiments" },
                  ...[...lab.experiments]
                    .sort((left, right) => left.number - right.number)
                    .map((experiment) => ({
                      value: experiment.id,
                      label: `${experiment.number}. ${experiment.title}`,
                    })),
                ]}
              />
              <Button
                variant={unsolvedOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setUnsolvedOnly((on) => !on)}
              >
                {unsolvedOnly ? "Showing unsolved only" : "Show unsolved only"}
              </Button>
              <Button variant="outline" size="sm" onClick={exportMarks} disabled={students.length === 0}>
                <Download className="mr-2 h-4 w-4" /> Export marks
              </Button>
              <span className="text-sm text-muted-foreground">
                {students.length} student{students.length === 1 ? "" : "s"} with submissions
              </span>
            </div>

            <Card className="profile-card overflow-hidden">
              {/* Wide grids scroll inside the card rather than making the page scroll sideways. */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="border-b border-border px-3 py-2 text-left font-semibold">Roll</th>
                      <th className="border-b border-border px-3 py-2 text-left font-semibold">Student</th>
                      {experiments.map((experiment) => (
                        <th
                          key={experiment.id}
                          className="border-b border-border px-3 py-2 text-left font-semibold"
                          title={experiment.title}
                        >
                          {experiment.number}. {experiment.title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => (
                      <tr key={student.email} className="odd:bg-muted/20">
                        <td className="border-b border-border px-3 py-2">{student.rollNumber ?? "—"}</td>
                        <td className="border-b border-border px-3 py-2">
                          <div className="font-medium">{student.name}</div>
                          <div className="text-xs text-muted-foreground">{student.email}</div>
                        </td>
                        {experiments.map((experiment) => {
                          const cell = student.cells.get(experiment.id);
                          return (
                            <td key={experiment.id} className="border-b border-border px-3 py-2">
                              {cell ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenCell({
                                      experimentId: experiment.id,
                                      email: student.email,
                                      name: student.name,
                                    })
                                  }
                                  className={cn(
                                    "rounded px-2 py-1 text-left text-xs underline-offset-2 hover:underline",
                                    cell.passed ? "text-emerald-600" : "text-amber-600",
                                  )}
                                >
                                  {cell.awardedPoints}/{cell.maxPoints}
                                  <span className="ml-1 text-muted-foreground">
                                    {cell.passed ? "✓" : toStatusLabel(cell.status as SubmissionStatus)}
                                  </span>
                                </button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {students.length === 0 && (
                      <tr>
                        <td colSpan={experiments.length + 2} className="px-3 py-6 text-center text-muted-foreground">
                          {responsesQuery.isLoading ? "Loading…" : "No submissions yet."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <SubmittedAnswerSheet
        open={Boolean(openCell)}
        onOpenChange={(open) => !open && setOpenCell(null)}
        title={detail?.experimentTitle ?? "Submitted answer"}
        subtitle={openCell ? `${openCell.name} · ${openCell.email}` : undefined}
        loading={detailQuery.isLoading}
        facts={
          detail
            ? detail.kind === "sql"
              ? [
                  { label: "Marks", value: `${detail.awardedPoints}/${detail.maxPoints}` },
                  {
                    label: "Verdict",
                    value: detail.passed ? "Correct" : toStatusLabel(detail.status as SubmissionStatus),
                    tone: detail.passed ? ("ok" as const) : ("warn" as const),
                  },
                ]
              : [
                  {
                    label: "Tests",
                    value: detail.latest ? `${detail.latest.passedCount}/${detail.latest.totalCount}` : "—",
                  },
                  {
                    label: "Verdict",
                    value: detail.latest ? toStatusLabel(detail.latest.status as SubmissionStatus) : "Not attempted",
                    tone:
                      detail.latest && detail.latest.passedCount === detail.latest.totalCount
                        ? ("ok" as const)
                        : ("warn" as const),
                  },
                ]
            : []
        }
        body={
          detail
            ? detail.kind === "sql"
              ? detail.studentSql
                ? { language: "sql", code: detail.studentSql }
                : null
              : detail.latest
                ? { language: detail.latest.language, code: detail.latest.code }
                : null
            : null
        }
        history={detail?.kind === "coding" ? detail.history : []}
      />
    </AppLayout>
  );
}

/** Minimal CSV writer — mirrors the backend's `toCsv`, quoting every field. */
function toCsv(rows: Record<string, string | number | null>[]): string {
  if (rows.length === 0) {
    return "";
  }
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number | null) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escape(row[header] ?? "")).join(",")),
  ].join("\n");
}
