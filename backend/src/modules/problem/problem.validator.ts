import { z } from "zod";
import {
  DEPARTMENTS,
  DEFAULT_PROBLEM_MEMORY_LIMIT_MB,
  DEFAULT_PROBLEM_TIME_LIMIT_SECONDS,
  DIFFICULTIES,
  PROBLEM_LIFECYCLE_STATES,
} from "../../shared/constants/domain";
import {
  normalizeDepartment,
  normalizeDifficulty,
  normalizeProblemLifecycleState,
  normalizeNumber,
} from "../../shared/utils/normalize";
import type { Department, Difficulty, ProblemLifecycleState } from "../../shared/types/domain";
import type { ProblemTestCase } from "./problem.model";

const testCaseSchema = z.object({
  input: z.string().min(1),
  output: z.string(),
  explanation: z.string().optional(),
}).strict();

const exampleSchema = testCaseSchema.extend({
  hidden: z.boolean().default(false),
});

const tagsSchema = z
  .union([
    z.array(z.string()),
    z.string(),
  ])
  .transform((value) =>
    Array.isArray(value)
      ? value.map((item) => item.trim()).filter(Boolean)
      : value.split(",").map((item) => item.trim()).filter(Boolean),
  );

const constraintsSchema = z
  .union([
    z.array(z.string()),
    z.string(),
  ])
  .transform((value) =>
    Array.isArray(value)
      ? value.map((item) => item.trim()).filter(Boolean)
      : value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
  );

const numberSchema = z.union([z.number(), z.string().min(1)]).transform((value) => normalizeNumber(value, 0));
const departmentSchema = z.enum(DEPARTMENTS);

const problemWriteBaseSchema = z.object({
  title: z.string().min(3).max(150),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must use lowercase letters, numbers, and hyphens").optional(),
  statement: z.string().min(10),
  topic: z.string().min(1).optional(),
  inputFormat: z.string().min(1),
  outputFormat: z.string().min(1),
  constraints: constraintsSchema,
  explanation: z.string().optional(),
  difficulty: z.enum(["Easy", "Medium", "Hard"]),
  tags: tagsSchema,
  timeLimitSeconds: numberSchema.optional(),
  timeLimit: numberSchema.optional(),
  memoryLimitMb: numberSchema.optional(),
  memoryLimit: numberSchema.optional(),
  lifecycleState: z.enum(["Draft", "Published", "Archived"]).optional(),
  targetDepartment: z.union([departmentSchema, z.null()]).optional(),
  sampleTestCases: z.array(testCaseSchema).optional(),
  hiddenTestCases: z.array(testCaseSchema).optional(),
  examples: z.array(exampleSchema).optional(),
});

const problemDraftSchema = z.object({
  title: z.string().min(3).max(150),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must use lowercase letters, numbers, and hyphens"),
  statement: z.string().min(10),
  difficulty: z.enum(["Easy", "Medium", "Hard"]),
  topic: z.string().min(1),
  constraints: z.array(z.string().min(1)).min(1),
  inputFormat: z.string().min(1),
  outputFormat: z.string().min(1),
  explanation: z.string(),
  timeLimit: z.number().positive(),
  memoryLimit: z.number().positive(),
  tags: z.array(z.string().min(1)).min(1),
  sampleTestCases: z.array(testCaseSchema).min(1),
  hiddenTestCases: z.array(testCaseSchema).min(1),
}).strict();

export const problemDraftImportSchema = z.preprocess(
  (value) => (Array.isArray(value) ? value : [value]),
  z.array(problemDraftSchema).min(1),
);

export const createProblemSchema = problemWriteBaseSchema.superRefine((value, ctx) => {
  const sampleTestCases = value.sampleTestCases ?? value.examples?.filter((example) => !example.hidden) ?? [];
  if (sampleTestCases.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one sample test case is required",
      path: ["sampleTestCases"],
    });
  }
});

export const updateProblemSchema = problemWriteBaseSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field must be provided for update",
);

export const problemStateSchema = z.object({
  lifecycleState: z.enum(["Draft", "Published", "Archived"]),
});

export const studentProblemQuerySchema = z.object({
  search: z.string().optional(),
  difficulty: z
    .string()
    .optional()
    .transform((value) => (value ? normalizeDifficulty(value) : undefined)),
  tag: z.string().optional(),
  cursor: z.string().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const manageProblemQuerySchema = studentProblemQuerySchema.extend({
  lifecycleState: z
    .string()
    .optional()
    .transform((value) => (value ? normalizeProblemLifecycleState(value) : undefined)),
  targetDepartment: z
    .union([departmentSchema, z.string()])
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === "") {
        return undefined;
      }

      const normalized = normalizeDepartment(value);
      if (!normalized) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid department",
        });
        return z.NEVER;
      }

      return normalized;
    }),
});

export interface CanonicalProblemPayload {
  title: string;
  slug: string;
  statement: string;
  topic: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
  explanation: string;
  difficulty: Difficulty;
  tags: string[];
  timeLimitSeconds: number;
  memoryLimitMb: number;
  lifecycleState: ProblemLifecycleState;
  targetDepartment: Department | null;
  sampleTestCases: ProblemTestCase[];
  hiddenTestCases: ProblemTestCase[];
}

export type CanonicalProblemUpdatePayload = Partial<CanonicalProblemPayload>;

function splitExamplesIntoTestCases(examples: Array<ProblemTestCase & { hidden?: boolean }> | undefined): {
  sampleTestCases: ProblemTestCase[];
  hiddenTestCases: ProblemTestCase[];
} {
  const sampleTestCases = (examples ?? []).filter((example) => !example.hidden).map(({ hidden, ...rest }) => rest);
  const hiddenTestCases = (examples ?? []).filter((example) => example.hidden).map(({ hidden, ...rest }) => rest);

  return { sampleTestCases, hiddenTestCases };
}

export function toCanonicalProblemPayload(raw: z.infer<typeof createProblemSchema>): CanonicalProblemPayload {
  const exampleSplit = splitExamplesIntoTestCases(raw.examples);

  return {
    title: raw.title.trim(),
    slug: raw.slug?.trim() ?? raw.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    statement: raw.statement.trim(),
    topic: raw.topic?.trim() ?? "",
    inputFormat: raw.inputFormat.trim(),
    outputFormat: raw.outputFormat.trim(),
    constraints: raw.constraints,
    explanation: raw.explanation?.trim() ?? "",
    difficulty: normalizeDifficulty(raw.difficulty),
    tags: raw.tags,
    timeLimitSeconds: normalizeNumber(raw.timeLimitSeconds ?? raw.timeLimit, DEFAULT_PROBLEM_TIME_LIMIT_SECONDS),
    memoryLimitMb: normalizeNumber(raw.memoryLimitMb ?? raw.memoryLimit, DEFAULT_PROBLEM_MEMORY_LIMIT_MB),
    lifecycleState: normalizeProblemLifecycleState(raw.lifecycleState ?? "Draft"),
    targetDepartment: normalizeDepartment(raw.targetDepartment) ?? null,
    sampleTestCases: raw.sampleTestCases ?? exampleSplit.sampleTestCases,
    hiddenTestCases: raw.hiddenTestCases ?? exampleSplit.hiddenTestCases,
  };
}

export function toCanonicalProblemUpdatePayload(
  raw: z.infer<typeof updateProblemSchema>,
): CanonicalProblemUpdatePayload {
  const payload: CanonicalProblemUpdatePayload = {};
  const exampleSplit = splitExamplesIntoTestCases(raw.examples);

  if (raw.title !== undefined) payload.title = raw.title.trim();
  if (raw.slug !== undefined) payload.slug = raw.slug.trim();
  if (raw.statement !== undefined) payload.statement = raw.statement.trim();
  if (raw.topic !== undefined) payload.topic = raw.topic.trim();
  if (raw.inputFormat !== undefined) payload.inputFormat = raw.inputFormat.trim();
  if (raw.outputFormat !== undefined) payload.outputFormat = raw.outputFormat.trim();
  if (raw.constraints !== undefined) payload.constraints = raw.constraints;
  if (raw.explanation !== undefined) payload.explanation = raw.explanation.trim();
  if (raw.difficulty !== undefined) payload.difficulty = normalizeDifficulty(raw.difficulty);
  if (raw.tags !== undefined) payload.tags = raw.tags;
  if (raw.timeLimitSeconds !== undefined || raw.timeLimit !== undefined) {
    payload.timeLimitSeconds = normalizeNumber(
      raw.timeLimitSeconds ?? raw.timeLimit,
      DEFAULT_PROBLEM_TIME_LIMIT_SECONDS,
    );
  }
  if (raw.memoryLimitMb !== undefined || raw.memoryLimit !== undefined) {
    payload.memoryLimitMb = normalizeNumber(
      raw.memoryLimitMb ?? raw.memoryLimit,
      DEFAULT_PROBLEM_MEMORY_LIMIT_MB,
    );
  }
  if (raw.lifecycleState !== undefined) payload.lifecycleState = normalizeProblemLifecycleState(raw.lifecycleState);
  if (raw.targetDepartment !== undefined) {
    payload.targetDepartment = raw.targetDepartment === null ? null : normalizeDepartment(raw.targetDepartment);
  }
  if (raw.sampleTestCases !== undefined || raw.examples !== undefined) {
    payload.sampleTestCases = raw.sampleTestCases ?? exampleSplit.sampleTestCases;
  }
  if (raw.hiddenTestCases !== undefined || raw.examples !== undefined) {
    payload.hiddenTestCases = raw.hiddenTestCases ?? exampleSplit.hiddenTestCases;
  }

  return payload;
}
