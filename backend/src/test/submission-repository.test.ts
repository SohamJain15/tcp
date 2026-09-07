import { beforeEach, describe, expect, it, vi } from "vitest";
import { FirestoreSubmissionRepository } from "../modules/submission/submission.repository";

const mongo = vi.hoisted(() => ({ findOne: vi.fn(), find: vi.fn(), updateOne: vi.fn() }));
vi.mock("../config/mongodb", () => ({
  getMongoDatabase: async () => ({ collection: () => mongo }),
}));

describe("persisted submission languages", () => {
  const repository = new FirestoreSubmissionRepository();
  beforeEach(() => vi.clearAllMocks());

  it("preserves SQL when loading details, lists and analytics", async () => {
    const document = { id: "sql-submission", language: "sql", code: "SELECT 1", status: "ACCEPTED" };
    mongo.findOne.mockResolvedValue(document);
    const cursor = { sort: () => cursor, project: () => cursor, toArray: async () => [document] };
    mongo.find.mockReturnValue(cursor);
    expect((await repository.getById(document.id))?.language).toBe("sql");
    expect((await repository.list())[0].language).toBe("sql");
    expect((await repository.listForAnalytics())[0].language).toBe("sql");
  });

  it.each(["cpp", "python", "java"])("preserves %s coding submissions", async (language) => {
    mongo.findOne.mockResolvedValue({ id: "coding-submission", language });
    expect((await repository.getById("coding-submission"))?.language).toBe(language);
  });

  it.each(["sql-mysql", "sql-stub"])("recognizes historical cpp records judged by %s on every read path", async (executionProvider) => {
    const document = { id: "historical-sql", language: "cpp", executionProvider, code: "SELECT 1", status: "ACCEPTED" };
    mongo.findOne.mockResolvedValue(document);
    const cursor = { sort: () => cursor, project: () => cursor, toArray: async () => [document] };
    mongo.find.mockReturnValue(cursor);
    const submission = await repository.getById(document.id);
    expect(submission?.language).toBe("sql");
    expect((await repository.list())[0].language).toBe("sql");
    expect((await repository.listForAnalytics())[0].language).toBe("sql");
    await repository.save(submission!);
    expect(mongo.updateOne).toHaveBeenCalledWith(
      { id: document.id },
      { $set: expect.objectContaining({ language: "sql", code: document.code, status: "ACCEPTED" }) },
      { upsert: true },
    );
  });

  it("does not relabel real C++ based on SQL text in its code", async () => {
    mongo.findOne.mockResolvedValue({ id: "coding", language: "cpp", executionProvider: "judge0", code: 'const char* query = "SELECT 1";' });
    expect((await repository.getById("coding"))?.language).toBe("cpp");
  });
});
