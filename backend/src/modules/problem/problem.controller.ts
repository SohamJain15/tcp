import type { Request, Response } from "express";
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

export function createProblemController(problemService: ProblemService) {
  return {
    async listStudentProblems(req: Request, res: Response): Promise<void> {
      const query = studentProblemQuerySchema.parse(req.query);
      const problems = await problemService.listStudentProblems(req.user!, query);
      res.json(problems);
    },

    async getStudentProblemDetail(req: Request, res: Response): Promise<void> {
      const problem = await problemService.getStudentProblemDetail(req.user!, String(req.params.problemId));
      res.json({ problem });
    },

    async listManageProblems(req: Request, res: Response): Promise<void> {
      const query = manageProblemQuerySchema.parse(req.query);
      const problems = await problemService.listManageProblems(req.user!, query);
      res.json(problems);
    },

    async getManageProblemDetail(req: Request, res: Response): Promise<void> {
      const problem = await problemService.getManageProblemDetail(req.user!, String(req.params.problemId));
      res.json({ problem });
    },

    async createProblem(req: Request, res: Response): Promise<void> {
      const payload = toCanonicalProblemPayload(createProblemSchema.parse(req.body));
      const problem = await problemService.createProblem(req.user!, payload);
      res.status(201).json({ problem });
    },

    async updateProblem(req: Request, res: Response): Promise<void> {
      const payload = toCanonicalProblemUpdatePayload(updateProblemSchema.parse(req.body));
      const problem = await problemService.updateProblem(req.user!, String(req.params.problemId), payload);
      res.json({ problem });
    },

    async updateProblemState(req: Request, res: Response): Promise<void> {
      const payload = problemStateSchema.parse(req.body);
      const problem = await problemService.updateProblemState(req.user!, String(req.params.problemId), payload.lifecycleState);
      res.json({ problem });
    },
  };
}
