import { AppError } from "../../shared/errors/app-error";
import type { Department } from "../../shared/types/domain";
import {
  ACTIVITY_LEVEL_BANDS,
  addDays,
  classifyActivityLevel,
  computeConsistency,
  countDaysBetween,
  enumerateDateKeys,
  estimateActiveMinutes,
  toDateKey,
  type ActivityLevel,
} from "../../shared/utils/activity";
import { paginateArray, type PaginatedResult, type PaginationInput } from "../../shared/utils/pagination";
import {
  deriveStudentYearFromSemester,
  formatStudentYearLabel,
  matchesStudentYearSemester,
  type StudentYear,
} from "../../shared/utils/student-year";
import { computeContestStatus, type ContestRecord } from "../contest/contest.model";
import type {
  ContestAttemptRepository,
  ContestRegistrationRepository,
  ContestRepository,
} from "../contest/contest.repository";
import type { SubmissionAnalyticsRecord, SubmissionRepository } from "../submission/submission.repository";
import type { UserRecord } from "../user/user.model";
import type { UserRepository } from "../user/user.repository";
import { buildAnalyticsFromSubmissions } from "../user/user.service";
import type {
  DepartmentActivityLevelBucket,
  DepartmentActivityPoint,
  DepartmentContestParticipation,
  DepartmentFacultyItem,
  DepartmentOverviewResponse,
  DepartmentStudentDetailResponse,
  DepartmentStudentItem,
  DepartmentWindow,
  DepartmentYearParticipation,
  ManagedContestItem,
} from "./department.model";

const DEFAULT_WINDOW_DAYS = 90;
const MAX_WINDOW_DAYS = 365;
const RECENT_CONTEST_LIMIT = 12;

export interface DepartmentQuery {
  year?: StudentYear;
  windowDays?: number;
}

export interface DepartmentService {
  getOverview(department: Department, query: DepartmentQuery): Promise<DepartmentOverviewResponse>;
  listStudents(
    department: Department,
    query: DepartmentQuery & PaginationInput,
  ): Promise<PaginatedResult<DepartmentStudentItem>>;
  getStudentDetail(
    department: Department,
    email: string,
    query: DepartmentQuery,
  ): Promise<DepartmentStudentDetailResponse>;
  listContests(
    department: Department,
    query: DepartmentQuery & PaginationInput,
  ): Promise<PaginatedResult<DepartmentContestParticipation>>;
  /** Faculty in the department the HOD can delegate contest management to. */
  listDepartmentFaculty(department: Department, hodEmail: string): Promise<DepartmentFacultyItem[]>;
  /** Contests the HOD created, with their current delegated managers. */
  listManagedContests(department: Department, hodEmail: string): Promise<ManagedContestItem[]>;
  /** Replace the delegated managers of a contest the HOD created. */
  setContestManagers(
    department: Department,
    hodEmail: string,
    contestId: string,
    managerEmails: string[],
  ): Promise<ManagedContestItem>;
}

interface DepartmentServiceDependencies {
  userRepository: UserRepository;
  submissionRepository: SubmissionRepository;
  contestRepository: ContestRepository;
  contestRegistrationRepository: ContestRegistrationRepository;
  contestAttemptRepository: ContestAttemptRepository;
  now: () => Date;
}

function percentage(part: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((part / total) * 10000) / 100;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 100) / 100;
}

function resolveWindow(now: Date, windowDays?: number): { from: Date; to: Date; window: DepartmentWindow } {
  const days = Math.min(Math.max(windowDays ?? DEFAULT_WINDOW_DAYS, 1), MAX_WINDOW_DAYS);
  const to = now;
  const from = addDays(now, -(days - 1));
  return {
    from,
    to,
    window: { from: from.toISOString(), to: to.toISOString(), days: countDaysBetween(from, to) },
  };
}

/**
 * Everything the department views need, loaded once per request.
 *
 * Membership is decided by the *current* roster rather than by the department snapshot
 * stored on each submission/registration, so a student who changed department is counted
 * where they are now. It also keeps the whole request to a fixed number of reads instead
 * of one lookup per student.
 */
async function loadDepartmentContext(
  dependencies: DepartmentServiceDependencies,
  department: Department,
  query: DepartmentQuery,
) {
  const now = dependencies.now();
  const { from, to, window } = resolveWindow(now, query.windowDays);

  const roster = (await dependencies.userRepository.listByDepartment(department, "STUDENT")).filter((student) =>
    matchesStudentYearSemester(student.semester, query.year),
  );
  const rosterEmails = roster.map((student) => student.email);
  const rosterSet = new Set(rosterEmails);

  const submissions =
    rosterEmails.length === 0
      ? []
      : await dependencies.submissionRepository.listForAnalytics({
          userEmails: rosterEmails,
          createdFrom: from,
          createdTo: to,
        });

  const submissionsByStudent = new Map<string, SubmissionAnalyticsRecord[]>();
  for (const submission of submissions) {
    const bucket = submissionsByStudent.get(submission.userEmail);
    if (bucket) {
      bucket.push(submission);
    } else {
      submissionsByStudent.set(submission.userEmail, [submission]);
    }
  }

  return { now, from, to, window, roster, rosterSet, submissions, submissionsByStudent };
}

function activeDateKeys(submissions: readonly SubmissionAnalyticsRecord[]): Set<string> {
  return new Set(submissions.map((submission) => toDateKey(submission.createdAt)));
}

/** Contest participation counts, scoped to the given roster. */
async function loadContestParticipation(
  dependencies: DepartmentServiceDependencies,
  department: Department,
  rosterSet: Set<string>,
  now: Date,
): Promise<{
  items: DepartmentContestParticipation[];
  registeredByStudent: Map<string, number>;
  attemptedByStudent: Map<string, number>;
}> {
  const contests = await dependencies.contestRepository.list();
  const registeredByStudent = new Map<string, number>();
  const attemptedByStudent = new Map<string, number>();
  const items: DepartmentContestParticipation[] = [];

  for (const contest of contests) {
    const [registrations, attempts] = await Promise.all([
      dependencies.contestRegistrationRepository.listByContest(contest.id),
      dependencies.contestAttemptRepository.listByContest(contest.id),
    ]);

    const departmentRegistrations = registrations.filter((registration) => rosterSet.has(registration.userEmail));
    const departmentAttempts = attempts.filter((attempt) => rosterSet.has(attempt.userEmail));

    // A contest is relevant if it targets this department or anyone here took part.
    const isRelevant =
      contest.targetDepartment === department ||
      departmentRegistrations.length > 0 ||
      departmentAttempts.length > 0;
    if (!isRelevant) {
      continue;
    }

    for (const registration of departmentRegistrations) {
      registeredByStudent.set(registration.userEmail, (registeredByStudent.get(registration.userEmail) ?? 0) + 1);
    }
    for (const attempt of departmentAttempts) {
      attemptedByStudent.set(attempt.userEmail, (attemptedByStudent.get(attempt.userEmail) ?? 0) + 1);
    }

    const completedAttempts = departmentAttempts.filter(
      (attempt) => attempt.status === "SUBMITTED" || attempt.status === "AUTO_SUBMITTED",
    );
    const scores = departmentAttempts.map((attempt) => attempt.score);
    const times = departmentAttempts
      .map((attempt) => attempt.timeTakenMs)
      .filter((value): value is number => typeof value === "number");

    items.push({
      contestId: contest.id,
      title: contest.title,
      type: contest.type,
      computedStatus: computeContestStatus(contest, now),
      startAt: contest.startAt.toISOString(),
      endAt: contest.endAt.toISOString(),
      durationMinutes: contest.durationMinutes,
      targetDepartment: contest.targetDepartment,
      resultsPublished: contest.resultsPublished,
      eligibleStudentCount: rosterSet.size,
      registeredCount: departmentRegistrations.length,
      attemptedCount: departmentAttempts.length,
      completedCount: completedAttempts.length,
      registrationRate: percentage(departmentRegistrations.length, rosterSet.size),
      attemptRate: percentage(departmentAttempts.length, departmentRegistrations.length),
      completionRate: percentage(completedAttempts.length, departmentAttempts.length),
      averageScore: average(scores),
      highestScore: scores.length > 0 ? Math.max(...scores) : 0,
      averageTimeTakenMs: Math.round(average(times)),
      totalViolationCount: departmentAttempts.reduce((total, attempt) => total + attempt.violationCount, 0),
    });
  }

  items.sort((left, right) => right.startAt.localeCompare(left.startAt));
  return { items, registeredByStudent, attemptedByStudent };
}

function buildYearParticipation(
  roster: UserRecord[],
  submissionsByStudent: Map<string, SubmissionAnalyticsRecord[]>,
  registeredByStudent: Map<string, number>,
  attemptedByStudent: Map<string, number>,
): DepartmentYearParticipation[] {
  const buckets = new Map<string, { year: StudentYear | null; students: UserRecord[] }>();

  for (const student of roster) {
    const year = deriveStudentYearFromSemester(student.semester);
    const key = year === null ? "unspecified" : String(year);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.students.push(student);
    } else {
      buckets.set(key, { year, students: [student] });
    }
  }

  return Array.from(buckets.values())
    .map(({ year, students }) => {
      const submissionCount = students.reduce(
        (total, student) => total + (submissionsByStudent.get(student.email)?.length ?? 0),
        0,
      );
      const activeStudentCount = students.filter(
        (student) =>
          (submissionsByStudent.get(student.email)?.length ?? 0) > 0 ||
          (registeredByStudent.get(student.email) ?? 0) > 0,
      ).length;

      return {
        year,
        label: year === null ? "Unspecified" : formatStudentYearLabel(year),
        studentCount: students.length,
        activeStudentCount,
        participationRate: percentage(activeStudentCount, students.length),
        submissionCount,
        contestRegisteredCount: students.reduce(
          (total, student) => total + (registeredByStudent.get(student.email) ?? 0),
          0,
        ),
        contestAttemptedCount: students.reduce(
          (total, student) => total + (attemptedByStudent.get(student.email) ?? 0),
          0,
        ),
      } satisfies DepartmentYearParticipation;
    })
    .sort((left, right) => (left.year ?? 99) - (right.year ?? 99));
}

function buildActivityTrend(
  submissions: readonly SubmissionAnalyticsRecord[],
  from: Date,
  to: Date,
): DepartmentActivityPoint[] {
  const byDate = new Map<string, { submissionCount: number; acceptedCount: number; students: Set<string> }>();

  for (const submission of submissions) {
    const key = toDateKey(submission.createdAt);
    const entry = byDate.get(key) ?? { submissionCount: 0, acceptedCount: 0, students: new Set<string>() };
    entry.submissionCount += 1;
    if (submission.status === "ACCEPTED") {
      entry.acceptedCount += 1;
    }
    entry.students.add(submission.userEmail);
    byDate.set(key, entry);
  }

  // Zero-filled so the chart shows quiet days rather than silently compressing them.
  return enumerateDateKeys(from, to).map((date) => {
    const entry = byDate.get(date);
    return {
      date,
      submissionCount: entry?.submissionCount ?? 0,
      acceptedCount: entry?.acceptedCount ?? 0,
      activeStudentCount: entry?.students.size ?? 0,
    };
  });
}

function buildActivityLevelDistribution(
  roster: UserRecord[],
  submissionsByStudent: Map<string, SubmissionAnalyticsRecord[]>,
  windowDays: number,
): DepartmentActivityLevelBucket[] {
  const counts = new Map<ActivityLevel, number>([
    ["Inactive", 0],
    ["Low", 0],
    ["Moderate", 0],
    ["High", 0],
  ]);

  for (const student of roster) {
    const activeDays = activeDateKeys(submissionsByStudent.get(student.email) ?? []).size;
    const level = classifyActivityLevel(activeDays, windowDays);
    counts.set(level, (counts.get(level) ?? 0) + 1);
  }

  return ACTIVITY_LEVEL_BANDS.map((band) => ({
    level: band.level,
    studentCount: counts.get(band.level) ?? 0,
    minActiveDays: Math.ceil(band.minRatio * windowDays),
    maxActiveDays: Math.floor(band.maxRatio * windowDays),
  }));
}

export function createDepartmentService(dependencies: DepartmentServiceDependencies): DepartmentService {
  return {
    async getOverview(department, query) {
      const { now, from, to, window, roster, rosterSet, submissions, submissionsByStudent } =
        await loadDepartmentContext(dependencies, department, query);

      const { items: contestParticipation, registeredByStudent, attemptedByStudent } =
        await loadContestParticipation(dependencies, department, rosterSet, now);

      const consistencies = roster.map((student) =>
        computeConsistency(activeDateKeys(submissionsByStudent.get(student.email) ?? []), from, to),
      );

      const activeStudentCount = roster.filter(
        (student) =>
          (submissionsByStudent.get(student.email)?.length ?? 0) > 0 ||
          (registeredByStudent.get(student.email) ?? 0) > 0,
      ).length;

      const acceptedSubmissionCount = submissions.filter((submission) => submission.status === "ACCEPTED").length;
      const analytics = buildAnalyticsFromSubmissions(submissions);

      const distributionBands = ["0-20", "21-40", "41-60", "61-80", "81-100"];
      const distribution = distributionBands.map((band) => ({ band, studentCount: 0 }));
      for (const consistency of consistencies) {
        const index = Math.min(Math.floor(consistency.consistencyScore / 20), distributionBands.length - 1);
        distribution[index].studentCount += 1;
      }

      return {
        department,
        window,
        totals: {
          studentCount: roster.length,
          activeStudentCount,
          participationRate: percentage(activeStudentCount, roster.length),
          submissionCount: submissions.length,
          acceptedSubmissionCount,
          accuracy: percentage(acceptedSubmissionCount, submissions.length),
          problemsSolved: analytics.difficultyBreakdown.reduce((total, entry) => total + entry.solvedCount, 0),
          contestRegistrationCount: Array.from(registeredByStudent.values()).reduce(
            (total, value) => total + value,
            0,
          ),
          contestAttemptCount: Array.from(attemptedByStudent.values()).reduce((total, value) => total + value, 0),
        },
        participationByYear: buildYearParticipation(
          roster,
          submissionsByStudent,
          registeredByStudent,
          attemptedByStudent,
        ),
        activityTrend: buildActivityTrend(submissions, from, to),
        activityLevelDistribution: buildActivityLevelDistribution(roster, submissionsByStudent, window.days),
        consistency: {
          windowDays: window.days,
          averageConsistencyScore: average(consistencies.map((entry) => entry.consistencyScore)),
          averageActiveDayRatio: average(consistencies.map((entry) => entry.activeDayRatio)),
          averageWeeklyRegularity: average(consistencies.map((entry) => entry.weeklyRegularity)),
          averageActiveDays: average(consistencies.map((entry) => entry.activeDays)),
          averageCurrentStreakDays: average(consistencies.map((entry) => entry.currentStreakDays)),
          averageLongestStreakDays: average(consistencies.map((entry) => entry.longestStreakDays)),
          distribution,
        },
        submissionHeatmap: analytics.submissionHeatmap,
        difficultyBreakdown: analytics.difficultyBreakdown,
        languageBreakdown: analytics.languageBreakdown,
        contestParticipation: contestParticipation.slice(0, RECENT_CONTEST_LIMIT),
      };
    },

    async listStudents(department, query) {
      const { now, from, to, window, roster, rosterSet, submissionsByStudent } = await loadDepartmentContext(
        dependencies,
        department,
        query,
      );
      const { registeredByStudent, attemptedByStudent } = await loadContestParticipation(
        dependencies,
        department,
        rosterSet,
        now,
      );

      const rows = roster
        .map((student) => {
          const studentSubmissions = submissionsByStudent.get(student.email) ?? [];
          const consistency = computeConsistency(activeDateKeys(studentSubmissions), from, to);
          const lastActive = studentSubmissions.reduce<Date | null>(
            (latest, submission) =>
              !latest || submission.createdAt.getTime() > latest.getTime() ? submission.createdAt : latest,
            null,
          );

          return {
            rank: 0,
            email: student.email,
            name: student.name,
            uid: student.uid,
            semester: student.semester,
            year: deriveStudentYearFromSemester(student.semester),
            rating: student.rating,
            problemsSolved: student.problemsSolved,
            submissionCount: student.submissionCount,
            acceptedSubmissionCount: student.acceptedSubmissionCount,
            accuracy: student.accuracy,
            activeDays: consistency.activeDays,
            consistencyScore: consistency.consistencyScore,
            currentStreakDays: consistency.currentStreakDays,
            longestStreakDays: consistency.longestStreakDays,
            activityLevel: classifyActivityLevel(consistency.activeDays, window.days),
            lastActiveAt: lastActive?.toISOString() ?? null,
            contestsRegistered: registeredByStudent.get(student.email) ?? 0,
            contestsAttempted: attemptedByStudent.get(student.email) ?? 0,
          } satisfies DepartmentStudentItem;
        })
        .sort(
          (left, right) =>
            right.rating - left.rating ||
            right.problemsSolved - left.problemsSolved ||
            left.email.localeCompare(right.email),
        )
        .map((row, index) => ({ ...row, rank: index + 1 }));

      return paginateArray(rows, query);
    },

    async listContests(department, query) {
      const { now, rosterSet } = await loadDepartmentContext(dependencies, department, query);
      const { items } = await loadContestParticipation(dependencies, department, rosterSet, now);
      return paginateArray(items, query);
    },

    async getStudentDetail(department, email, query) {
      const student = await dependencies.userRepository.getByEmail(email);

      // 404 rather than 403 for an out-of-department student, matching the contest
      // ownership checks: the response must not confirm that the account exists.
      if (!student || student.role !== "STUDENT" || student.department !== department) {
        throw new AppError(404, "Student not found");
      }

      const now = dependencies.now();
      const { from, to, window } = resolveWindow(now, query.windowDays);
      const submissions = await dependencies.submissionRepository.listForAnalytics({
        userEmail: email,
        createdFrom: from,
        createdTo: to,
      });

      const analytics = buildAnalyticsFromSubmissions(submissions);
      const consistency = computeConsistency(activeDateKeys(submissions), from, to);
      const timestamps = submissions.map((submission) => submission.createdAt);
      const sortedTimestamps = timestamps.slice().sort((left, right) => left.getTime() - right.getTime());

      const contests = await dependencies.contestRepository.list();
      const contestRows: DepartmentStudentDetailResponse["contests"] = [];
      for (const contest of contests) {
        const [registration, attempt] = await Promise.all([
          dependencies.contestRegistrationRepository.getByContestAndUser(contest.id, email),
          dependencies.contestAttemptRepository.getByContestAndUser(contest.id, email),
        ]);
        if (!registration && !attempt) {
          continue;
        }

        contestRows.push({
          contestId: contest.id,
          title: contest.title,
          registeredAt: registration?.registeredAt.toISOString() ?? null,
          attemptStatus: attempt?.status ?? "NOT_ATTEMPTED",
          score: attempt?.score ?? null,
          solvedCount: attempt
            ? attempt.questionStates.filter((state) => state.status === "SOLVED").length
            : null,
          timeTakenMs: attempt?.timeTakenMs ?? null,
          violationCount: attempt?.violationCount ?? null,
        });
      }

      return {
        student: {
          email: student.email,
          name: student.name,
          uid: student.uid,
          department: student.department,
          semester: student.semester,
          year: deriveStudentYearFromSemester(student.semester),
          rating: student.rating,
          problemsSolved: student.problemsSolved,
          submissionCount: student.submissionCount,
          acceptedSubmissionCount: student.acceptedSubmissionCount,
          accuracy: student.accuracy,
          lastAcceptedAt: student.lastAcceptedAt?.toISOString() ?? null,
        },
        window,
        activity: {
          activeDays: consistency.activeDays,
          consistencyScore: consistency.consistencyScore,
          activeDayRatio: consistency.activeDayRatio,
          weeklyRegularity: consistency.weeklyRegularity,
          currentStreakDays: consistency.currentStreakDays,
          longestStreakDays: consistency.longestStreakDays,
          estimatedActiveMinutes: estimateActiveMinutes(timestamps).totalMinutes,
          firstSubmissionAt: sortedTimestamps[0]?.toISOString() ?? null,
          lastSubmissionAt: sortedTimestamps[sortedTimestamps.length - 1]?.toISOString() ?? null,
        },
        // Only the aggregate slices — recent submissions and history are deliberately
        // dropped so this response cannot start carrying per-submission detail.
        difficultyBreakdown: analytics.difficultyBreakdown,
        languageBreakdown: analytics.languageBreakdown,
        submissionHeatmap: analytics.submissionHeatmap,
        contests: contestRows,
      };
    },

    async listDepartmentFaculty(department, hodEmail) {
      const faculty = await dependencies.userRepository.listByDepartment(department, "FACULTY");
      return faculty
        // The HOD cannot delegate a contest to themselves; they already own it.
        .filter((member) => member.email !== hodEmail)
        .map((member) => ({
          email: member.email,
          name: member.name,
          designation: member.designation,
          isHod: member.isHod === true,
        } satisfies DepartmentFacultyItem))
        .sort((left, right) => (left.name ?? left.email).localeCompare(right.name ?? right.email));
    },

    async listManagedContests(department, hodEmail) {
      const now = dependencies.now();
      const [contests, faculty] = await Promise.all([
        dependencies.contestRepository.list(),
        dependencies.userRepository.listByDepartment(department, "FACULTY"),
      ]);
      const nameByEmail = new Map(faculty.map((member) => [member.email, member.name]));

      return contests
        .filter((contest) => contest.createdBy === hodEmail)
        .sort((left, right) => right.startAt.getTime() - left.startAt.getTime())
        .map((contest) => toManagedContestItem(contest, now, nameByEmail));
    },

    async setContestManagers(department, hodEmail, contestId, managerEmails) {
      const contest = await dependencies.contestRepository.getById(contestId);
      // 404 (not 403) for a contest the HOD did not create, matching the ownership convention.
      if (!contest || contest.createdBy !== hodEmail) {
        throw new AppError(404, "Contest not found");
      }

      const faculty = await dependencies.userRepository.listByDepartment(department, "FACULTY");
      const facultyByEmail = new Map(faculty.map((member) => [member.email, member]));

      // Only faculty in the HOD's own department may be delegated, and never the HOD.
      const validManagers = Array.from(new Set(managerEmails.map((email) => email.trim().toLowerCase())))
        .filter((email) => email && email !== hodEmail && facultyByEmail.has(email));

      const now = dependencies.now();
      const updatedContest = { ...contest, managerEmails: validManagers, updatedAt: now };
      await dependencies.contestRepository.save(updatedContest);

      return toManagedContestItem(updatedContest, now, new Map(faculty.map((m) => [m.email, m.name])));
    },
  };
}

function toManagedContestItem(
  contest: ContestRecord,
  now: Date,
  nameByEmail: Map<string, string | null>,
): ManagedContestItem {
  return {
    contestId: contest.id,
    title: contest.title,
    computedStatus: computeContestStatus(contest, now),
    startAt: contest.startAt.toISOString(),
    endAt: contest.endAt.toISOString(),
    resultsPublished: contest.resultsPublished,
    managers: (contest.managerEmails ?? []).map((email) => ({
      email,
      name: nameByEmail.get(email) ?? null,
    })),
  };
}
