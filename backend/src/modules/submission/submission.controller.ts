import type { Request, Response } from "express";
import type { SubmissionService } from "./submission.service";
import { submissionQuerySchema, submissionRequestSchema } from "./submission.validator";

export function createSubmissionController(submissionService: SubmissionService) {
  return {
    async runSubmission(req: Request, res: Response): Promise<void> {
      const payload = submissionRequestSchema.parse(req.body);
      const result = await submissionService.runSubmission(req.user!, payload);
      res.json({ result });
    },

    async createSubmission(req: Request, res: Response): Promise<void> {
      const payload = submissionRequestSchema.parse(req.body);
      const submission = await submissionService.createSubmission(req.user!, payload);
      res.status(202).json(submission);
    },

    async listSubmissions(req: Request, res: Response): Promise<void> {
      const query = submissionQuerySchema.parse(req.query);
      const submissions = await submissionService.listSubmissions(req.user!, query);
      res.json(submissions);
    },

    async getSubmissionById(req: Request, res: Response): Promise<void> {
      const submission = await submissionService.getSubmissionById(req.user!, String(req.params.submissionId));
      res.json({ submission });
    },
  };
}
