import { z } from "zod";

import { DEPARTMENTS, EXECUTABLE_LANGUAGES } from "../../shared/constants/domain";
import type { ExecutableLanguage } from "../../shared/types/domain";

/**
 * Lab payload validation.
 *
 * An experiment is a discriminated union on `kind` ("sql" | "coding"), mirroring how the class-test
 * validator discriminates questions on `type`. As there, the cross-field rule (a coding experiment
 * needs a hidden test case) lives in the `.superRefine` after the union, because
 * `z.discriminatedUnion` only accepts plain objects.
 */

const experimentBase = {
  id: z.string().trim().min(1).optional(),
  number: z.coerce.number().int().min(1).max(200),
  title: z.string().trim().min(1, "Experiment title is required"),
  aim: z.string().trim().min(1, "Describe what the student must do"),
  points: z.coerce.number().int().min(0).max(100),
};

const labTestCaseSchema = z.object({
  input: z.string(),
  output: z.string(),
  explanation: z.string().optional(),
});

const sqlExperimentSchema = z.object({
  ...experimentBase,
  kind: z.literal("sql"),
  schemaSql: z.string().trim().min(1, "Provide the schema and seed data").max(100_000, "Schema SQL is too large"),
  solutionSql: z.string().trim().min(1, "Provide the reference (solution) query").max(20_000, "Solution SQL is too large"),
  ordered: z.boolean().default(false),
});

const codingExperimentSchema = z.object({
  ...experimentBase,
  kind: z.literal("coding"),
  difficulty: z.enum(["Easy", "Medium", "Hard"]).default("Easy"),
  constraints: z.string().trim().default(""),
  inputFormat: z.string().trim().default(""),
  outputFormat: z.string().trim().default(""),
  timeLimitSeconds: z.coerce.number().int().min(1).max(10).default(2),
  memoryLimitMb: z.coerce.number().int().min(16).max(1024).default(256),
  sampleTestCases: z.array(labTestCaseSchema).default([]),
  hiddenTestCases: z.array(labTestCaseSchema).default([]),
  supportedLanguages: z
    .array(z.enum(EXECUTABLE_LANGUAGES as [ExecutableLanguage, ...ExecutableLanguage[]]))
    .min(1, "Choose at least one language students may answer in"),
});

const experimentSchema = z
  .discriminatedUnion("kind", [sqlExperimentSchema, codingExperimentSchema])
  .superRefine((value, ctx) => {
    if (value.kind === "coding" && value.hiddenTestCases.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add at least one hidden test case",
        path: ["hiddenTestCases"],
      });
    }
  });

const labBodySchema = z.object({
  title: z.string().trim().min(3).max(150),
  subject: z.string().trim().min(1).max(100),
  kind: z.enum(["DSA", "DBMS"]),
  department: z.enum(DEPARTMENTS).nullable().default(null),
  semester: z.coerce.number().int().min(1).max(8).nullable().default(null),
  description: z.string().trim().max(2000).nullable().default(null),
  lifecycleState: z.enum(["Draft", "Published", "Archived"]).default("Draft"),
  experiments: z.array(experimentSchema).min(1, "Add at least one experiment"),
});

export const createLabSchema = labBodySchema;
export const updateLabSchema = labBodySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });

/** Student run/submit of a SQL experiment. */
export const labSqlRunSchema = z.object({
  experimentId: z.string().trim().min(1),
  sql: z.string().trim().min(1, "Write a query first").max(12_000, "Query is too large"),
});

/** Student run/submit/draft of a coding experiment. A draft may be empty (editor cleared). */
export const labCodingRunSchema = z.object({
  experimentId: z.string().trim().min(1),
  code: z.string(),
  language: z.enum(EXECUTABLE_LANGUAGES as [ExecutableLanguage, ...ExecutableLanguage[]]),
});

/** Faculty "Run solution" preview — lay out the expected grid for an experiment being authored. */
export const labSqlPreviewSchema = z.object({
  schemaSql: z.string().trim().min(1).max(100_000),
  solutionSql: z.string().trim().min(1).max(20_000),
  ordered: z.boolean().default(false),
  /** Optional: run this instead of the solution, to preview the student experience. */
  studentSql: z.string().trim().max(12_000).optional(),
});

export type CreateLabInput = z.infer<typeof createLabSchema>;
export type UpdateLabInput = z.infer<typeof updateLabSchema>;
export type LabSqlRunInput = z.infer<typeof labSqlRunSchema>;
export type LabSqlPreviewInput = z.infer<typeof labSqlPreviewSchema>;
