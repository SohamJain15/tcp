import { z } from "zod";

import { audiencePreviewSchema } from "../classtest/classtest.validator";

const gatesSchema = z.object({
  requireAdmission: z.boolean().default(true),
  requireNetworkMatch: z.boolean().default(false),
  requireJoinCode: z.boolean().default(false),
});

export const openAttendanceSessionSchema = z.object({
  labId: z.string().trim().min(1),
  batchLabel: z.string().trim().max(40).nullable().default(null),
  audience: audiencePreviewSchema,
  /** Empty means "everyone the filter found" — the common case of admitting a whole batch. */
  assignedEmails: z.array(z.string().trim().toLowerCase().email()).default([]),
  gates: gatesSchema.default({ requireAdmission: true, requireNetworkMatch: false, requireJoinCode: false }),
  /** The hard stop, so a forgotten session cannot gate the lab overnight. */
  durationMinutes: z.coerce.number().int().min(15).max(480).default(180),
});

export const updateAttendanceSessionSchema = z
  .object({
    gates: gatesSchema.partial().optional(),
    /** For a teacher who opened the session in their office and then walked to the lab. */
    recaptureHostIp: z.boolean().optional(),
    state: z.literal("CLOSED").optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });

export const admissionDecisionSchema = z.object({
  status: z.enum(["ADMITTED", "DENIED", "REVOKED"]),
  reason: z.string().trim().max(200).nullable().default(null),
});

export const bulkAdmissionSchema = z.object({
  admissionIds: z.array(z.string().trim().min(1)).min(1).max(200),
  status: z.enum(["ADMITTED", "DENIED"]),
});

export const joinRequestSchema = z.object({
  joinCode: z.string().trim().regex(/^\d{6}$/, "Enter the six-digit code from your teacher's screen").optional(),
});

export type OpenAttendanceSessionInput = z.infer<typeof openAttendanceSessionSchema>;
export type UpdateAttendanceSessionInput = z.infer<typeof updateAttendanceSessionSchema>;
export type AdmissionDecisionInput = z.infer<typeof admissionDecisionSchema>;
export type BulkAdmissionInput = z.infer<typeof bulkAdmissionSchema>;
export type JoinRequestInput = z.infer<typeof joinRequestSchema>;
