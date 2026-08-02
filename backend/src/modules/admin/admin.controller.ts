import type { Request, Response } from "express";
import { z } from "zod";

import { DEPARTMENTS } from "../../shared/constants/domain";
import type { ContestService } from "../contest/contest.service";
import { AppError } from "../../shared/errors/app-error";
import { normalizeDepartment, normalizeNumber } from "../../shared/utils/normalize";
import type { PaginationInput } from "../../shared/utils/pagination";
import type { StudentYear } from "../../shared/utils/student-year";
import type { DepartmentQuery, DepartmentService } from "../department/department.service";

interface AdminControllerDependencies {
  departmentService: DepartmentService;
  contestService: ContestService;
}

const contestIdSchema = z.string().regex(/^[a-z0-9_-]{4,64}$/i);

/**
 * Resolves the department an admin asked for.
 *
 * This is the one place the admin surface differs from the HOD surface: the HOD controller reads the
 * department from `req.hodContext` (the caller's own profile, unspoofable), while an admin names it
 * explicitly. `normalizeDepartment` is the validator — it returns a canonical `Department` or `null`,
 * so anything not on the canonical list is rejected before it can reach a repository query.
 */
function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function resolveRequestedDepartment(req: Request) {
  const raw = String(req.params.department ?? "");
  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      // A malformed percent-escape is simply not a department.
      return raw;
    }
  })();

  const department = normalizeDepartment(decoded);
  if (!department) {
    throw new AppError(404, "Department not found");
  }

  return department;
}

/**
 * Deliberately identical to `parseDepartmentQuery` in department.controller.ts — the admin view must
 * apply the same filter semantics and produce the same empty states as the HOD view, or the two
 * would silently disagree about the same department.
 */
function parseDepartmentQuery(req: Request): DepartmentQuery {
  const year = normalizeNumber(req.query.year, 0);
  const windowDays = normalizeNumber(req.query.windowDays, 0);

  return {
    year: year >= 1 && year <= 4 ? (year as StudentYear) : undefined,
    windowDays: windowDays > 0 ? windowDays : undefined,
  };
}

function parsePagination(req: Request): PaginationInput {
  return {
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    cursor: typeof req.query.cursor === "string" ? req.query.cursor : undefined,
  };
}

export function createAdminController(dependencies: AdminControllerDependencies) {
  const { departmentService, contestService } = dependencies;

  return {
    async listContests(req: Request, res: Response): Promise<void> {
      const contests = await contestService.listAllContests({
        ...parsePagination(req),
        department: normalizeDepartment(req.query.department) ?? undefined,
      });
      res.json(contests);
    },

    async getContestStandings(req: Request, res: Response): Promise<void> {
      const contestId = contestIdSchema.parse(getRouteParam(req.params.contestId));
      const year = normalizeNumber(req.query.year, 0);
      const standings = await contestService.getStandingsForAdmin(contestId, {
        department: normalizeDepartment(req.query.department) ?? undefined,
        year: year >= 1 && year <= 4 ? (year as StudentYear) : undefined,
      });
      res.json({ items: standings });
    },

    async listDepartments(_req: Request, res: Response): Promise<void> {
      res.json({ departments: [...DEPARTMENTS] });
    },

    async getDepartmentOverview(req: Request, res: Response): Promise<void> {
      const overview = await departmentService.getOverview(
        resolveRequestedDepartment(req),
        parseDepartmentQuery(req),
      );
      res.json({ overview });
    },

    async listDepartmentStudents(req: Request, res: Response): Promise<void> {
      const students = await departmentService.listStudents(resolveRequestedDepartment(req), {
        ...parseDepartmentQuery(req),
        ...parsePagination(req),
      });
      res.json(students);
    },

    async getDepartmentStudentDetail(req: Request, res: Response): Promise<void> {
      const email = String(req.params.email ?? "").trim().toLowerCase();
      if (!email) {
        throw new AppError(400, "Student email is required");
      }

      // getStudentDetail 404s when the student is outside the named department, so an admin cannot
      // use one department's URL to read another's roster.
      const student = await departmentService.getStudentDetail(
        resolveRequestedDepartment(req),
        email,
        parseDepartmentQuery(req),
      );
      res.json({ student });
    },
  };
}
