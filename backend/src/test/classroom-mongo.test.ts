import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { closeMongoDatabase, getMongoDatabase } from "../config/mongodb";
import { MongoClassroomRepository } from "../modules/classroom/classroom.repository";
import type {
  ClassroomRecord,
  ClassroomWork,
} from "../modules/classroom/classroom.model";

// Opt-in integration check; all temporary records are identified by a fresh UUID and removed.
describe.runIf(process.env.CLASSROOM_MONGO_TESTS === "1")(
  "classroom Mongo persistence",
  () => {
    it("enforces retry uniqueness, atomic revisions, draft upserts and exact-output finalization", async () => {
      const repo = new MongoClassroomRepository();
      const id = randomUUID();
      const record: ClassroomRecord = {
        id,
        requestKey: randomUUID(),
        revision: 0,
        joinCode: randomUUID(),
        createdBy: "classroom-integration@example.test",
        title: "Temporary integration classroom",
        subject: "DBMS",
        kind: "DBMS",
        department: "B.E. Computer Engineering",
        semester: 4,
        batch: "TEST",
        description: null,
        lifecycleState: "Draft",
        experiments: [],
        sessions: [],
        members: [],
        grades: [],
        gradeAudit: [],
        createdAt: new Date().toISOString(),
      };
      const work: ClassroomWork = {
        id,
        classroomId: id,
        sessionId: id,
        experimentId: "experiment",
        email: "test@example.test",
        mode: "official",
        action: "submit",
        code: "SELECT 1",
        language: "sql",
        createdAt: record.createdAt,
        output: null,
      };
      const db = await getMongoDatabase();
      try {
        const created = await Promise.all([
          repo.create(record),
          repo.create({ ...record, id: randomUUID(), joinCode: randomUUID() }),
        ]);
        expect(created[0].id).toBe(created[1].id);
        const actualId = created[0].id;
        const current = (await repo.get(actualId))!;
        const swaps = await Promise.all([
          repo.compareAndSwap({ ...current, title: "First" }, 0),
          repo.compareAndSwap({ ...current, title: "Second" }, 0),
        ]);
        expect(swaps.filter(Boolean)).toHaveLength(1);
        expect((await repo.get(actualId))!.revision).toBe(1);
        const claims = await Promise.all([
          repo.insertWork(work),
          repo.insertWork(work),
        ]);
        expect(claims.filter((c) => c.inserted)).toHaveLength(1);
        await repo.finishWork(id, {
          status: "EXECUTED",
          stdout: "1",
          stderr: "",
          runtimeMs: 1,
          truncated: false,
        });
        await repo.finishWork(id, {
          status: "EXECUTED",
          stdout: "WRONG",
          stderr: "",
          runtimeMs: 1,
          truncated: false,
        });
        expect((await repo.work(id, work.email))[0].output!.stdout).toBe("1");
        const draft = {
          id,
          classroomId: id,
          sessionId: id,
          experimentId: "experiment",
          email: work.email,
          mode: "practice" as const,
          code: "first",
          updatedAt: record.createdAt,
        };
        await repo.saveDraft(draft);
        await repo.saveDraft({ ...draft, code: "second" });
        expect((await repo.drafts(id, work.email)).map((d) => d.code)).toEqual([
          "second",
        ]);
        await db.collection("classroom_work").deleteOne({ id });
        await repo.finishWork(id, {
          status: "EXECUTED",
          stdout: "late",
          stderr: "",
          runtimeMs: 1,
          truncated: false,
        });
        expect(await repo.work(id)).toEqual([]);
      } finally {
        await db
          .collection("classrooms")
          .deleteMany({
            createdBy: record.createdBy,
            requestKey: record.requestKey,
          });
        await db.collection("classroom_work").deleteMany({ classroomId: id });
        await db.collection("classroom_drafts").deleteMany({ classroomId: id });
        await closeMongoDatabase();
      }
    }, 30000);
  },
);
