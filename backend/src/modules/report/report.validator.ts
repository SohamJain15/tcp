import { z } from "zod";

export const generateReportSchema = z.object({
  /** Regenerate over an already-READY report. Without this, an existing report is returned as-is. */
  force: z.boolean().optional().default(false),
});

export type GenerateReportInput = z.infer<typeof generateReportSchema>;
