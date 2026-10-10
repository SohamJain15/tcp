import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  classroomApi,
  averageMarks,
  newRequestKey,
  type Classroom,
  type ClassroomDetail,
  type ClassroomSession,
  type ClassroomWork,
  type ScheduleDraft,
} from "@/api/classrooms";
import { AppLayout } from "@/components/AppLayout";
import { LabOutput, LabWorkspace } from "@/pages/student/LabWorkspace";
import {
  ClassroomScheduleEditor,
  newSchedule,
} from "@/components/ClassroomScheduleEditor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const date = (iso: string) =>
  `${new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST`;
const errorToast = (error: Error) => toast.error(error.message);

export function ClassroomList({ faculty = false }: { faculty?: boolean }) {
  const query = useQuery({
    queryKey: ["classrooms", faculty],
    queryFn: classroomApi.list,
  });
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const join = useMutation({
    mutationFn: () => classroomApi.join(code),
    onSuccess: (data) => navigate(`/student/labs/${data.id}`),
    onError: errorToast,
  });
  return (
    <AppLayout>
      <div className="container max-w-6xl space-y-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Lab Workspaces</h1>
            <p className="mt-2 text-muted-foreground">
              {faculty
                ? "Manage batch sessions, attendance, and experiment marks."
                : "Your batch lab workspaces, scheduled work, and lab records."}
            </p>
          </div>
          {faculty && (
            <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/faculty/labs/create">Create Lab Workspace</Link>
            </Button>
          )}
        </div>
        {!faculty && (
          <Card className="p-5">
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                join.mutate();
              }}
            >
              <label className="space-y-1 text-sm">
                Lab Workspace Code
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Enter your teacher’s code"
                  maxLength={32}
                />
              </label>
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90" disabled={!code.trim() || join.isPending}>
                Join Lab Workspace
              </Button>
            </form>
          </Card>
        )}
        {query.isLoading && <p>Loading lab workspaces…</p>}
        {query.isError && (
          <p role="alert" className="text-destructive">
            {query.error.message}
          </p>
        )}
        {query.data?.items.length === 0 && (
          <Card className="p-8 text-muted-foreground">
            {faculty
              ? "Create your first batch lab workspace to get started."
              : "Join a lab workspace using the code shared by your teacher."}
          </Card>
        )}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {query.data?.items.map((room) => (
            <Link
              key={room.id}
              to={`/${faculty ? "faculty" : "student"}/labs/${room.id}`}
            >
              <Card className="h-full space-y-3 p-5 transition-colors hover:border-primary">
                <div className="flex justify-between">
                  <Badge variant="secondary">
                    {room.kind === "DBMS" ? "SQL" : "Coding"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {room.lifecycleState}
                  </span>
                </div>
                <h2 className="text-xl font-semibold">{room.title}</h2>
                <p>{room.subject}</p>
                <p className="text-sm text-muted-foreground">
                  Batch {room.batch} · Semester {room.semester} ·{" "}
                  {room.memberCount} students
                </p>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}

export function ClassroomPage({ faculty = false }: { faculty?: boolean }) {
  const { id = "" } = useParams();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["classroom", id, faculty],
    queryFn: () => classroomApi.get(id),
    refetchInterval: 10000,
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["classroom", id] });
  };
  const [tab, setTab] = useState("sessions");
  const [studentToRemove, setStudentToRemove] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [workspace, setWorkspace] = useState<{
    sessionId: string;
    experimentId: string;
    mode: "official" | "practice";
  } | null>(null);
  const [selectedPdf, setSelectedPdf] = useState<string[]>([]);
  const action = useMutation({
    mutationFn: ({
      sessionId,
      operation,
    }: {
      sessionId: string;
      operation: "activate" | "close" | "enter";
    }) => classroomApi.sessionAction(id, sessionId, operation),
    onSuccess: () => {
      refresh();
      toast.success("Session updated");
    },
    onError: errorToast,
  });
  const saveSchedule = useMutation({
    mutationFn: () => classroomApi.schedule(id, schedule!, editing),
    onSuccess: () => {
      setSchedule(null);
      refresh();
      toast.success("Session scheduled");
    },
    onError: errorToast,
  });
  const remove = useMutation({
    mutationFn: (email: string) => classroomApi.remove(id, email),
    onSuccess: () => {
      setStudentToRemove(null);
      refresh();
      toast.success("Student removed from lab workspace");
    },
    onError: errorToast,
  });
  const detail = query.data;
  const room = detail?.classroom;
  if (!detail || !room)
    return (
      <AppLayout>
        <div className="container py-8">
          <p role={query.isError ? "alert" : undefined}>
            {query.isError ? query.error.message : "Loading lab workspace…"}
          </p>
        </div>
      </AppLayout>
    );
  const sessions = [...room.sessions].sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
  );
  const currentSession =
    workspace && room.sessions.find((s) => s.id === workspace.sessionId);
  return (
    <AppLayout>
      <div className="container max-w-7xl space-y-6 py-8">
        <Link
          className="text-sm text-primary"
          to={`/${faculty ? "faculty" : "student"}/labs`}
        >
          ← Lab Workspaces
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">{room.title}</h1>
            <p className="mt-2 text-muted-foreground">
              {room.subject} · {room.department} · Batch {room.batch} · Year{" "}
              {Math.ceil(room.semester / 2)}
            </p>
            {room.description && <p className="mt-2">{room.description}</p>}
          </div>
          {faculty && (
            <div className="flex items-center gap-3">
              <div className="rounded-md border px-4 py-2">
                <span className="mr-2 text-xs text-muted-foreground">
                  JOIN CODE
                </span>
                <code className="font-semibold tracking-widest">
                  {room.joinCode}
                </code>
              </div>
              <Button asChild variant="outline">
                <Link to={`/faculty/labs/${id}/edit`}>Edit Lab Workspace</Link>
              </Button>
            </div>
          )}
        </div>
        <nav className="flex flex-wrap border-b border-border" aria-label="Lab workspace sections">
          {["sessions", "marks", ...(faculty ? ["students"] : ["history"])].map(
            (item) => (
              <button
                key={item}
                type="button"
                className={
                  tab === item
                    ? "border-b-2 border-accent bg-background px-4 py-2 text-sm font-semibold capitalize text-accent"
                    : "border-b-2 border-transparent px-4 py-2 text-sm font-semibold capitalize text-muted-foreground transition-colors hover:text-foreground"
                }
                onClick={() => {
                  setTab(item);
                  setWorkspace(null);
                }}
              >
                {item === "marks"
                  ? "Marks / 100"
                  : item[0].toUpperCase() + item.slice(1)}
              </button>
            ),
          )}
        </nav>
        {tab === "sessions" && (
          <>
            {faculty && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSchedule(newSchedule());
                    setEditing(false);
                  }}
                >
                  Schedule session
                </Button>
              </div>
            )}
            {faculty && schedule && (
              <Card className="space-y-3 p-4">
                <ClassroomScheduleEditor
                  value={schedule}
                  onChange={setSchedule}
                  experiments={room.experiments}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setSchedule(null)}>
                    Cancel
                  </Button>
                  <Button
                    className="bg-accent text-accent-foreground hover:bg-accent/90"
                    disabled={
                      saveSchedule.isPending ||
                      !schedule.experimentIds.length ||
                      !schedule.language
                    }
                    onClick={() => saveSchedule.mutate()}
                  >
                    Save schedule
                  </Button>
                </div>
              </Card>
            )}
            {!sessions.length && (
              <Card className="p-6 text-muted-foreground">
                No sessions scheduled yet.
              </Card>
            )}
            {sessions.map((session) => (
              <Card key={session.id} className="space-y-4 p-5">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">{session.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {date(session.startAt)} · {session.durationMinutes} min ·{" "}
                      {session.language}
                    </p>
                  </div>
                  <Badge
                    variant={
                      session.computedStatus === "Active"
                        ? "default"
                        : "secondary"
                    }
                  >
                    {session.computedStatus === "Ready"
                      ? "Waiting for teacher"
                      : session.computedStatus}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {faculty ? (
                    <>
                      {session.computedStatus === "Upcoming" && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditing(true);
                            setSchedule({
                              id: session.id,
                              title: session.title,
                              startAt: session.startAt,
                              durationMinutes: session.durationMinutes,
                              language: session.language,
                              experimentIds: session.experiments.map(
                                (e) => e.id,
                              ),
                            });
                          }}
                        >
                          Edit schedule
                        </Button>
                      )}
                      {session.computedStatus === "Ready" && (
                        <Button
                          className="bg-accent text-accent-foreground hover:bg-accent/90"
                          disabled={action.isPending}
                          onClick={() =>
                            action.mutate({
                              sessionId: session.id,
                              operation: "activate",
                            })
                          }
                        >
                          Activate from lab network
                        </Button>
                      )}
                      {session.computedStatus === "Active" && (
                        <Button
                          variant="outline"
                          disabled={action.isPending}
                          onClick={() =>
                            action.mutate({
                              sessionId: session.id,
                              operation: "close",
                            })
                          }
                        >
                          End session
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      {session.computedStatus === "Active" &&
                        !session.attendance.length && (
                          <Button
                            className="bg-accent text-accent-foreground hover:bg-accent/90"
                            disabled={action.isPending}
                            onClick={() =>
                              action.mutate({
                                sessionId: session.id,
                                operation: "enter",
                              })
                            }
                          >
                            Enter lab · Mark attendance
                          </Button>
                        )}
                      {session.attendance.length > 0 && (
                        <span className="text-sm text-green-700 dark:text-green-400">
                          Present · {date(session.attendance[0].enteredAt)}
                        </span>
                      )}
                      {session.computedStatus === "Ready" && (
                        <p className="text-sm text-muted-foreground">
                          Your teacher will activate this session from the lab
                          network.
                        </p>
                      )}
                    </>
                  )}
                </div>
                <div className="divide-y">
                  {session.experiments.map((experiment) => (
                    <div
                      key={experiment.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <span>
                        {experiment.number}. {experiment.title}
                      </span>
                      {!faculty &&
                        ((session.computedStatus === "Active" &&
                          session.attendance.length > 0) ||
                          session.computedStatus === "Ended") && (
                          <Button
                            variant="outline"
                            onClick={() =>
                              setWorkspace({
                                sessionId: session.id,
                                experimentId: experiment.id,
                                mode:
                                  session.computedStatus === "Ended"
                                    ? "practice"
                                    : "official",
                              })
                            }
                          >
                            {session.computedStatus === "Ended"
                              ? "Practice"
                              : "Open experiment"}
                          </Button>
                        )}
                    </div>
                  ))}
                </div>
                {faculty && <SessionRoster session={session} detail={detail} />}
              </Card>
            ))}
            {workspace && currentSession && (
              <LabWorkspace
                key={`${workspace.sessionId}:${workspace.experimentId}:${workspace.mode}`}
                classroomId={id}
                session={currentSession}
                experimentId={workspace.experimentId}
                mode={workspace.mode}
                detail={detail}
                refresh={refresh}
                onClose={() => setWorkspace(null)}
              />
            )}
          </>
        )}
        {tab === "marks" && (
          <Gradebook room={room} faculty={faculty} refresh={refresh} />
        )}
        {tab === "students" && faculty && (
          <Card className="overflow-x-auto p-5">
            <h2 className="mb-4 text-lg font-semibold">
              Enrolled students ({room.members?.length ?? 0})
            </h2>
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Name</th>
                  <th>Roll number</th>
                  <th>Batch</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {room.members?.map((student) => (
                  <tr key={student.email} className="border-t">
                    <td className="p-2">{student.name}</td>
                    <td>{student.rollNumber}</td>
                    <td>{student.batch}</td>
                    <td>
                      <AlertDialog
                        open={studentToRemove === student.email}
                        onOpenChange={(open) => {
                          if (!remove.isPending)
                            setStudentToRemove(open ? student.email : null);
                        }}
                      >
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" disabled={remove.isPending}>
                            Remove
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="w-[calc(100%-2rem)]">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="font-display">
                              Remove student?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Remove {student.name} from this lab workspace?
                              Their session records will be retained.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={remove.isPending}>
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              disabled={remove.isPending}
                              onClick={(event) => {
                                event.preventDefault();
                                if (!remove.isPending) remove.mutate(student.email);
                              }}
                            >
                              {remove.isPending ? "Removing..." : "Remove student"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        {tab === "history" && !faculty && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Official submissions are preserved separately from practice.
                Select sessions to include in your PDF.
              </p>
              <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
                <a
                  href={classroomApi.pdfUrl(id, selectedPdf)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {selectedPdf.length
                    ? "Print / PDF selected sessions"
                    : "Print / PDF all attended sessions"}
                </a>
              </Button>
            </div>
            {sessions
              .filter((s) => s.attendance.length)
              .map((session) => (
                <Card key={session.id} className="space-y-4 p-5">
                  <label className="flex items-center gap-3 font-semibold">
                    <input
                      type="checkbox"
                      checked={selectedPdf.includes(session.id)}
                      onChange={(e) =>
                        setSelectedPdf((current) =>
                          e.target.checked
                            ? [...current, session.id]
                            : current.filter((s) => s !== session.id),
                        )
                      }
                    />
                    {session.title} · {date(session.startAt)}
                  </label>
                  <History
                    work={detail.work.filter(
                      (w) =>
                        w.sessionId === session.id &&
                        w.mode === "official" &&
                        w.action === "submit",
                    )}
                    session={session}
                  />
                </Card>
              ))}
            {!sessions.some((s) => s.attendance.length) && (
              <p>No attended sessions yet.</p>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function History({
  work,
  session,
}: {
  work: ClassroomWork[];
  session: ClassroomSession;
}) {
  if (!work.length)
    return (
      <p className="text-sm text-muted-foreground">No submitted experiments.</p>
    );
  return (
    <div className="space-y-3">
      {[...work].reverse().map((w) => (
        <details key={w.id} className="rounded border p-3">
          <summary className="cursor-pointer text-sm">
            Experiment{" "}
            {session.experiments.find((e) => e.id === w.experimentId)?.number} ·{" "}
            {w.language} · {date(w.createdAt)} · {w.output?.status ?? "Pending"}
          </summary>
          <pre className="my-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-secondary/60 p-3 font-mono-code text-xs">
            {w.code}
          </pre>
          <LabOutput output={w.output} />
        </details>
      ))}
    </div>
  );
}
function SessionRoster({
  session,
  detail,
}: {
  session: ClassroomSession;
  detail: ClassroomDetail;
}) {
  const roster = session.activatedAt
    ? (session.roster ?? [])
    : (detail.classroom.members ?? []);
  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold">
        Attendance and performed work · {session.attendance.length}/
        {roster.length} present
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-2">Student</th>
              <th className="p-2">Roll no.</th>
              <th className="p-2">Attendance</th>
              {session.experiments.map((e) => (
                <th className="p-2" key={e.id}>
                  Exp. {e.number}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roster.map((student) => (
              <tr key={student.email} className="border-t">
                <td className="p-2">{student.name}</td>
                <td className="p-2">{student.rollNumber}</td>
                <td className="p-2">
                  {session.attendance.some((a) => a.email === student.email)
                    ? "Present"
                    : session.computedStatus === "Ended"
                      ? "Absent"
                      : "Not entered"}
                </td>
                {session.experiments.map((e) => {
                  const work = detail.work.filter(
                    (w) =>
                      w.email === student.email &&
                      w.sessionId === session.id &&
                      w.experimentId === e.id &&
                      w.mode === "official" &&
                      w.action === "submit",
                  );
                  return (
                    <td key={e.id} className="min-w-48 p-2">
                      {work.length ? (
                        <details>
                          <summary className="cursor-pointer text-green-700 dark:text-green-400">
                            Performed · View work
                          </summary>
                          <History work={work} session={session} />
                        </details>
                      ) : (
                        "Not performed"
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
function MarkCell({
  mark,
  save,
}: {
  mark: number | null;
  save: (value: number | null) => Promise<unknown>;
}) {
  const [value, setValue] = useState(mark === null ? "" : String(mark));
  const [pending, setPending] = useState(false);
  useEffect(() => setValue(mark === null ? "" : String(mark)), [mark]);
  async function commit() {
    const next = value.trim() === "" ? null : Number(value);
    if (next === mark) return;
    if (next !== null && (!Number.isFinite(next) || next < 0 || next > 100)) {
      toast.error("Enter a mark from 0 to 100");
      return;
    }
    setPending(true);
    try {
      await save(next);
    } catch (error) {
      errorToast(error as Error);
      setValue(mark === null ? "" : String(mark));
    } finally {
      setPending(false);
    }
  }
  return (
    <Input
      aria-label="Mark out of 100"
      className="w-24"
      type="number"
      min={0}
      max={100}
      step="any"
      value={value}
      disabled={pending}
      placeholder="—"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
function Gradebook({
  room,
  faculty,
  refresh,
}: {
  room: Classroom;
  faculty: boolean;
  refresh: () => void;
}) {
  const students = faculty
    ? [...(room.members ?? [])].sort((a, b) =>
        a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true }),
      )
    : [
        {
          email: room.grades[0]?.email ?? "",
          name: "Your marks",
          rollNumber: "",
        },
      ];
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Experiment gradebook</h2>
          <p className="text-sm text-muted-foreground">
            Each experiment is marked out of 100. Averages include graded
            experiments only. Marks are visible immediately.
          </p>
        </div>
        {faculty && (
          <Button asChild variant="outline">
            <a href={classroomApi.csvUrl(room.id)}>
              Download spreadsheet (CSV)
            </a>
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-2">Student name</th>
              {faculty && <th className="p-2">Roll no.</th>}
              {room.experiments.map((e) => (
                <th key={e.id} title={e.title} className="p-2">
                  Exp. {e.number}
                </th>
              ))}
              <th className="p-2">Average</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => {
              const marks = room.experiments.map(
                (e) =>
                  room.grades.find(
                    (g) => g.email === student.email && g.experimentId === e.id,
                  )?.mark ?? null,
              );
              return (
                <tr key={student.email} className="border-t">
                  <td className="p-2">{student.name}</td>
                  {faculty && <td className="p-2">{student.rollNumber}</td>}
                  {room.experiments.map((e, index) => (
                    <td className="p-2" key={e.id}>
                      {faculty ? (
                        <MarkCell
                          mark={marks[index]}
                          save={async (value) => {
                            await classroomApi.grade(
                              room.id,
                              student.email,
                              e.id,
                              value,
                            );
                            refresh();
                          }}
                        />
                      ) : (
                        (marks[index] ?? "—")
                      )}
                    </td>
                  ))}
                  <td className="p-2 font-semibold">
                    {averageMarks(marks) ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
