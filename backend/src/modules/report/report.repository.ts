import type { Collection } from "mongodb";

import { getMongoDatabase } from "../../config/mongodb";
import { toDate } from "../../shared/utils/date";
import type {
  ContestAnalytics,
  ContestReportNarrative,
  ContestReportRecord,
  ReportSource,
  ReportStatus,
} from "./report.model";

export interface ContestReportRepository {
  getByContestId(contestId: string): Promise<ContestReportRecord | null>;
  /**
   * Atomically take ownership of report generation for a contest.
   *
   * Returns the claimed record on success, or `null` when another generation is already in flight.
   * The document itself is the lock — a second faculty click (or a double-submitting browser) loses
   * the race in the database rather than starting a duplicate model run.
   */
  claimForGeneration(input: ClaimReportInput): Promise<ContestReportRecord | null>;
  save(record: ContestReportRecord): Promise<ContestReportRecord>;
}

export interface ClaimReportInput {
  contestId: string;
  generatedByEmail: string;
  now: Date;
  /** A GENERATING claim older than this is treated as abandoned (crashed process) and reclaimed. */
  staleLockMs: number;
}

function mapReportRecord(data: Record<string, unknown>): ContestReportRecord {
  const createdAt = toDate(data.createdAt) ?? new Date();
  return {
    id: typeof data.id === "string" ? data.id : "",
    contestId: typeof data.contestId === "string" ? data.contestId : "",
    status:
      data.status === "READY" ? "READY" : data.status === "FAILED" ? "FAILED" : "GENERATING",
    source: (data.source === "AI" ? "AI" : "TEMPLATE") as ReportSource,
    metrics: (data.metrics as ContestAnalytics | undefined) ?? null,
    narrative: (data.narrative as ContestReportNarrative | undefined) ?? null,
    warnings: Array.isArray(data.warnings)
      ? data.warnings.filter((value): value is string => typeof value === "string")
      : [],
    modelId: typeof data.modelId === "string" ? data.modelId : null,
    promptVersion: typeof data.promptVersion === "string" ? data.promptVersion : null,
    metricsHash: typeof data.metricsHash === "string" ? data.metricsHash : null,
    generatedByEmail: typeof data.generatedByEmail === "string" ? data.generatedByEmail : "",
    generationStartedAt: toDate(data.generationStartedAt) ?? createdAt,
    generatedAt: toDate(data.generatedAt),
    failureReason: typeof data.failureReason === "string" ? data.failureReason : null,
    createdAt,
    updatedAt: toDate(data.updatedAt) ?? createdAt,
  };
}

/**
 * One report per contest, enforced by a unique index. The index is what makes the concurrent-insert
 * path in `claimForGeneration` safe: without it two callers could both insert and both start a model
 * run. Created lazily and memoised because the project has no migration step.
 */
let indexReady: Promise<void> | null = null;

async function getCollection(): Promise<Collection> {
  const db = await getMongoDatabase();
  const collection = db.collection("contest_reports");

  if (!indexReady) {
    indexReady = collection
      .createIndex({ contestId: 1 }, { unique: true, name: "contest_reports_contestId_unique" })
      .then(() => undefined)
      .catch((error) => {
        // Never block report reads on index creation; the claim path degrades to last-write-wins.
        console.error("Failed to create contest_reports index", error);
        indexReady = null;
      });
  }
  await indexReady;

  return collection;
}

export class MongoContestReportRepository implements ContestReportRepository {
  async getByContestId(contestId: string): Promise<ContestReportRecord | null> {
    const document = await (await getCollection()).findOne({ contestId });
    return document ? mapReportRecord(document as Record<string, unknown>) : null;
  }

  async claimForGeneration(input: ClaimReportInput): Promise<ContestReportRecord | null> {
    const collection = await getCollection();
    const staleBefore = new Date(input.now.getTime() - input.staleLockMs);

    const claim: ContestReportRecord = {
      id: `report_${input.contestId}`,
      contestId: input.contestId,
      status: "GENERATING",
      source: "TEMPLATE",
      metrics: null,
      narrative: null,
      warnings: [],
      modelId: null,
      promptVersion: null,
      metricsHash: null,
      generatedByEmail: input.generatedByEmail,
      generationStartedAt: input.now,
      generatedAt: null,
      failureReason: null,
      createdAt: input.now,
      updatedAt: input.now,
    };

    // A single conditional update carries the whole race: it matches only a finished report or an
    // abandoned claim, so a live GENERATING document simply fails to match.
    const result = await collection.updateOne(
      {
        contestId: input.contestId,
        $or: [
          { status: { $in: ["READY", "FAILED"] } },
          { status: "GENERATING", generationStartedAt: { $lte: staleBefore } },
        ],
      },
      {
        $set: {
          status: claim.status,
          generatedByEmail: claim.generatedByEmail,
          generationStartedAt: claim.generationStartedAt,
          generatedAt: null,
          failureReason: null,
          updatedAt: claim.updatedAt,
        },
      },
    );

    if (result.matchedCount > 0) {
      return this.getByContestId(input.contestId);
    }

    // No existing document to take over: insert one. A unique index on contestId turns the
    // concurrent-insert race into a duplicate-key error, which means the other caller won.
    try {
      await collection.insertOne(claim as unknown as Record<string, unknown>);
      return claim;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return null;
      }
      throw error;
    }
  }

  async save(record: ContestReportRecord): Promise<ContestReportRecord> {
    await (await getCollection()).updateOne(
      { contestId: record.contestId },
      { $set: record },
      { upsert: true },
    );
    return record;
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);
}

export function isStatus(record: ContestReportRecord | null, status: ReportStatus): boolean {
  return record?.status === status;
}
