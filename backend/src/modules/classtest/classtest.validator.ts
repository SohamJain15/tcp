import { z } from "zod";
import { DEPARTMENTS, EXECUTABLE_LANGUAGES } from "../../shared/constants/domain";
import type { ExecutableLanguage } from "../../shared/types/domain";

/**
 * Class Test payload validation.
 *
 * Two rules here exist to stop a test being unanswerable rather than merely malformed:
 * a coding question must offer at least one language, and a roll range must not be inverted.
 */

const MAX_DURATION_MINUTES = 240;

const testCaseSchema = z.object({
  input: z.string(),
  output: z.string(),
  explanation: z.string().optional(),
});

const questionBase = {
  id: z.string().trim().min(1).optional(),
  points: z.coerce.number().int().min(0).max(100),
  setLabel: z.string().trim().min(1).max(8).optional(),
};

const mcqSchema = z.object({
  ...questionBase,
  type: z.literal("MCQ"),
  statement: z.string().trim().min(1, "Question text is required"),
  options: z.array(z.string().trim().min(1)).min(2, "Give at least two options"),
  correctAnswer: z.string().trim().min(1, "Select the correct option"),
});

const msqSchema = z.object({
  ...questionBase,
  type: z.literal("MSQ"),
  statement: z.string().trim().min(1, "Question text is required"),
  options: z.array(z.string().trim().min(1)).min(2, "Give at least two options"),
  correctAnswers: z.array(z.string().trim().min(1)).min(1, "Select at least one correct option"),
});

const shortAnswerSchema = z.object({
  ...questionBase,
  type: z.literal("ShortAnswer"),
  statement: z.string().trim().min(1, "Question text is required"),
  expectedSentences: z.coerce.number().int().min(1).max(20).optional(),
  modelAnswer: z.string().trim().optional(),
});

const codingSchema = z.object({
  ...questionBase,
  type: z.literal("Coding"),
  problemTitle: z.string().trim().min(1),
  difficulty: z.enum(["Easy", "Medium", "Hard"]),
  problemStatement: z.string().trim().min(1),
  constraints: z.string().trim().default(""),
  inputFormat: z.string().trim().default(""),
  outputFormat: z.string().trim().default(""),
  timeLimitSeconds: z.coerce.number().int().min(1).max(10).optional(),
  memoryLimitMb: z.coerce.number().int().min(16).max(1024).optional(),
  sampleTestCases: z.array(testCaseSchema).default([]),
  hiddenTestCases: z.array(testCaseSchema).default([]),
  // Never allowed to be empty: a coding question nobody can pick a language for is a
  // question nobody can answer.
  supportedLanguages: z
    .array(z.enum(EXECUTABLE_LANGUAGES as [ExecutableLanguage, ...ExecutableLanguage[]]))
    .min(1, "Choose at least one language students may answer in"),
});

/**
 * The class-test feedback questionnaire is deliberately identical to the contest one
 * (`contest.validator.ts`), so the CoE can compare the two without reconciling shapes.
 */
const ratingSchema = z.coerce.number().int().min(1).max(5);

export const classTestFeedbackSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  uid: z.string().trim().min(1, "UID is required"),
  navigationEase: ratingSchema,
  visualDesignRating: ratingSchema,
  interfaceReadability: z.enum(["Yes", "No", "Need improvement"]),
  editorResponsiveness: ratingSchema,
  compilationLag: ratingSchema,
  errorMessageClarity: ratingSchema,
  problemStatementClarity: z.enum(["Yes", "No", "Needs improvement"]),
  bugsOrBrokenLinks: z.string().trim().min(1, "This field is required"),
  oneNewFeature: z.string().trim().min(1, "This field is required"),
  recommendLikelihood: ratingSchema,
  overallRating: ratingSchema.nullish(),
});

const questionSchema = z
  .discriminatedUnion("type", [mcqSchema, msqSchema, shortAnswerSchema, codingSchema])
  .superRefine((value, ctx) => {
    // Marks are proportional to test cases passed, so a coding question with only visible
    // samples scores every student on work they could already see. Contests refuse this too.
    if (value.type === "Coding" && value.hiddenTestCases.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add at least one hidden test case",
        path: ["hiddenTestCases"],
      });
    }
  });

const audienceSchema = z
  .object({
    department: z.enum(DEPARTMENTS),
    division: z.string().trim().toUpperCase().regex(/^[A-Z]$/).nullable().default(null),
    semester: z.coerce.number().int().min(1).max(8).nullable().default(null),
    rollFrom: z.coerce.number().int().min(0).nullable().default(null),
    rollTo: z.coerce.number().int().min(0).nullable().default(null),
  })
  .refine(
    (value) => value.rollFrom === null || value.rollTo === null || value.rollFrom <= value.rollTo,
    { message: "Roll range starts after it ends", path: ["rollTo"] },
  );

export const createClassTestSchema = z.object({
  title: z.string().trim().min(3).max(150),
  /** Free text — CT is not limited to any fixed subject list. */
  subject: z.string().trim().min(1).max(100),
  instructions: z.string().trim().max(2000).nullable().default(null),
  startAt: z.string().datetime({ offset: true }),
  durationMinutes: z.coerce.number().int().min(1).max(MAX_DURATION_MINUTES),
  audience: audienceSchema,
  /** Emails the faculty ticked. Must be a subset of the filter result — checked in the service. */
  assignedEmails: z.array(z.string().trim().toLowerCase().email()).default([]),
  maxViolations: z.coerce.number().int().min(1).max(20).default(1),
  questions: z.array(questionSchema).min(1, "Add at least one question"),
  lifecycleState: z.enum(["Draft", "Published", "Archived"]).default("Draft"),
});

export const updateClassTestSchema = createClassTestSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "Nothing to update" },
);

export const audiencePreviewSchema = audienceSchema;

export const classTestResultsSchema = z.object({
  resultsPublished: z.boolean(),
});

export const classTestAnswerSchema = z.object({
  questionId: z.string().trim().min(1),
  /** A single option for MCQ, several for MSQ, free text for a short answer. */
  answer: z.union([z.string(), z.array(z.string())]),
});

export const classTestProctorEventSchema = z.object({
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
});

export const classTestCodingRunSchema = z.object({
  questionId: z.string().trim().min(1),
  code: z.string().min(1, "Write some code first"),
  language: z.enum(EXECUTABLE_LANGUAGES as [ExecutableLanguage, ...ExecutableLanguage[]]),
});

/** A draft may be empty — the student could have cleared the editor. */
export const classTestCodingDraftSchema = z.object({
  questionId: z.string().trim().min(1),
  code: z.string(),
  language: z.enum(EXECUTABLE_LANGUAGES as [ExecutableLanguage, ...ExecutableLanguage[]]),
});

export const gradeShortAnswerSchema = z.object({
  questionId: z.string().trim().min(1),
  awardedPoints: z.coerce.number().min(0),
  graderNote: z.string().trim().max(1000).nullable().default(null),
});

export type CreateClassTestInput = z.infer<typeof createClassTestSchema>;
export type UpdateClassTestInput = z.infer<typeof updateClassTestSchema>;
export type AudiencePreviewInput = z.infer<typeof audiencePreviewSchema>;
export type GradeShortAnswerInput = z.infer<typeof gradeShortAnswerSchema>;
