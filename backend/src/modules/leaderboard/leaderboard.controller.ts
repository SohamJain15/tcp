import type { Request, Response } from "express";
import type { LeaderboardService } from "./leaderboard.service";
import { normalizeDepartment } from "../../shared/utils/normalize";
import { normalizeNumber } from "../../shared/utils/normalize";

export function createLeaderboardController(leaderboardService: LeaderboardService) {
  return {
    async listLeaderboard(req: Request, res: Response): Promise<void> {
      const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;
      const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
      const year = normalizeNumber(req.query.year, 0);
      const leaderboard = await leaderboardService.listLeaderboard({
        pageSize,
        cursor,
        department: normalizeDepartment(req.query.department) ?? undefined,
        year: year >= 1 && year <= 4 ? (year as 1 | 2 | 3 | 4) : undefined,
      });
      res.json(leaderboard);
    },

    async exportLeaderboard(req: Request, res: Response): Promise<void> {
      const year = normalizeNumber(req.query.year, 0);
      const csv = await leaderboardService.exportLeaderboardCsv({
        department: normalizeDepartment(req.query.department) ?? undefined,
        year: year >= 1 && year <= 4 ? (year as 1 | 2 | 3 | 4) : undefined,
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="leaderboard.csv"');
      res.send(csv);
    },
  };
}
