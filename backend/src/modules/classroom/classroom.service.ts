import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { ExecutableLanguage } from "../../shared/types/domain";
import type { AuthenticatedUser } from "../../shared/types/auth";
import { AppError } from "../../shared/errors/app-error";
import {
  ipInNetwork,
  normalizeIp,
  toNetworkCidr,
} from "../../shared/utils/client-ip";
import type { UserRepository } from "../user/user.repository";
import type { ExecutionProvider } from "../../execution/execution-provider";
import type { SqlExecutor } from "../../execution/sql/sql-executor";
import { generateSubmissionProgram } from "../../execution/harness";
import { toStudentExperiment, type LabExperiment } from "../lab/lab.model";
import type { ClassroomRepository } from "./classroom.repository";
import {
  gradeAverage,
  sessionEnd,
  sessionStatus,
  type ClassroomRecord,
  type ClassroomSession,
  type ClassroomStudent,
  type ClassroomOutput,
} from "./classroom.model";
import {
  classroomSchema,
  scheduleSchema,
  workSchema,
  gradeSchema,
  type ScheduleInput,
} from "./classroom.validator";
import { labSqlPreviewSchema } from "../lab/lab.validator";

const emailOf = (user: AuthenticatedUser) => user.email.toLowerCase();
const fail = (message: string, status = 400): never => {
  throw new AppError(status, message);
};
const key = (...parts: string[]) =>
  createHash("sha256").update(JSON.stringify(parts)).digest("hex");

export function classroomNetwork(ip: string | null): string {
  const normalized = normalizeIp(ip);
  if (!normalized) return fail("Could not identify the lab network", 403);
  const privateV4 = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"].some(
    (cidr) => ipInNetwork(normalized.ip, cidr),
  );
  const privateV6 = ipInNetwork(normalized.ip, "fc00::/7");
  return toNetworkCidr(
    normalized.ip,
    privateV4 ? 24 : 32,
    privateV6 ? 64 : 128,
  )!;
}

export function buildSession(
  input: ScheduleInput,
  experiments: LabExperiment[],
  now: number,
): ClassroomSession {
  if (Date.parse(input.startAt) <= now) fail("Schedule sessions in the future");
  if (new Set(input.experimentIds).size !== input.experimentIds.length)
    fail("Select each experiment only once");
  const selected = input.experimentIds.map(
    (id) =>
      experiments.find((experiment) => experiment.id === id) ??
      fail("Unknown experiment"),
  );
  if (
    selected.some((experiment) =>
      experiment.kind === "sql"
        ? input.language !== "sql"
        : !experiment.supportedLanguages.includes(
            input.language as ExecutableLanguage,
          ),
    )
  ) {
    fail("Choose a language supported by every selected experiment");
  }
  return {
    id: input.id ?? randomUUID(),
    title: input.title,
    startAt: new Date(input.startAt).toISOString(),
    durationMinutes: input.durationMinutes,
    language: input.language,
    experiments: structuredClone(selected),
    activatedAt: null,
    closedAt: null,
    network: null,
    roster: [],
    attendance: [],
  };
}
export function validateSchedule(sessions: ClassroomSession[]) {
  if (sessions.length > 100) fail("A classroom supports up to 100 sessions");
  if (new Set(sessions.map((s) => s.id)).size !== sessions.length)
    fail("Duplicate session identifier");
  const ordered = [...sessions].sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
  );
  for (let i = 1; i < ordered.length; i++)
    if (sessionEnd(ordered[i - 1]) > Date.parse(ordered[i].startAt))
      fail("Classroom sessions cannot overlap");
}

export function createClassroomService(deps: {
  repository: ClassroomRepository;
  userRepository: UserRepository;
  executionProvider: ExecutionProvider;
  sqlExecutor: SqlExecutor;
  now: () => Date;
}) {
  const repo = deps.repository;
  const now = () => deps.now().toISOString();
  async function validateSelectedStudents(input: {
    department: ClassroomRecord["department"];
    semester: number;
    selectedStudentEmails?: string[] | null;
  }) {
    if (!input.selectedStudentEmails) return;
    const candidates = await deps.userRepository.listByDepartment(
      input.department,
      "STUDENT",
    );
    const eligible = new Set(
      candidates
        .filter((student) => student.semester === input.semester)
        .map((student) => student.email.toLowerCase()),
    );
    if (input.selectedStudentEmails.some((email) => !eligible.has(email)))
      fail(
        "Selected students must belong to the classroom's department and semester",
      );
  }
  async function room(id: string) {
    return (await repo.get(id)) ?? fail("Classroom not found", 404);
  }
  function teacher(user: AuthenticatedUser, record: ClassroomRecord) {
    if (user.role !== "FACULTY" || record.createdBy !== emailOf(user))
      fail("You cannot manage this classroom", 403);
  }
  function member(user: AuthenticatedUser, record: ClassroomRecord) {
    if (
      user.role !== "STUDENT" ||
      !record.members.some((m) => m.email === emailOf(user))
    )
      fail("Join this classroom first", 403);
  }
  async function student(
    user: AuthenticatedUser,
    record: ClassroomRecord,
  ): Promise<ClassroomStudent> {
    const profile = await deps.userRepository.getByEmail(emailOf(user));
    if (
      user.role !== "STUDENT" ||
      !profile ||
      profile.department !== record.department ||
      profile.semester !== record.semester
    )
      fail("Your department and semester must match this classroom", 403);
    return {
      email: emailOf(user),
      name: profile!.name ?? user.name,
      rollNumber: profile!.rollNumber ?? "",
      batch: record.batch,
      year: Math.ceil(record.semester / 2),
    };
  }
  async function change(
    id: string,
    mutate: (record: ClassroomRecord) => void | Promise<void>,
  ) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const record = await room(id);
      const revision = record.revision;
      await mutate(record);
      if (await repo.compareAndSwap(record, revision))
        return { ...record, revision: revision + 1 };
    }
    return fail("The classroom changed. Please retry", 409);
  }
  function findSession(record: ClassroomRecord, id: string) {
    return (
      record.sessions.find((s) => s.id === id) ?? fail("Session not found", 404)
    );
  }
  function official(
    record: ClassroomRecord,
    session: ClassroomSession,
    ip: string | null,
  ) {
    if (
      record.lifecycleState !== "Published" ||
      sessionStatus(session, deps.now().getTime()) !== "Active"
    )
      fail("This session is not active", 403);
    if (!ipInNetwork(ip, session.network))
      fail("Connect to the lab network", 403);
  }
  function projection(user: AuthenticatedUser, record: ClassroomRecord) {
    const faculty = user.role === "FACULTY";
    const grades = faculty
      ? record.grades
      : record.grades.filter((g) => g.email === emailOf(user));
    return {
      id: record.id,
      title: record.title,
      subject: record.subject,
      kind: record.kind,
      department: record.department,
      semester: record.semester,
      batch: record.batch,
      description: record.description,
      lifecycleState: record.lifecycleState,
      joinCode: faculty ? record.joinCode : undefined,
      selectedStudentEmails: faculty
        ? (record.selectedStudentEmails ?? null)
        : undefined,
      createdAt: record.createdAt,
      experiments: faculty
        ? record.experiments
        : record.experiments.map(toStudentExperiment),
      members: faculty ? record.members : undefined,
      grades,
      average: gradeAverage(grades),
      sessions: record.sessions.map(({ network: _network, ...s }) => ({
        ...s,
        experiments: faculty
          ? s.experiments
          : s.experiments.map(toStudentExperiment),
        roster: faculty ? s.roster : undefined,
        attendance: faculty
          ? s.attendance
          : s.attendance.filter((a) => a.email === emailOf(user)),
        computedStatus: sessionStatus(s, deps.now().getTime()),
      })),
    };
  }
  return {
    async previewSql(user: AuthenticatedUser, body: unknown) {
      if (user.role !== "FACULTY") fail("Faculty only", 403);
      const input = labSqlPreviewSchema.parse(body);
      const result = await deps.sqlExecutor.run({
        studentSql: input.solutionSql,
        context: input,
      });
      if (!result.ok || !result.result)
        fail(result.error ?? "The reference query failed to run");
      return { expected: result.result };
    },
    async list(user: AuthenticatedUser) {
      return (await repo.list())
        .filter((r) =>
          user.role === "FACULTY"
            ? r.createdBy === emailOf(user)
            : r.members.some((m) => m.email === emailOf(user)),
        )
        .map((r) => ({
          id: r.id,
          title: r.title,
          subject: r.subject,
          batch: r.batch,
          kind: r.kind,
          semester: r.semester,
          lifecycleState: r.lifecycleState,
          memberCount: r.members.length,
        }));
    },
    async create(user: AuthenticatedUser, body: unknown) {
      if (user.role !== "FACULTY") fail("Faculty only", 403);
      const input = classroomSchema.parse(body);
      const prior = (await repo.list()).find(
        (r) =>
          r.createdBy === emailOf(user) && r.requestKey === input.requestKey,
      );
      if (prior) return projection(user, prior);
      await validateSelectedStudents(input);
      const experiments = input.experiments.map((e) => ({
        ...e,
        id: e.id ?? randomUUID(),
      })) as LabExperiment[];
      if (
        new Set(experiments.map((e) => e.id)).size !== experiments.length ||
        new Set(experiments.map((e) => e.number)).size !== experiments.length
      )
        fail("Experiment identifiers and numbers must be unique");
      const sessions = input.sessions.map((s) =>
        buildSession(s, experiments, deps.now().getTime()),
      );
      validateSchedule(sessions);
      const record: ClassroomRecord = {
        ...input,
        id: randomUUID(),
        revision: 0,
        joinCode: randomBytes(6).toString("hex").toUpperCase(),
        createdBy: emailOf(user),
        createdAt: now(),
        experiments,
        sessions,
        members: [],
        grades: [],
        gradeAudit: [],
      };
      return projection(user, await repo.create(record));
    },
    async update(user: AuthenticatedUser, id: string, body: unknown) {
      const input = classroomSchema.parse(body);
      const updated = await change(id, async (record) => {
        teacher(user, record);
        await validateSelectedStudents(input);
        if (
          record.members.length &&
          (input.department !== record.department ||
            input.semester !== record.semester ||
            input.batch !== record.batch)
        )
          fail("Cohort and batch cannot change after students join");
        const experiments = input.experiments.map((e) => ({
          ...e,
          id: e.id ?? randomUUID(),
        })) as LabExperiment[];
        if (
          new Set(experiments.map((e) => e.id)).size !== experiments.length ||
          new Set(experiments.map((e) => e.number)).size !== experiments.length
        )
          fail("Experiment identifiers and numbers must be unique");
        const used = new Set(
          record.sessions.flatMap((s) => s.experiments.map((e) => e.id)),
        );
        if ([...used].some((expId) => !experiments.some((e) => e.id === expId)))
          fail("Scheduled experiments cannot be removed");
        if (record.sessions.length && input.kind !== record.kind)
          fail("Lab kind cannot change after scheduling");
        Object.assign(record, {
          title: input.title,
          subject: input.subject,
          description: input.description,
          kind: input.kind,
          department: input.department,
          semester: input.semester,
          batch: input.batch,
          lifecycleState: input.lifecycleState,
          experiments,
        });
        if (input.selectedStudentEmails !== undefined) {
          record.selectedStudentEmails = input.selectedStudentEmails;
          if (record.selectedStudentEmails)
            record.members = record.members.filter((member) =>
              record.selectedStudentEmails!.includes(member.email),
            );
        }
      });
      return projection(user, updated);
    },
    async join(user: AuthenticatedUser, code: string) {
      const record =
        (await repo.list()).find(
          (r) => r.joinCode === code.trim().toUpperCase(),
        ) ?? fail("Classroom code not found", 404);
      await change(record.id, async (r) => {
        if (r.lifecycleState !== "Published")
          fail("This classroom is not accepting enrollments", 403);
        if (
          r.selectedStudentEmails &&
          !r.selectedStudentEmails.includes(emailOf(user))
        )
          fail(
            "You are not selected for this lab batch. Contact your teacher.",
            403,
          );
        const snapshot = await student(user, r);
        if (!r.members.some((m) => m.email === snapshot.email))
          r.members.push(snapshot);
      });
      return { id: record.id };
    },
    async remove(user: AuthenticatedUser, id: string, email: string) {
      await change(id, (r) => {
        teacher(user, r);
        r.members = r.members.filter((m) => m.email !== email.toLowerCase());
      });
    },
    async detail(user: AuthenticatedUser, id: string) {
      const record = await room(id);
      user.role === "FACULTY" ? teacher(user, record) : member(user, record);
      const work = await repo.work(
        id,
        user.role === "STUDENT" ? emailOf(user) : undefined,
      );
      // An interrupted request retains its submitted code, but must not look perpetually pending.
      const records = work.map((w) =>
        !w.output && Date.parse(w.createdAt) + 300_000 < deps.now().getTime()
          ? {
              ...w,
              output: {
                status: "INTERNAL_ERROR",
                stdout: "",
                stderr:
                  "Execution did not complete. Your submitted code is preserved.",
                runtimeMs: 0,
                truncated: false,
              },
            }
          : w,
      );
      return {
        classroom: projection(user, record),
        work: records,
        drafts:
          user.role === "STUDENT" ? await repo.drafts(id, emailOf(user)) : [],
      };
    },
    async schedule(
      user: AuthenticatedUser,
      id: string,
      body: unknown,
      sessionId?: string,
    ) {
      const input = scheduleSchema.parse(body);
      const updated = await change(id, (r) => {
        teacher(user, r);
        if (!sessionId && input.id && r.sessions.some((s) => s.id === input.id))
          fail("Session already exists; edit its schedule instead", 409);
        if (sessionId) {
          const previous = findSession(r, sessionId);
          if (
            previous.activatedAt ||
            deps.now().getTime() >= Date.parse(previous.startAt)
          )
            fail("Started sessions cannot be edited");
        }
        const session = buildSession(
          { ...input, id: sessionId ?? input.id },
          r.experiments,
          deps.now().getTime(),
        );
        r.sessions = [
          ...r.sessions.filter((s) => s.id !== session.id),
          session,
        ];
        validateSchedule(r.sessions);
      });
      return projection(user, updated);
    },
    async activate(
      user: AuthenticatedUser,
      id: string,
      sessionId: string,
      ip: string | null,
    ) {
      await change(id, (r) => {
        teacher(user, r);
        const s = findSession(r, sessionId);
        if (r.lifecycleState !== "Published")
          fail("Publish the classroom before activating a session");
        if (
          !["Ready", "Active"].includes(sessionStatus(s, deps.now().getTime()))
        )
          fail("Activate during the scheduled window");
        if (!s.activatedAt) {
          s.network = classroomNetwork(ip);
          s.activatedAt = now();
          s.roster = structuredClone(r.members);
        }
      });
    },
    async close(user: AuthenticatedUser, id: string, sessionId: string) {
      await change(id, (r) => {
        teacher(user, r);
        const s = findSession(r, sessionId);
        if (!s.activatedAt) fail("Session has not been activated");
        s.closedAt ??= now();
      });
    },
    async enter(
      user: AuthenticatedUser,
      id: string,
      sessionId: string,
      ip: string | null,
    ) {
      await change(id, async (r) => {
        member(user, r);
        const s = findSession(r, sessionId);
        official(r, s, ip);
        if (!s.attendance.some((a) => a.email === emailOf(user))) {
          const snapshot = await student(user, r);
          if (!s.roster.some((m) => m.email === snapshot.email))
            s.roster.push(snapshot);
          s.attendance.push({ ...snapshot, enteredAt: now() });
        }
      });
    },
    async grade(user: AuthenticatedUser, id: string, body: unknown) {
      const input = gradeSchema.parse(body);
      await change(id, (r) => {
        teacher(user, r);
        if (
          !r.members.some((m) => m.email === input.email) ||
          !r.experiments.some((e) => e.id === input.experimentId)
        )
          fail("Unknown student or experiment");
        const grade = { ...input, updatedBy: emailOf(user), updatedAt: now() };
        r.grades = [
          ...r.grades.filter(
            (g) =>
              !(
                g.email === input.email && g.experimentId === input.experimentId
              ),
          ),
          grade,
        ];
        r.gradeAudit.push(grade);
      });
    },
    async work(
      user: AuthenticatedUser,
      id: string,
      sessionId: string,
      body: unknown,
      ip: string | null,
    ) {
      const input = workSchema.parse(body);
      const r = await room(id);
      member(user, r);
      const s = findSession(r, sessionId);
      if (input.mode === "official") {
        official(r, s, ip);
        if (!s.attendance.some((a) => a.email === emailOf(user)))
          fail("Enter the session before working", 403);
      } else if (sessionStatus(s, deps.now().getTime()) !== "Ended")
        fail("Practice opens after the session ends", 403);
      const experiment =
        s.experiments.find((e) => e.id === input.experimentId) ??
        fail("Experiment is not selected for this session", 403);
      if (input.language !== s.language)
        fail("Use the teacher-selected language", 403);
      if (experiment.kind === "sql" && input.code.length > 12_000)
        fail("Query is too large");
      if (input.action === "draft") {
        await repo.saveDraft({
          id: key(id, sessionId, input.experimentId, emailOf(user), input.mode),
          classroomId: id,
          sessionId,
          experimentId: input.experimentId,
          email: emailOf(user),
          mode: input.mode,
          code: input.code,
          updatedAt: now(),
        });
        return { saved: true };
      }
      const workId = key(id, sessionId, emailOf(user), input.requestKey);
      const existing = (await repo.work(id, emailOf(user))).find(
        (w) => w.id === workId,
      );
      if (existing) {
        if (
          existing.code !== input.code ||
          existing.mode !== input.mode ||
          existing.action !== input.action ||
          existing.experimentId !== input.experimentId
        )
          fail("Request key already used for different work", 409);
        return { work: existing };
      }
      const claim = await repo.insertWork({
        id: workId,
        classroomId: id,
        sessionId,
        experimentId: experiment.id,
        email: emailOf(user),
        mode: input.mode,
        action: input.action,
        code: input.code,
        language: input.language,
        createdAt: now(),
        output: null,
      });
      const work = claim.work;
      if (!claim.inserted) {
        if (
          work.code !== input.code ||
          work.mode !== input.mode ||
          work.action !== input.action ||
          work.experimentId !== input.experimentId
        )
          fail("Request key already used for different work", 409);
        return { work };
      }
      let output: ClassroomOutput;
      try {
        if (experiment.kind === "sql") {
          const result = await deps.sqlExecutor.run({
            studentSql: work.code,
            context: experiment,
          });
          output = {
            status: result.ok
              ? "EXECUTED"
              : result.timedOut
                ? "TIME_LIMIT_EXCEEDED"
                : "RUNTIME_ERROR",
            stdout: "",
            stderr: result.internalError
              ? "SQL execution is temporarily unavailable"
              : (result.error ?? ""),
            table: result.result,
            runtimeMs: result.runtimeMs,
            truncated: result.result?.truncated ?? false,
          };
        } else {
          const program = generateSubmissionProgram(
            s.language as ExecutableLanguage,
            work.code,
            experiment.harness,
          );
          // Only public sample inputs feed the printable output. Hidden evaluation never enters history.
          const result = await deps.executionProvider.executeRun({
            code: program.source,
            comparison: program.comparison,
            language: s.language as ExecutableLanguage,
            testCases: experiment.sampleTestCases.length
              ? experiment.sampleTestCases
              : [{ input: "", output: "" }],
            sampleCaseCount: experiment.sampleTestCases.length,
            problemId: `${s.id}:${experiment.id}`,
            timeLimitSeconds: experiment.timeLimitSeconds,
            memoryLimitMb: experiment.memoryLimitMb,
          });
          const stdout = result.stdout ?? result.failedTest?.actualOutput ?? "";
          const stderr =
            result.status === "INTERNAL_ERROR"
              ? "Code execution is temporarily unavailable"
              : (result.stderr ?? "");
          output = {
            status: result.status,
            stdout: stdout.slice(0, 100_000),
            stderr: stderr.slice(0, 20_000),
            runtimeMs: result.runtimeMs,
            truncated: stdout.length > 100_000 || stderr.length > 20_000,
          };
        }
        if (input.action === "submit") {
          try {
            if (experiment.kind === "sql") {
              output.evaluationStatus = (
                await deps.sqlExecutor.grade({
                  studentSql: work.code,
                  context: experiment,
                })
              ).status;
            } else {
              const program = generateSubmissionProgram(
                s.language as ExecutableLanguage,
                work.code,
                experiment.harness,
              );
              output.evaluationStatus = (
                await deps.executionProvider.executeSubmission({
                  code: program.source,
                  comparison: program.comparison,
                  language: s.language as ExecutableLanguage,
                  testCases: [
                    ...experiment.sampleTestCases,
                    ...experiment.hiddenTestCases,
                  ],
                  sampleCaseCount: experiment.sampleTestCases.length,
                  problemId: `${s.id}:${experiment.id}`,
                  timeLimitSeconds: experiment.timeLimitSeconds,
                  memoryLimitMb: experiment.memoryLimitMb,
                })
              ).status;
            }
          } catch {
            output.evaluationStatus = "INTERNAL_ERROR";
          }
        }
      } catch {
        output = {
          status: "INTERNAL_ERROR",
          stdout: "",
          stderr: "Execution is temporarily unavailable. Your code is saved.",
          runtimeMs: 0,
          truncated: false,
        };
      }
      await repo.finishWork(work.id, output);
      return { work: { ...work, output } };
    },
  };
}
export type ClassroomService = ReturnType<typeof createClassroomService>;
