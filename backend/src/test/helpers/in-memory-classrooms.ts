import type { ClassroomRepository } from "../../modules/classroom/classroom.repository";
import type {
  ClassroomRecord,
  ClassroomWork,
  ClassroomDraft,
} from "../../modules/classroom/classroom.model";

export class InMemoryClassrooms implements ClassroomRepository {
  rooms = new Map<string, ClassroomRecord>();
  records = new Map<string, ClassroomWork>();
  savedDrafts = new Map<string, ClassroomDraft>();
  async list() {
    return structuredClone([...this.rooms.values()]);
  }
  async get(id: string) {
    return structuredClone(this.rooms.get(id) ?? null);
  }
  async create(record: ClassroomRecord) {
    const prior = [...this.rooms.values()].find(
      (r) =>
        r.createdBy === record.createdBy && r.requestKey === record.requestKey,
    );
    if (prior) return structuredClone(prior);
    this.rooms.set(record.id, structuredClone(record));
    return structuredClone(record);
  }
  async compareAndSwap(record: ClassroomRecord, revision: number) {
    if (this.rooms.get(record.id)?.revision !== revision) return false;
    this.rooms.set(
      record.id,
      structuredClone({ ...record, revision: revision + 1 }),
    );
    return true;
  }
  async insertWork(record: ClassroomWork) {
    const inserted = !this.records.has(record.id);
    if (inserted) this.records.set(record.id, structuredClone(record));
    return { work: structuredClone(this.records.get(record.id)!), inserted };
  }
  async finishWork(id: string, output: NonNullable<ClassroomWork["output"]>) {
    const work = this.records.get(id);
    if (work && !work.output) work.output = structuredClone(output);
  }
  async work(id: string, email?: string) {
    return structuredClone(
      [...this.records.values()].filter(
        (w) => w.classroomId === id && (!email || w.email === email),
      ),
    );
  }
  async saveDraft(draft: ClassroomDraft) {
    this.savedDrafts.set(draft.id, structuredClone(draft));
  }
  async drafts(id: string, email: string) {
    return structuredClone(
      [...this.savedDrafts.values()].filter(
        (d) => d.classroomId === id && d.email === email,
      ),
    );
  }
}
