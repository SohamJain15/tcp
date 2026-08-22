import { z } from "zod";

import { audiencePreviewSchema } from "../classtest/classtest.validator";

/**
 * Lab Session payloads. The audience and proctor-event shapes are reused verbatim from the
 * class-test validator so the two assessment surfaces stay identical where they overlap.
 */

const bodySchema = z.object({
  /** The source lab whose experiments are snapshotted onto the session. */
  labId: z.string().trim().min(1),
  title: z.string().trim().min(3).max(150).optional(),
  /** Which experiments of the lab to include, in the order given. */
  experimentIds: z.array(z.string().trim().min(1)).min(1, "Pick at least one experiment"),
  startAt: z.string().datetime({ offset: true }),
  durationMinutes: z.coerce.number().int().min(1).max(240),
  audience: audiencePreviewSchema,
  assignedEmails: z.array(z.string().trim().toLowerCase().email()).default([]),
  maxViolations: z.coerce.number().int().min(1).max(100).default(1),
  lifecycleState: z.enum(["Draft", "Published", "Archived"]).default("Published"),
});

export const createLabSessionSchema = bodySchema;
export const updateLabSessionSchema = bodySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });

export const labSessionResultsSchema = z.object({ resultsPublished: z.boolean() });

export type CreateLabSessionInput = z.infer<typeof createLabSessionSchema>;
export type UpdateLabSessionInput = z.infer<typeof updateLabSessionSchema>;
