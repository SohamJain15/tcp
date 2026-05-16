import { DEFAULT_PROBLEM_MEMORY_LIMIT_MB, DEFAULT_PROBLEM_TIME_LIMIT_SECONDS } from "../../shared/constants/domain";
import type { Firestore } from "firebase-admin/firestore";
import { toDate } from "../../shared/utils/date";
import {
  normalizeDepartment,
  normalizeDifficulty,
  normalizeNumber,
  normalizeProblemLifecycleState,
  normalizeRole,
} from "../../shared/utils/normalize";
import type { ProblemRecord, ProblemTestCase } from "./problem.model";

export interface ProblemRepository {
  getById(problemId: string): Promise<ProblemRecord | null>;
  save(problem: ProblemRecord): Promise<ProblemRecord>;
  list(): Promise<ProblemRecord[]>;
}

function normalizeConstraints(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeTestCase(value: unknown): ProblemTestCase | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const input = typeof record.input === "string" ? record.input : null;
  const output = typeof record.output === "string" ? record.output : null;

  if (!input || output === null) {
    return null;
  }

  return {
    input,
    output,
    explanation: typeof record.explanation === "string" ? record.explanation : undefined,
  };
}

function normalizeTestCaseList(values: unknown): ProblemTestCase[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.map(normalizeTestCase).filter((value): value is ProblemTestCase => Boolean(value));
}

function mapProblemRecord(problemId: string, data: Record<string, unknown>): ProblemRecord {
  const createdAt = toDate(data.createdAt) ?? new Date();
  const updatedAt = toDate(data.updatedAt) ?? createdAt;
  const lifecycleState =
    data.lifecycleState !== undefined
      ? normalizeProblemLifecycleState(data.lifecycleState)
      : data.approved === true
        ? "Published"
        : "Draft";
  const sampleFromExamples = Array.isArray(data.examples)
    ? (data.examples as Array<Record<string, unknown>>)
        .filter((example) => example.hidden !== true)
        .map(normalizeTestCase)
        .filter((value): value is ProblemTestCase => Boolean(value))
    : [];
  const hiddenFromExamples = Array.isArray(data.examples)
    ? (data.examples as Array<Record<string, unknown>>)
        .filter((example) => example.hidden === true)
        .map(normalizeTestCase)
        .filter((value): value is ProblemTestCase => Boolean(value))
    : [];

  const legacyStatementParts = [data.objective, data.task]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());

  const statement =
    typeof data.statement === "string"
      ? data.statement
      : legacyStatementParts.join("\n\n") || "Problem statement not provided.";

  return {
    id: String(data.id ?? problemId),
    title: typeof data.title === "string" ? data.title : problemId,
    statement,
    inputFormat: typeof data.inputFormat === "string" ? data.inputFormat : "Input format not provided.",
    outputFormat: typeof data.outputFormat === "string" ? data.outputFormat : "Output format not provided.",
    constraints: normalizeConstraints(data.constraints),
    difficulty: normalizeDifficulty(data.difficulty),
    tags: Array.isArray(data.tags) ? data.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
    timeLimitSeconds: normalizeNumber(data.timeLimitSeconds ?? data.timeLimit, DEFAULT_PROBLEM_TIME_LIMIT_SECONDS),
    memoryLimitMb: normalizeNumber(data.memoryLimitMb ?? data.memoryLimit, DEFAULT_PROBLEM_MEMORY_LIMIT_MB),
    lifecycleState,
    targetDepartment: normalizeDepartment(data.targetDepartment),
    createdBy: typeof data.createdBy === "string" ? data.createdBy : "faculty@tcetmumbai.in",
    createdByRole: normalizeRole(data.createdByRole),
    totalSubmissions: normalizeNumber(data.totalSubmissions ?? data.submissions, 0),
    acceptedSubmissions: normalizeNumber(data.acceptedSubmissions, 0),
    acceptanceRate: normalizeNumber(data.acceptanceRate ?? data.acceptance, 0),
    sampleTestCases:
      normalizeTestCaseList(data.sampleTestCases).length > 0
        ? normalizeTestCaseList(data.sampleTestCases)
        : sampleFromExamples.length > 0
          ? sampleFromExamples
          : normalizeTestCase(data.sampleInput && data.sampleOutput ? { input: data.sampleInput, output: data.sampleOutput } : null)
            ? [normalizeTestCase({ input: data.sampleInput, output: data.sampleOutput })!]
            : [],
    hiddenTestCases:
      normalizeTestCaseList(data.hiddenTestCases).length > 0
        ? normalizeTestCaseList(data.hiddenTestCases)
        : hiddenFromExamples.length > 0
          ? hiddenFromExamples
          : normalizeTestCaseList(data.testCases),
    createdAt,
    updatedAt,
  };
}

export class FirestoreProblemRepository implements ProblemRepository {
  constructor(private readonly firestore: Firestore) {}

  async getById(problemId: string): Promise<ProblemRecord | null> {
    const snapshot = await this.firestore.collection("problems").doc(problemId).get();
    if (!snapshot.exists) {
      return null;
    }

    return mapProblemRecord(problemId, snapshot.data() as Record<string, unknown>);
  }

  async save(problem: ProblemRecord): Promise<ProblemRecord> {
    await this.firestore.collection("problems").doc(problem.id).set(
      {
        ...problem,
        approved: problem.lifecycleState === "Published",
        timeLimit: problem.timeLimitSeconds,
        memoryLimit: problem.memoryLimitMb,
        targetDepartment: problem.targetDepartment,
        examples: problem.sampleTestCases.map((testCase) => ({ ...testCase, hidden: false })).concat(
          problem.hiddenTestCases.map((testCase) => ({ ...testCase, hidden: true })),
        ),
      },
      { merge: true },
    );

    return problem;
  }

  async list(): Promise<ProblemRecord[]> {
    const snapshot = await this.firestore.collection("problems").get();
    return snapshot.docs.map((doc) => mapProblemRecord(doc.id, doc.data() as Record<string, unknown>));
  }
}
