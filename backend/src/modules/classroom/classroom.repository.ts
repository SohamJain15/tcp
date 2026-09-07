import { getMongoDatabase } from "../../config/mongodb";
import { BSON, MongoServerError } from "mongodb";
import { AppError } from "../../shared/errors/app-error";
import type {
  ClassroomRecord,
  ClassroomWork,
  ClassroomDraft,
} from "./classroom.model";

export interface ClassroomRepository {
  list(): Promise<ClassroomRecord[]>;
  get(id: string): Promise<ClassroomRecord | null>;
  create(record: ClassroomRecord): Promise<ClassroomRecord>;
  compareAndSwap(record: ClassroomRecord, revision: number): Promise<boolean>;
  insertWork(
    work: ClassroomWork,
  ): Promise<{ work: ClassroomWork; inserted: boolean }>;
  finishWork(
    id: string,
    output: NonNullable<ClassroomWork["output"]>,
  ): Promise<void>;
  work(classroomId: string, email?: string): Promise<ClassroomWork[]>;
  saveDraft(draft: ClassroomDraft): Promise<void>;
  drafts(classroomId: string, email: string): Promise<ClassroomDraft[]>;
}
export class MongoClassroomRepository implements ClassroomRepository {
  private checkSize(record: ClassroomRecord) {
    if (BSON.calculateObjectSize(record) > 14 * 1024 * 1024)
      throw new AppError(
        400,
        "This classroom's experiment and session content is too large. Reduce the content or use another classroom.",
      );
  }
  private ready: Promise<void> | undefined;
  private async collections() {
    const db = await getMongoDatabase();
    const rooms = db.collection<ClassroomRecord>("classrooms");
    const work = db.collection<ClassroomWork>("classroom_work");
    const drafts = db.collection<ClassroomDraft>("classroom_drafts");
    this.ready ??= Promise.all([
      rooms.createIndex({ id: 1 }, { unique: true }),
      rooms.createIndex({ joinCode: 1 }, { unique: true }),
      rooms.createIndex({ createdBy: 1, requestKey: 1 }, { unique: true }),
      work.createIndex({ id: 1 }, { unique: true }),
      work.createIndex({ classroomId: 1, email: 1, createdAt: 1 }),
      drafts.createIndex({ id: 1 }, { unique: true }),
    ])
      .then(() => undefined)
      .catch((error) => {
        this.ready = undefined;
        throw error;
      });
    await this.ready;
    return { rooms, work, drafts };
  }
  async list() {
    return (await this.collections()).rooms
      .find({}, { projection: { _id: 0 } })
      .toArray();
  }
  async get(id: string) {
    return (await this.collections()).rooms.findOne(
      { id },
      { projection: { _id: 0 } },
    );
  }
  async create(record: ClassroomRecord) {
    this.checkSize(record);
    const { rooms } = await this.collections();
    try {
      await rooms.insertOne({ ...record });
      return record;
    } catch (error) {
      const prior = await rooms.findOne(
        { createdBy: record.createdBy, requestKey: record.requestKey },
        { projection: { _id: 0 } },
      );
      if (prior) return prior;
      throw error;
    }
  }
  async compareAndSwap(record: ClassroomRecord, revision: number) {
    this.checkSize(record);
    const result = await (
      await this.collections()
    ).rooms.replaceOne(
      { id: record.id, revision },
      { ...record, revision: revision + 1 },
    );
    return result.modifiedCount === 1;
  }
  async insertWork(record: ClassroomWork) {
    const { work } = await this.collections();
    let inserted = false;
    try {
      const result = await work.updateOne(
        { id: record.id },
        { $setOnInsert: record },
        { upsert: true },
      );
      inserted = result.upsertedCount === 1;
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11000)
        throw error;
    }
    return {
      work: (await work.findOne(
        { id: record.id },
        { projection: { _id: 0 } },
      ))!,
      inserted,
    };
  }
  async finishWork(id: string, output: NonNullable<ClassroomWork["output"]>) {
    await (
      await this.collections()
    ).work.updateOne({ id, output: null }, { $set: { output } });
  }
  async work(classroomId: string, email?: string) {
    return (await this.collections()).work
      .find(
        { classroomId, ...(email ? { email } : {}) },
        { projection: { _id: 0 } },
      )
      .sort({ createdAt: 1, id: 1 })
      .toArray();
  }
  async saveDraft(draft: ClassroomDraft) {
    await (
      await this.collections()
    ).drafts.updateOne({ id: draft.id }, { $set: draft }, { upsert: true });
  }
  async drafts(classroomId: string, email: string) {
    return (await this.collections()).drafts
      .find({ classroomId, email }, { projection: { _id: 0 } })
      .toArray();
  }
}
