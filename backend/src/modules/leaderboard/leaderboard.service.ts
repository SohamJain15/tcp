import { toCsv } from "../../shared/utils/csv";
import { paginateArray, type PaginationInput, type PaginatedResult } from "../../shared/utils/pagination";
import { normalizeDepartment } from "../../shared/utils/normalize";
import type { Department } from "../../shared/types/domain";
import { deriveStudentYearFromSemester, matchesStudentYearSemester, type StudentYear } from "../../shared/utils/student-year";
import {
  buildLeaderboardRanker,
  type LeaderboardEntry,
  isRankedLeaderboardEntry,
  toLeaderboardListItem,
  type LeaderboardListItem,
} from "./leaderboard.model";
import type { LeaderboardRepository } from "./leaderboard.repository";
import type { UserRepository } from "../user/user.repository";

export interface LeaderboardListResult extends PaginatedResult<LeaderboardListItem> {
  /**
   * The caller's own row, whatever their rank.
   *
   * Only the first page is sent to the client, so a student ranked #255 would otherwise be absent
   * from the payload entirely and the table would have nothing to pin. The full sorted list is
   * already built here to assign ranks, so finding them costs nothing. `null` when the caller is not
   * on the board at all (faculty, admins, or a student filtered out by the current department/year
   * selection).
   */
  currentUserEntry: LeaderboardListItem | null;
}

export interface LeaderboardService {
  listLeaderboard(
    pagination: PaginationInput & {
      department?: Department;
      year?: StudentYear;
      currentUserEmail?: string;
    },
  ): Promise<LeaderboardListResult>;
  exportLeaderboardCsv(filters?: { department?: Department; year?: StudentYear }): Promise<string>;
}

interface LeaderboardServiceDependencies {
  leaderboardRepository: LeaderboardRepository;
  userRepository: UserRepository;
}

async function enrichLeaderboardEntries(
  dependencies: LeaderboardServiceDependencies,
): Promise<LeaderboardEntry[]> {
  const entries = await dependencies.leaderboardRepository.list();

  return Promise.all(
    entries.map(async (entry) => {
      const user = await dependencies.userRepository.getByEmail(entry.email);
      const semester = user?.semester ?? entry.semester;
      return {
        ...entry,
        semester,
        year: deriveStudentYearFromSemester(semester),
        department: normalizeDepartment(user?.department ?? entry.department) ?? entry.department,
      };
    }),
  );
}

export function createLeaderboardService(dependencies: LeaderboardServiceDependencies): LeaderboardService {
  return {
    async listLeaderboard(pagination) {
      // Ranked within the applied filters, so the percentile compares like with like.
      const ranked = (await enrichLeaderboardEntries(dependencies))
        .filter(isRankedLeaderboardEntry)
        .filter((entry) => (pagination.department ? entry.department === pagination.department : true))
        .filter((entry) => matchesStudentYearSemester(entry.semester, pagination.year));
      const ranker = buildLeaderboardRanker(ranked);
      const sortedEntries = ranked
        .sort(ranker.compare)
        .map((entry, index) => toLeaderboardListItem(entry, index + 1, ranker.optimizationScoreFor(entry)));

      const page = paginateArray(sortedEntries, pagination);
      const currentUserEmail = pagination.currentUserEmail?.toLowerCase();

      return {
        ...page,
        currentUserEntry: currentUserEmail
          ? sortedEntries.find((entry) => entry.email.toLowerCase() === currentUserEmail) ?? null
          : null,
      };
    },

    async exportLeaderboardCsv(filters = {}) {
      // Same ranker as the on-screen board, so the exported order is identical.
      const ranked = (await enrichLeaderboardEntries(dependencies))
        .filter(isRankedLeaderboardEntry)
        .filter((entry) => (filters.department ? entry.department === filters.department : true))
        .filter((entry) => matchesStudentYearSemester(entry.semester, filters.year));
      const ranker = buildLeaderboardRanker(ranked);
      const rows = ranked
        .sort(ranker.compare)
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
          optimizationScore: ranker.optimizationScoreFor(entry) ?? "",
          avgAcceptedRuntimeMs: entry.avgAcceptedRuntimeMs,
        }));

      return toCsv(rows);
    },
  };
}
