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
  input: z.string().min(1, "Test case input is required"),
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
  statement: z.string().trim().min(1, "Question statement is required"),
  options: z.array(z.string().min(1, "Option text cannot be blank")).min(2, "At least two options are required"),
  correctAnswer: z.string().min(1, "Select the correct option"),
});

const msqQuestionSchema = questionBaseSchema.extend({
  type: z.literal("MSQ"),
  statement: z.string().trim().min(1, "Question statement is required"),
  options: z.array(z.string().min(1, "Option text cannot be blank")).min(2, "At least two options are required"),
  correctAnswers: z.array(z.string().min(1)).min(1, "Select at least one correct answer"),
});

export const codingQuestionSchema = questionBaseSchema.extend({
  type: z.literal("Coding"),
  problemTitle: z.string().trim().min(1, "Problem title is required"),
  difficulty: z.enum(["Easy", "Medium", "Hard"]),
  problemStatement: z.string().trim().min(1, "Problem statement is required"),
  constraints: z.string().trim().min(1, "Constraints are required"),
  // Blank is allowed — normalizeCodingQuestion substitutes a sensible default.
  inputFormat: z.string().optional(),
  outputFormat: z.string().optional(),
  sampleInput: z.string().optional(),
  expectedOutput: z.string().optional(),
  hiddenInput: z.string().optional(),
  hiddenOutput: z.string().optional(),
  sampleTestCases: z.array(testCaseSchema).optional(),
  hiddenTestCases: z.array(testCaseSchema).optional(),
  timeLimitSeconds: numberSchema.optional(),
  memoryLimitMb: numberSchema.optional(),
  supportedLanguages: codingLanguagesSchema,
});

/**
 * Discriminated on `type` so a bad question reports only its own field errors. A plain union
 * would report every branch's failures at once ("expected literal MCQ", ...), which is useless
 * to the faculty member trying to fix one field.
 */
export const contestQuestionSchema = z
  .discriminatedUnion("type", [mcqQuestionSchema, msqQuestionSchema, codingQuestionSchema])
  .superRefine((value, ctx) => {
    if (value.type !== "Coding") {
      return;
    }

    const hasHiddenTestCases =
      (value.hiddenTestCases?.length ?? 0) > 0 ||
      (typeof value.hiddenInput === "string" && typeof value.hiddenOutput === "string");

    if (!hasHiddenTestCases) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one hidden testcase is required",
        path: ["hiddenTestCases"],
      });
    }
  });

const timestampSchema = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid timestamp");

const contestBaseSchema = z.object({
  title: z.string().min(3).max(150),
  startTime: timestampSchema,
  endTime: timestampSchema,
  duration: numberSchema,
  registrationOpenAt: timestampSchema.optional(),
  registrationCloseAt: timestampSchema.optional(),
  type: contestTypeSchema,
  lifecycleState: z.literal("Published").optional(),
  targetDepartment: z.union([departmentSchema, z.null()]).optional(),
  maxViolations: numberSchema.optional(),
  questions: z.array(contestQuestionSchema).min(1),
});

/**
 * Timing rules shared by create and update: the contest window must be non-empty, a single
 * attempt must fit inside it, and registration must close no later than the window does.
 */
function refineContestWindow(
  value: {
    startTime?: string;
    endTime?: string;
    duration?: number;
    registrationOpenAt?: string;
    registrationCloseAt?: string;
  },
  ctx: z.RefinementCtx,
): void {
  const startAt = value.startTime ? new Date(value.startTime).getTime() : undefined;
  const endAt = value.endTime ? new Date(value.endTime).getTime() : undefined;

  if (startAt !== undefined && endAt !== undefined && endAt <= startAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End time must be after the start time",
      path: ["endTime"],
    });
  }

  if (value.duration !== undefined && value.duration < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Duration must be at least 1 minute",
      path: ["duration"],
    });
  }

  if (startAt !== undefined && endAt !== undefined && value.duration !== undefined) {
    const windowMinutes = (endAt - startAt) / 60_000;
    if (value.duration > windowMinutes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duration cannot exceed the contest window of ${Math.floor(windowMinutes)} minutes`,
        path: ["duration"],
      });
    }
  }

  const registrationOpenAt = value.registrationOpenAt ? new Date(value.registrationOpenAt).getTime() : undefined;
  const registrationCloseAt = value.registrationCloseAt ? new Date(value.registrationCloseAt).getTime() : undefined;

  if (registrationOpenAt !== undefined && registrationCloseAt !== undefined && registrationCloseAt <= registrationOpenAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Registration must close after it opens",
      path: ["registrationCloseAt"],
    });
  }

  if (registrationCloseAt !== undefined && endAt !== undefined && registrationCloseAt > endAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Registration cannot close after the contest ends",
      path: ["registrationCloseAt"],
    });
  }
}

export const createContestSchema = contestBaseSchema.superRefine(refineContestWindow);

export const updateContestSchema = contestBaseSchema
  .partial()
  .superRefine((value, ctx) => {
    if (Object.keys(value).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one field must be provided for update",
      });
    }

    refineContestWindow(value, ctx);
  });

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
