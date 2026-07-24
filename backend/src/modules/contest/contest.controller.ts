import type { Request, Response } from "express";
import { z } from "zod";
import { normalizeDepartment } from "../../shared/utils/normalize";
import { normalizeNumber } from "../../shared/utils/normalize";
import type { ContestService } from "./contest.service";
import {
  contestAnswerSchema,
  contestCodingDraftSchema,
  contestCodingRunSchema,
  contestCodingSubmissionSchema,
  contestProctoringEventSchema,
  contestResultsSchema,
  createContestSchema,
  updateContestSchema,
} from "./contest.validator";

const routeIdSchema = z.string().regex(/^[a-z0-9_-]{4,64}$/i);

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
      const contestId = routeIdSchema.parse(getRouteParam(req.params.contestId));
      const contest = await contestService.getContestById(req.user!, contestId);
      res.json({ contest });
    },

    async createContest(req: Request, res: Response): Promise<void> {
      const payload = createContestSchema.parse(req.body);
      const contest = await contestService.createContest(req.user!, payload);
      res.status(201).json({ contest });
    },

    async updateContest(req: Request, res: Response): Promise<void> {
      const payload = updateContestSchema.parse(req.body);
      const contestId = routeIdSchema.parse(getRouteParam(req.params.contestId));
      const contest = await contestService.updateContest(
        req.user!,
        contestId,
        payload,
      );
      res.json({ contest });
    },

    async updateContestResults(req: Request, res: Response): Promise<void> {
      const payload = contestResultsSchema.parse(req.body);
      const contestId = routeIdSchema.parse(getRouteParam(req.params.contestId));
      const contest = await contestService.updateContestResults(
        req.user!,
        contestId,
        payload,
      );
      res.json({ contest });
    },

    async registerForContest(req: Request, res: Response): Promise<void> {
      const contestId = routeIdSchema.parse(getRouteParam(req.params.contestId));
      const registration = await contestService.registerForContest(req.user!, contestId);
      res.status(201).json({ registration });
    },

    async unregisterFromContest(req: Request, res: Response): Promise<void> {
      const contestId = routeIdSchema.parse(getRouteParam(req.params.contestId));
      await contestService.unregisterFromContest(req.user!, contestId);
      res.status(204).send();
    },

    async listRegistrations(req: Request, res: Response): Promise<void> {
      const contestId = routeIdSchema.parse(getRouteParam(req.params.contestId));
      const registrations = await contestService.listRegistrations(req.user!, contestId);
      res.json({ items: registrations });
    },

    async exportRegistrationsCsv(req: Request, res: Response): Promise<void> {
      const contestId = routeIdSchema.parse(getRouteParam(req.params.contestId));
      const csv = await contestService.exportRegistrationsCsv(req.user!, contestId);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=\"contest-${contestId}-registrations.csv\"`,
      );
      res.send(csv);
    },

    async startAttempt(req: Request, res: Response): Promise<void> {
      const contestId = routeIdSchema.parse(getRouteParam(req.params.contestId));
      const attempt = await contestService.startAttempt(req.user!, contestId);
      res.status(201).json({ attempt });
    },

    async submitAttempt(req: Request, res: Response): Promise<void> {
      const contestId = routeIdSchema.parse(getRouteParam(req.params.contestId));
      const attempt = await contestService.submitAttempt(req.user!, contestId);
      res.json({ attempt });
    },

    async recordProctorEvent(req: Request, res: Response): Promise<void> {
      const payload = contestProctoringEventSchema.parse(req.body);
      const attempt = await contestService.recordProctorEvent(
        req.user!,
        routeIdSchema.parse(getRouteParam(req.params.contestId)),
        payload.type,
        payload.details,
      );
      res.json({ attempt });
    },

    async answerObjectiveQuestion(req: Request, res: Response): Promise<void> {
      const payload = contestAnswerSchema.parse(req.body);
      const attempt = await contestService.answerObjectiveQuestion(
        req.user!,
        routeIdSchema.parse(getRouteParam(req.params.contestId)),
        payload,
      );
      res.json({ attempt });
    },

    async getQuestionById(req: Request, res: Response): Promise<void> {
      const payload = await contestService.getQuestionById(
        req.user!,
        routeIdSchema.parse(getRouteParam(req.params.contestId)),
        routeIdSchema.parse(getRouteParam(req.params.questionId)),
      );
      res.json(payload);
    },

    async runCodingQuestion(req: Request, res: Response): Promise<void> {
      const payload = contestCodingRunSchema.parse(req.body);
      const result = await contestService.runCodingQuestion(
        req.user!,
        routeIdSchema.parse(getRouteParam(req.params.contestId)),
        payload,
      );
      res.json({ result });
    },

    async submitCodingQuestion(req: Request, res: Response): Promise<void> {
      const payload = contestCodingSubmissionSchema.parse(req.body);
      const result = await contestService.submitCodingQuestion(
        req.user!,
        routeIdSchema.parse(getRouteParam(req.params.contestId)),
        payload,
      );
      res.status(201).json(result);
    },

    async saveCodingDraft(req: Request, res: Response): Promise<void> {
      const payload = contestCodingDraftSchema.parse(req.body);
      const attempt = await contestService.saveCodingDraft(
        req.user!,
        routeIdSchema.parse(getRouteParam(req.params.contestId)),
        payload,
      );
      res.json({ attempt });
    },

    async getStandings(req: Request, res: Response): Promise<void> {
      const contestId = routeIdSchema.parse(getRouteParam(req.params.contestId));
      const year = normalizeNumber(req.query.year, 0);
      const standings = await contestService.getStandings(req.user!, contestId, {
        department: normalizeDepartment(req.query.department) ?? undefined,
        year: year >= 1 && year <= 4 ? (year as 1 | 2 | 3 | 4) : undefined,
      });
      res.json({ items: standings });
    },

    async exportStandingsCsv(req: Request, res: Response): Promise<void> {
      const contestId = routeIdSchema.parse(getRouteParam(req.params.contestId));
      const year = normalizeNumber(req.query.year, 0);
      const csv = await contestService.exportStandingsCsv(req.user!, contestId, {
        department: normalizeDepartment(req.query.department) ?? undefined,
        year: year >= 1 && year <= 4 ? (year as 1 | 2 | 3 | 4) : undefined,
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=\"contest-${contestId}-standings.csv\"`,
      );
      res.send(csv);
    },

    async listAttempts(req: Request, res: Response): Promise<void> {
      const contestId = routeIdSchema.parse(getRouteParam(req.params.contestId));
      const attempts = await contestService.listAttempts(req.user!, contestId);
      res.json({ items: attempts });
    },

    async getAttemptReview(req: Request, res: Response): Promise<void> {
      const contestId = routeIdSchema.parse(getRouteParam(req.params.contestId));
      const attemptId = routeIdSchema.parse(getRouteParam(req.params.attemptId));
      const review = await contestService.getAttemptReview(
        req.user!,
        contestId,
        attemptId,
      );
      res.json({ review });
    },
  };
}
