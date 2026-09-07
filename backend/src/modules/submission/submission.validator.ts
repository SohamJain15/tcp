import { z } from "zod";
import { DEPARTMENTS, SUPPORTED_LANGUAGES } from "../../shared/constants/domain";
import type { Department, ExecutableLanguage, SupportedLanguage } from "../../shared/types/domain";
import {
  isExecutableLanguage,
  normalizeDepartment,
  normalizeSubmissionStatus,
  tryNormalizeSupportedLanguage,
} from "../../shared/utils/normalize";

const departmentSchema = z.enum(DEPARTMENTS);

const supportedLanguageSchema = z
  .string()
  .min(1)
  .transform((value, ctx) => {
    const normalized = tryNormalizeSupportedLanguage(value);
    if (!normalized || !SUPPORTED_LANGUAGES.includes(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unsupported language",
      });
      return z.NEVER;
    }

    return normalized;
  });

const executableLanguageSchema = supportedLanguageSchema.refine(
  (value) => isExecutableLanguage(value),
  "Language is editor-only right now and cannot be executed by the backend",
).transform((value) => value as ExecutableLanguage);

/**
 * "sql" is accepted here but is not an `ExecutableLanguage` — it never reaches Judge0. The service
 * rejects it on a coding problem and requires it on a SQL one, so the pairing is checked where the
 * problem is actually known.
 */
const submissionLanguageSchema = z.union([
  z.literal("sql"),
  executableLanguageSchema,
]);

export const submissionRequestSchema = z.object({
  problemId: z.string().min(1),
  code: z.string().trim().min(1, "Code cannot be empty"),
  language: submissionLanguageSchema,
});

export const submissionQuerySchema = z.object({
  problemId: z.string().optional(),
  contestId: z.string().optional(),
  sourceType: z.enum(["problem", "contest_coding", "classtest_coding"]).optional(),
  userEmail: z.string().email().optional(),
  studentDepartment: z
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
  status: z
    .string()
    .optional()
    .transform((value) => (value ? normalizeSubmissionStatus(value) : undefined)),
  language: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value) {
        return undefined;
      }

      const normalized = tryNormalizeSupportedLanguage(value);
      if (!normalized || !SUPPORTED_LANGUAGES.includes(normalized)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Unsupported language",
        });
        return z.NEVER;
      }

      return normalized;
    }),
  cursor: z.string().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
});
