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

/**
 * A structural check for a script experiment. Mirrors `SqlCheck` in `execution/sql/sql-checks.ts`;
 * `.strict()` on every branch so a misspelled key ("anyTables", "minRow") is reported instead of
 * silently turning a check into something weaker than the faculty intended.
 */
const sqlCheckSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("tableExists"),
    label: z.string().trim().min(1).max(200),
    table: z.string().trim().min(1).max(64),
  }).strict(),
  z.object({
    type: z.literal("tableCount"),
    label: z.string().trim().min(1).max(200),
    min: z.coerce.number().int().min(0).max(100).optional(),
    max: z.coerce.number().int().min(0).max(100).optional(),
  }).strict(),
  z.object({
    type: z.literal("hasColumn"),
    label: z.string().trim().min(1).max(200),
    column: z.string().trim().min(1).max(64),
    dataType: z.string().trim().min(1).max(32).optional(),
    table: z.string().trim().min(1).max(64).optional(),
    anyTable: z.boolean().optional(),
  }).strict(),
  z.object({
    type: z.literal("hasConstraint"),
    label: z.string().trim().min(1).max(200),
    constraint: z.enum(["PRIMARY KEY", "FOREIGN KEY", "UNIQUE", "NOT NULL", "CHECK", "INDEX"]),
    table: z.string().trim().min(1).max(64).optional(),
    anyTable: z.boolean().optional(),
    column: z.string().trim().min(1).max(64).optional(),
  }).strict(),
  z.object({
    type: z.literal("rowCount"),
    label: z.string().trim().min(1).max(200),
    min: z.coerce.number().int().min(0).max(1_000_000),
    max: z.coerce.number().int().min(0).max(1_000_000).optional(),
    table: z.string().trim().min(1).max(64).optional(),
    anyTable: z.boolean().optional(),
  }).strict(),
  z.object({
    type: z.literal("queryReturns"),
    label: z.string().trim().min(1).max(200),
    sql: z.string().trim().min(1).max(5_000),
    minRows: z.coerce.number().int().min(0).max(1_000_000).optional(),
    maxRows: z.coerce.number().int().min(0).max(1_000_000).optional(),
  }).strict(),
]);

const sqlExperimentSchema = z.object({
  ...experimentBase,
  kind: z.literal("sql"),
  /** Absent means "query" — every experiment authored before script mode keeps its behaviour. */
  sqlMode: z.enum(["query", "script"]).default("query"),
  // Script experiments legitimately start from an empty database ("design your own schema"), so an
  // empty seed is allowed here and required only for query mode by the superRefine below.
  schemaSql: z.string().trim().max(100_000, "Schema SQL is too large").default(""),
  solutionSql: z.string().trim().max(20_000, "Solution SQL is too large").default(""),
  ordered: z.boolean().default(false),
  checks: z.array(sqlCheckSchema).max(30, "An experiment may declare at most 30 checks").default([]),
  facultyMarked: z.boolean().default(false),
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
    if (value.kind === "coding") {
      if (value.hiddenTestCases.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Add at least one hidden test case",
          path: ["hiddenTestCases"],
        });
      }
      return;
    }

    if (value.sqlMode === "query") {
      // Query mode grades by comparing grids, so both the seed and the reference query are needed.
      if (value.schemaSql === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide the schema and seed data", path: ["schemaSql"] });
      }
      if (value.solutionSql === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Provide the reference (solution) query",
          path: ["solutionSql"],
        });
      }
      if (value.checks.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Checks apply to script experiments. Set "sqlMode": "script" to use them.',
          path: ["checks"],
        });
      }
      return;
    }

    // Script mode has no reference answer to compare against, so it needs either checks to judge
    // by or an explicit statement that the faculty will mark it by hand.
    if (value.checks.length === 0 && !value.facultyMarked) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'A script experiment needs at least one check, or "facultyMarked": true if you will mark it yourself.',
        path: ["checks"],
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
  /** "This lab is only open while a teacher is running a session for it." */
  requiresAttendance: z.boolean().default(false),
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
