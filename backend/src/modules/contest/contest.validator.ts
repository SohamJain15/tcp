import { z } from "zod";
import {
  DEPARTMENTS,
  DEFAULT_PROBLEM_MEMORY_LIMIT_MB,
  DEFAULT_PROBLEM_TIME_LIMIT_SECONDS,
  EXECUTABLE_LANGUAGES,
} from "../../shared/constants/domain";
import { normalizeNumber, tryNormalizeSupportedLanguage } from "../../shared/utils/normalize";
import type { ExecutableLanguage } from "../../shared/types/domain";
import type { CodingContestQuestion } from "./contest.model";

const contestTypeSchema = z.enum(["Rated", "Practice"]);
const contestQuestionTypeSchema = z.enum(["MCQ", "MSQ", "Coding"]);
const departmentSchema = z.enum(DEPARTMENTS);

const numberSchema = z.union([z.number(), z.string().min(1)]).transform((value) => normalizeNumber(value, 0));

const testCaseSchema = z.object({
  input: z.string().min(1),
  output: z.string(),
  explanation: z.string().optional(),
});

const codingLanguagesSchema = z
  .array(z.string())
  .optional()
  .transform((values) =>
    (values ?? [])
      .map((value) => tryNormalizeSupportedLanguage(value))
      .filter(
        (value): value is ExecutableLanguage =>
          Boolean(value && value !== "react" && value !== "html" && value !== "css"),
      ),
  );

const questionBaseSchema = z.object({
  id: z.string().min(1),
  type: contestQuestionTypeSchema,
  points: numberSchema,
});

const mcqQuestionSchema = questionBaseSchema.extend({
  type: z.literal("MCQ"),
  statement: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  correctAnswer: z.string().min(1),
});

const msqQuestionSchema = questionBaseSchema.extend({
  type: z.literal("MSQ"),
  statement: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  correctAnswers: z.array(z.string().min(1)).min(1),
});

const codingQuestionSchema = questionBaseSchema
  .extend({
    type: z.literal("Coding"),
    problemTitle: z.string().min(1),
    difficulty: z.enum(["Easy", "Medium", "Hard"]),
    problemStatement: z.string().min(1),
    constraints: z.string().min(1),
    inputFormat: z.string().min(1).optional(),
    outputFormat: z.string().min(1).optional(),
    sampleInput: z.string().optional(),
    expectedOutput: z.string().optional(),
    hiddenInput: z.string().optional(),
    hiddenOutput: z.string().optional(),
    sampleTestCases: z.array(testCaseSchema).optional(),
    hiddenTestCases: z.array(testCaseSchema).optional(),
    timeLimitSeconds: numberSchema.optional(),
    memoryLimitMb: numberSchema.optional(),
    supportedLanguages: codingLanguagesSchema,
  })
  .refine(
    (value) =>
      (value.hiddenTestCases?.length ?? 0) > 0 ||
      (typeof value.hiddenInput === "string" && typeof value.hiddenOutput === "string"),
    "At least one hidden testcase is required",
  );

export const contestQuestionSchema = z.union([
  mcqQuestionSchema,
  msqQuestionSchema,
  codingQuestionSchema,
]);

export const createContestSchema = z.object({
  title: z.string().min(3).max(150),
  startTime: z.string().min(1),
  duration: numberSchema,
  type: contestTypeSchema,
  lifecycleState: z.literal("Published").optional(),
  targetDepartment: z.union([departmentSchema, z.null()]).optional(),
  maxViolations: numberSchema.optional(),
  questions: z.array(contestQuestionSchema).min(1),
});

export const updateContestSchema = createContestSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field must be provided for update",
);

export const contestResultsSchema = z.object({
  resultsPublished: z.boolean(),
});

export const contestAnswerSchema = z.object({
  questionId: z.string().min(1),
  answer: z.union([z.string(), z.array(z.string())]),
});

export const contestCodingSubmissionSchema = z.object({
  questionId: z.string().min(1),
  code: z.string().trim().min(1),
  language: z
    .string()
    .min(1)
    .transform((value, ctx) => {
      const normalized = tryNormalizeSupportedLanguage(value);
      if (!normalized || normalized === "react" || normalized === "html" || normalized === "css") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Unsupported language",
        });
        return z.NEVER;
      }

      return normalized;
    }),
});

export const contestCodingRunSchema = contestCodingSubmissionSchema;

export const contestProctoringEventSchema = z.object({
  type: z.enum([
    "TAB_SWITCH",
    "VISIBILITY_LOSS",
    "FULLSCREEN_EXIT",
    "COPY",
    "CUT",
    "PASTE",
    "CONTEXT_MENU",
    "PRINT_SCREEN",
  ]),
  details: z.string().trim().optional().transform((value) => (value ? value : null)),
});

export function normalizeCodingQuestion(raw: z.infer<typeof codingQuestionSchema>): CodingContestQuestion {
  const sampleTestCases =
    raw.sampleTestCases && raw.sampleTestCases.length > 0
      ? raw.sampleTestCases
      : raw.sampleInput !== undefined && raw.expectedOutput !== undefined
        ? [{ input: raw.sampleInput, output: raw.expectedOutput }]
        : [];
  const hiddenTestCases =
    raw.hiddenTestCases && raw.hiddenTestCases.length > 0
      ? raw.hiddenTestCases
      : raw.hiddenInput !== undefined && raw.hiddenOutput !== undefined
        ? [{ input: raw.hiddenInput, output: raw.hiddenOutput }]
        : [];

  return {
    ...raw,
    inputFormat: raw.inputFormat?.trim() || "Read input from standard input.",
    outputFormat: raw.outputFormat?.trim() || "Print output to standard output.",
    timeLimitSeconds: raw.timeLimitSeconds ?? DEFAULT_PROBLEM_TIME_LIMIT_SECONDS,
    memoryLimitMb: raw.memoryLimitMb ?? DEFAULT_PROBLEM_MEMORY_LIMIT_MB,
    sampleTestCases,
    hiddenTestCases,
    supportedLanguages: raw.supportedLanguages.length > 0 ? raw.supportedLanguages : [...EXECUTABLE_LANGUAGES],
  };
}
