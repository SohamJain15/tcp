import type { Request, Response } from "express";
import { normalizeDepartment } from "../../shared/utils/normalize";
import type { ContestService } from "./contest.service";
import {
  contestAnswerSchema,
  contestCodingRunSchema,
  contestCodingSubmissionSchema,
  contestProctoringEventSchema,
  contestResultsSchema,
  createContestSchema,
  updateContestSchema,
} from "./contest.validator";

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function createContestController(contestService: ContestService) {
  return {
    async listContests(req: Request, res: Response): Promise<void> {
      const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;
      const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
      const contests = await contestService.listContests(req.user!, {
        pageSize,
        cursor,
        department: normalizeDepartment(req.query.department) ?? undefined,
      });
      res.json(contests);
    },

    async getContestById(req: Request, res: Response): Promise<void> {
      const contest = await contestService.getContestById(req.user!, getRouteParam(req.params.contestId));
      res.json({ contest });
    },

    async createContest(req: Request, res: Response): Promise<void> {
      const payload = createContestSchema.parse(req.body);
      const contest = await contestService.createContest(req.user!, payload);
      res.status(201).json({ contest });
    },

    async updateContest(req: Request, res: Response): Promise<void> {
      const payload = updateContestSchema.parse(req.body);
      const contest = await contestService.updateContest(
        req.user!,
        getRouteParam(req.params.contestId),
        payload,
      );
      res.json({ contest });
    },

    async updateContestResults(req: Request, res: Response): Promise<void> {
      const payload = contestResultsSchema.parse(req.body);
      const contest = await contestService.updateContestResults(
        req.user!,
        getRouteParam(req.params.contestId),
        payload,
      );
      res.json({ contest });
    },

    async startAttempt(req: Request, res: Response): Promise<void> {
      const attempt = await contestService.startAttempt(req.user!, getRouteParam(req.params.contestId));
      res.status(201).json({ attempt });
    },

    async submitAttempt(req: Request, res: Response): Promise<void> {
      const attempt = await contestService.submitAttempt(req.user!, getRouteParam(req.params.contestId));
      res.json({ attempt });
    },

    async recordProctorEvent(req: Request, res: Response): Promise<void> {
      const payload = contestProctoringEventSchema.parse(req.body);
      const attempt = await contestService.recordProctorEvent(
        req.user!,
        getRouteParam(req.params.contestId),
        payload.type,
        payload.details,
      );
      res.json({ attempt });
    },

    async answerObjectiveQuestion(req: Request, res: Response): Promise<void> {
      const payload = contestAnswerSchema.parse(req.body);
      const attempt = await contestService.answerObjectiveQuestion(
        req.user!,
        getRouteParam(req.params.contestId),
        payload,
      );
      res.json({ attempt });
    },

    async getQuestionById(req: Request, res: Response): Promise<void> {
      const payload = await contestService.getQuestionById(
        req.user!,
        getRouteParam(req.params.contestId),
        getRouteParam(req.params.questionId),
      );
      res.json(payload);
    },

    async runCodingQuestion(req: Request, res: Response): Promise<void> {
      const payload = contestCodingRunSchema.parse(req.body);
      const result = await contestService.runCodingQuestion(
        req.user!,
        getRouteParam(req.params.contestId),
        payload,
      );
      res.json({ result });
    },

    async submitCodingQuestion(req: Request, res: Response): Promise<void> {
      const payload = contestCodingSubmissionSchema.parse(req.body);
      const result = await contestService.submitCodingQuestion(
        req.user!,
        getRouteParam(req.params.contestId),
        payload,
      );
      res.status(201).json(result);
    },

    async getStandings(req: Request, res: Response): Promise<void> {
      const standings = await contestService.getStandings(req.user!, getRouteParam(req.params.contestId));
      res.json({ items: standings });
    },

    async exportStandingsCsv(req: Request, res: Response): Promise<void> {
      const csv = await contestService.exportStandingsCsv(req.user!, getRouteParam(req.params.contestId));
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=\"contest-${getRouteParam(req.params.contestId)}-standings.csv\"`,
      );
      res.send(csv);
    },

    async listAttempts(req: Request, res: Response): Promise<void> {
      const attempts = await contestService.listAttempts(req.user!, getRouteParam(req.params.contestId));
      res.json({ items: attempts });
    },

    async getAttemptReview(req: Request, res: Response): Promise<void> {
      const review = await contestService.getAttemptReview(
        req.user!,
        getRouteParam(req.params.contestId),
        getRouteParam(req.params.attemptId),
      );
      res.json({ review });
    },
  };
}
