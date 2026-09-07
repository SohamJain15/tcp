import { z } from "zod";
import { validateSchemaSql } from "../../execution/sql/sql-policy";
import { createLabSchema } from "../lab/lab.validator";
import {
  DEPARTMENTS,
  EXECUTABLE_LANGUAGES,
} from "../../shared/constants/domain";

export const scheduleSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(150),
  startAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(1).max(240),
  experimentIds: z.array(z.string().min(1)).min(1).max(200),
  language: z.enum(["sql", ...EXECUTABLE_LANGUAGES]),
});
export const classroomSchema = createLabSchema
  .extend({
    requestKey: z.string().uuid(),
    batch: z.string().trim().min(1).max(80),
    department: z.enum(DEPARTMENTS),
    semester: z.number().int().min(1).max(8),
    selectedStudentEmails: z
      .array(z.string().trim().toLowerCase().email())
      .min(1, "Select at least one student for this batch")
      .max(500)
      .transform((emails) => [...new Set(emails)])
      .nullable()
      .optional(),
    lifecycleState: z
      .enum(["Draft", "Published", "Archived"])
      .default("Published"),
    experiments: createLabSchema.shape.experiments.max(200),
    sessions: z.array(scheduleSchema).max(100).default([]),
  })
  .superRefine((room, context) => {
    room.experiments.forEach((experiment, index) => {
      if (experiment.kind !== (room.kind === "DBMS" ? "sql" : "coding")) {
        context.addIssue({
          code: "custom",
          path: ["experiments", index, "kind"],
          message: "Experiment type must match the classroom kind",
        });
        return;
      }
      if (experiment.kind !== "sql") {
        return;
      }
      // Seed SQL runs with schema-owner privileges inside the student's throwaway database. A dump
      // that opens with `CREATE DATABASE x; USE x;` seeds its tables somewhere the student cannot
      // reach, and every query then fails with "table doesn't exist" — a failure that is impossible
      // to diagnose from the student's side, so it has to be caught here, when the lab is saved.
      const seed = validateSchemaSql(experiment.schemaSql, 100_000);
      if (!seed.ok) {
        context.addIssue({
          code: "custom",
          path: ["experiments", index, "schemaSql"],
          message: seed.error ?? "Seed SQL is not valid",
        });
      }
    });
  });
export const workSchema = z
  .object({
    requestKey: z.string().uuid(),
    experimentId: z.string().min(1),
    mode: z.enum(["official", "practice"]),
    action: z.enum(["run", "submit", "draft"]),
    code: z.string().max(100_000),
    language: z.enum(["sql", ...EXECUTABLE_LANGUAGES]),
  })
  .refine((value) => value.action === "draft" || value.code.trim().length > 0, {
    message: "Write code before running or submitting",
  });
export const gradeSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  experimentId: z.string().min(1),
  mark: z.number().finite().min(0).max(100).nullable(),
});
export type ClassroomInput = z.infer<typeof classroomSchema>;
export type ScheduleInput = z.infer<typeof scheduleSchema>;
export type WorkInput = z.infer<typeof workSchema>;
