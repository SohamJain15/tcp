import type { Request, Response } from "express";
import { z } from "zod";
import type { ClassTestService } from "./classtest.service";
import {
  audiencePreviewSchema,
  classTestAnswerSchema,
  classTestCodingDraftSchema,
  classTestCodingRunSchema,
  classTestProctorEventSchema,
  classTestResultsSchema,
  createClassTestSchema,
  gradeShortAnswerSchema,
  updateClassTestSchema,
} from "./classtest.validator";

const routeIdSchema = z.string().regex(/^[a-z0-9_-]{4,80}$/i);

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function createClassTestController(classTestService: ClassTestService) {
  return {
    async listClassTests(req: Request, res: Response): Promise<void> {
      const items = await classTestService.listForFaculty(req.user!);
      res.json({ items });
    },

    async getClassTest(req: Request, res: Response): Promise<void> {
      const classTestId = routeIdSchema.parse(getRouteParam(req.params.classTestId));
      const test = await classTestService.getForFaculty(req.user!, classTestId);
      res.json({ classTest: test });
    },

    /**
     * Students matching the department/division/roll filter, for the tick-list faculty
     * finalise the assignment with. Read-only — assigning happens on create/update.
     */
    async previewAudience(req: Request, res: Response): Promise<void> {
      const filter = audiencePreviewSchema.parse(req.body);
      const students = await classTestService.previewAudience(req.user!, filter);
      res.json({ students });
    },

    async createClassTest(req: Request, res: Response): Promise<void> {
      const payload = createClassTestSchema.parse(req.body);
      const test = await classTestService.createClassTest(req.user!, payload);
      res.status(201).json({ classTest: test });
    },

    async updateClassTest(req: Request, res: Response): Promise<void> {
      const classTestId = routeIdSchema.parse(getRouteParam(req.params.classTestId));
      const payload = updateClassTestSchema.parse(req.body);
      const test = await classTestService.updateClassTest(req.user!, classTestId, payload);
      res.json({ classTest: test });
    },

    // --- student ------------------------------------------------------------

    async listAssigned(req: Request, res: Response): Promise<void> {
      const items = await classTestService.listAssigned(req.user!);
      res.json({ items });
    },

    async getForStudent(req: Request, res: Response): Promise<void> {
      const classTestId = routeIdSchema.parse(getRouteParam(req.params.classTestId));
      const classTest = await classTestService.getForStudent(req.user!, classTestId);
      res.json({ classTest });
    },

    async startAttempt(req: Request, res: Response): Promise<void> {
      const classTestId = routeIdSchema.parse(getRouteParam(req.params.classTestId));
      const classTest = await classTestService.startAttempt(req.user!, classTestId);
      res.status(201).json({ classTest });
    },

    async saveAnswer(req: Request, res: Response): Promise<void> {
      const classTestId = routeIdSchema.parse(getRouteParam(req.params.classTestId));
      const payload = classTestAnswerSchema.parse(req.body);
      await classTestService.saveAnswer(req.user!, classTestId, payload.questionId, payload.answer);
      res.json({ saved: true });
    },

    async submitAttempt(req: Request, res: Response): Promise<void> {
      const classTestId = routeIdSchema.parse(getRouteParam(req.params.classTestId));
      await classTestService.submitAttempt(req.user!, classTestId);
      res.json({ submitted: true });
    },

    async recordProctorEvent(req: Request, res: Response): Promise<void> {
      const classTestId = routeIdSchema.parse(getRouteParam(req.params.classTestId));
      const payload = classTestProctorEventSchema.parse(req.body);
      const result = await classTestService.recordProctorEvent(req.user!, classTestId, payload.type);
      res.json(result);
    },

    async getStudentResult(req: Request, res: Response): Promise<void> {
      const classTestId = routeIdSchema.parse(getRouteParam(req.params.classTestId));
      const result = await classTestService.getStudentResult(req.user!, classTestId);
      res.json({ result });
    },

    // --- coding -------------------------------------------------------------

    async runCodingQuestion(req: Request, res: Response): Promise<void> {
      const classTestId = routeIdSchema.parse(getRouteParam(req.params.classTestId));
      const payload = classTestCodingRunSchema.parse(req.body);
      const result = await classTestService.runCodingQuestion(req.user!, classTestId, payload);
      res.json({ result });
    },

    async submitCodingQuestion(req: Request, res: Response): Promise<void> {
      const classTestId = routeIdSchema.parse(getRouteParam(req.params.classTestId));
      const payload = classTestCodingRunSchema.parse(req.body);
      const receipt = await classTestService.submitCodingQuestion(req.user!, classTestId, payload);
      res.status(201).json(receipt);
    },

    async saveCodingDraft(req: Request, res: Response): Promise<void> {
      const classTestId = routeIdSchema.parse(getRouteParam(req.params.classTestId));
      const payload = classTestCodingDraftSchema.parse(req.body);
      await classTestService.saveCodingDraft(req.user!, classTestId, payload);
      res.json({ saved: true });
    },

    // --- grading ------------------------------------------------------------

    async listAttempts(req: Request, res: Response): Promise<void> {
      const classTestId = routeIdSchema.parse(getRouteParam(req.params.classTestId));
      const items = await classTestService.listAttemptsForFaculty(req.user!, classTestId);
      res.json({ items });
    },

    async getAttempt(req: Request, res: Response): Promise<void> {
      const classTestId = routeIdSchema.parse(getRouteParam(req.params.classTestId));
      const attemptId = routeIdSchema.parse(getRouteParam(req.params.attemptId));
      const attempt = await classTestService.getAttemptForGrading(req.user!, classTestId, attemptId);
      res.json({ attempt });
    },

    async gradeShortAnswer(req: Request, res: Response): Promise<void> {
      const classTestId = routeIdSchema.parse(getRouteParam(req.params.classTestId));
      const attemptId = routeIdSchema.parse(getRouteParam(req.params.attemptId));
      const payload = gradeShortAnswerSchema.parse(req.body);
      const attempt = await classTestService.gradeShortAnswer(req.user!, classTestId, attemptId, payload);
      res.json({ attempt });
    },

    async publishResults(req: Request, res: Response): Promise<void> {
      const classTestId = routeIdSchema.parse(getRouteParam(req.params.classTestId));
      const payload = classTestResultsSchema.parse(req.body);
      const test = await classTestService.publishResults(req.user!, classTestId, payload.resultsPublished);
      res.json({ classTest: test });
    },
  };
}
