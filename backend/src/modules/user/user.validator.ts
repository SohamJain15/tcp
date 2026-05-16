import { z } from "zod";
import { DEPARTMENTS } from "../../shared/constants/domain";
import type { UserRole } from "../../shared/types/auth";
import type { Department } from "../../shared/types/domain";

const optionalUrlSchema = z
  .union([z.string(), z.null()])
  .transform((value) => (typeof value === "string" ? value.trim() : value))
  .optional()
  .refine((value) => !value || /^https?:\/\/.+/i.test(value), "Must be a valid URL")
  .transform((value) => (value && value.length > 0 ? value : null));

const baseProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  department: z.enum(DEPARTMENTS),
  linkedInUrl: optionalUrlSchema,
  githubUrl: optionalUrlSchema,
});

const studentProfileSchema = baseProfileSchema.extend({
  uid: z
    .string()
    .trim()
    .min(1, "UID is required")
    .refine((value) => !value.toLowerCase().includes("mock"), "Enter your real UID"),
  rollNumber: z.string().trim().min(1, "Roll number is required"),
  semester: z.coerce.number().int().min(1).max(8),
});

const facultyProfileSchema = baseProfileSchema.extend({
  designation: z.string().trim().min(1, "Designation is required"),
});

export function parseUpdateProfilePayload(
  role: UserRole,
  payload: unknown,
): {
  name: string;
  department: Department;
  linkedInUrl: string | null;
  githubUrl: string | null;
  uid?: string;
  rollNumber?: string;
  semester?: number;
  designation?: string;
} {
  return role === "FACULTY"
    ? facultyProfileSchema.parse(payload)
    : studentProfileSchema.parse(payload);
}
