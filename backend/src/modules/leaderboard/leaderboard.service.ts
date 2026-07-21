import { toCsv } from "../../shared/utils/csv";
import { paginateArray, type PaginationInput, type PaginatedResult } from "../../shared/utils/pagination";
import type { Department } from "../../shared/types/domain";
import { matchesStudentYearSemester, type StudentYear } from "../../shared/utils/student-year";
import {
  compareLeaderboardEntries,
  isRankedLeaderboardEntry,
  toLeaderboardListItem,
  type LeaderboardListItem,
} from "./leaderboard.model";
import type { LeaderboardRepository } from "./leaderboard.repository";

export interface LeaderboardService {
  listLeaderboard(
    pagination: PaginationInput & { department?: Department; year?: StudentYear },
  ): Promise<PaginatedResult<LeaderboardListItem>>;
  exportLeaderboardCsv(filters?: { department?: Department; year?: StudentYear }): Promise<string>;
}

interface LeaderboardServiceDependencies {
  leaderboardRepository: LeaderboardRepository;
}

export function createLeaderboardService(dependencies: LeaderboardServiceDependencies): LeaderboardService {
  return {
    async listLeaderboard(pagination) {
      const sortedEntries = (await dependencies.leaderboardRepository.list())
        .filter(isRankedLeaderboardEntry)
        .filter((entry) => (pagination.department ? entry.department === pagination.department : true))
        .filter((entry) => matchesStudentYearSemester(entry.semester, pagination.year))
        .sort(compareLeaderboardEntries)
        .map((entry, index) => toLeaderboardListItem(entry, index + 1));

      return paginateArray(sortedEntries, pagination);
    },

    async exportLeaderboardCsv(filters = {}) {
      const rows = (await dependencies.leaderboardRepository.list())
        .filter(isRankedLeaderboardEntry)
        .filter((entry) => (filters.department ? entry.department === filters.department : true))
        .filter((entry) => matchesStudentYearSemester(entry.semester, filters.year))
        .sort(compareLeaderboardEntries)
        .map((entry, index) => ({
          rank: index + 1,
          email: entry.email,
          name: entry.name ?? "",
          department: entry.department ?? "",
          role: entry.role,
          rating: entry.rating,
          score: entry.rating,
          problemsSolved: entry.problemsSolved,
          submissionCount: entry.submissionCount,
          acceptedSubmissionCount: entry.acceptedSubmissionCount,
          accuracy: entry.accuracy,
        }));

      return toCsv(rows);
    },
  };
}
