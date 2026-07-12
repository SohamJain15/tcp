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

// TCET UID format: admission_year-branch+div+rollno-passout_year, e.g. 24-COMPA35-28
const UID_REGEX = /^\d{2}-[A-Z]{2,8}[A-Z]\d{1,3}-\d{2}$/;
const UID_PARSE_REGEX = /^(\d{2})-([A-Z]+?)([A-Z])(\d{1,3})-(\d{2})$/;

function deriveRollNumberFromUid(uid: string): string {
  const match = UID_PARSE_REGEX.exec(uid);
  return match ? String(Number(match[4])) : "";
}

const studentProfileSchema = baseProfileSchema
  .extend({
    uid: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .refine((value) => value.length > 0, "UID is required")
      .refine((value) => !value.toLowerCase().includes("mock"), "Enter your real UID")
      .refine((value) => UID_REGEX.test(value), "Invalid UID format. Expected e.g. 24-AIDSA51-28"),
    rollNumber: z.string().trim().optional(),
    semester: z.coerce.number().int().min(1).max(8),
  })
  .transform((value) => ({
    ...value,
    // Roll number is always derived from the validated UID; client value is ignored.
    rollNumber: deriveRollNumberFromUid(value.uid),
  }));

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
