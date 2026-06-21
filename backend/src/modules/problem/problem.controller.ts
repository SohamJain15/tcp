import type { Request, Response } from "express";
import { z } from "zod";
import type { ProblemService } from "./problem.service";
import {
  createProblemSchema,
  manageProblemQuerySchema,
  problemStateSchema,
  studentProblemQuerySchema,
  toCanonicalProblemPayload,
  toCanonicalProblemUpdatePayload,
  updateProblemSchema,
} from "./problem.validator";

const routeIdSchema = z.string().regex(/^[a-z0-9_-]{4,64}$/i);

export function createProblemController(problemService: ProblemService) {
  return {
    async listStudentProblems(req: Request, res: Response): Promise<void> {
      const query = studentProblemQuerySchema.parse(req.query);
      const problems = await problemService.listStudentProblems(req.user!, query);
      res.json(problems);
    },

    async getStudentProblemDetail(req: Request, res: Response): Promise<void> {
      const problem = routeIdSchema.parse(req.params.problemId);
      const problemDetail = await problemService.getStudentProblemDetail(req.user!, problem);
      res.json({ problem: problemDetail });
    },

    async listManageProblems(req: Request, res: Response): Promise<void> {
      const query = manageProblemQuerySchema.parse(req.query);
      const problems = await problemService.listManageProblems(req.user!, query);
      res.json(problems);
    },

    async getManageProblemDetail(req: Request, res: Response): Promise<void> {
      const problem = routeIdSchema.parse(req.params.problemId);
      const problemDetail = await problemService.getManageProblemDetail(req.user!, problem);
      res.json({ problem: problemDetail });
    },

    async createProblem(req: Request, res: Response): Promise<void> {
      const payload = toCanonicalProblemPayload(createProblemSchema.parse(req.body));
      const problem = await problemService.createProblem(req.user!, payload);
      res.status(201).json({ problem });
    },

    async updateProblem(req: Request, res: Response): Promise<void> {
      const payload = toCanonicalProblemUpdatePayload(updateProblemSchema.parse(req.body));
      const problemId = routeIdSchema.parse(req.params.problemId);
      const problem = await problemService.updateProblem(req.user!, problemId, payload);
      res.json({ problem });
    },

    async updateProblemState(req: Request, res: Response): Promise<void> {
      const payload = problemStateSchema.parse(req.body);
      const problemId = routeIdSchema.parse(req.params.problemId);
      const problem = await problemService.updateProblemState(req.user!, problemId, payload.lifecycleState);
      res.json({ problem });
    },
  };
}
