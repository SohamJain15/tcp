import type { Request, Response } from "express";
import { AppError } from "../../shared/errors/app-error";
import { normalizeNumber } from "../../shared/utils/normalize";
import type { PaginationInput } from "../../shared/utils/pagination";
import type { StudentYear } from "../../shared/utils/student-year";
import type { DepartmentQuery, DepartmentService } from "./department.service";

interface DepartmentControllerDependencies {
  departmentService: DepartmentService;
}

/**
 * The department is taken from `req.hodContext`, which requireHod resolved from the
 * caller's saved profile. It is never read from the query string, so a client cannot
 * ask for a department other than their own.
 */
function resolveDepartment(req: Request) {
  const department = req.hodContext?.department;
  if (!department) {
    throw new AppError(403, "You are not allowed to access this resource");
  }
  return department;
}

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

export function createDepartmentController(dependencies: DepartmentControllerDependencies) {
  const { departmentService } = dependencies;

  return {
    async getOverview(req: Request, res: Response): Promise<void> {
      const overview = await departmentService.getOverview(resolveDepartment(req), parseDepartmentQuery(req));
      res.json({ overview });
    },

    async listStudents(req: Request, res: Response): Promise<void> {
      const students = await departmentService.listStudents(resolveDepartment(req), {
        ...parseDepartmentQuery(req),
        ...parsePagination(req),
      });
      res.json(students);
    },

    async getStudentDetail(req: Request, res: Response): Promise<void> {
      const email = String(req.params.email ?? "").trim().toLowerCase();
      if (!email) {
        throw new AppError(400, "Student email is required");
      }

      const student = await departmentService.getStudentDetail(
        resolveDepartment(req),
        email,
        parseDepartmentQuery(req),
      );
      res.json({ student });
    },

    async listContests(req: Request, res: Response): Promise<void> {
      const contests = await departmentService.listContests(resolveDepartment(req), {
        ...parseDepartmentQuery(req),
        ...parsePagination(req),
      });
      res.json(contests);
    },

    async listDepartmentFaculty(req: Request, res: Response): Promise<void> {
      const faculty = await departmentService.listDepartmentFaculty(resolveDepartment(req), req.user!.email);
      res.json({ faculty });
    },

    async listManagedContests(req: Request, res: Response): Promise<void> {
      const contests = await departmentService.listManagedContests(resolveDepartment(req), req.user!.email);
      res.json({ contests });
    },

    async setContestManagers(req: Request, res: Response): Promise<void> {
      const contestId = String(req.params.contestId ?? "").trim();
      if (!contestId) {
        throw new AppError(400, "Contest id is required");
      }

      const rawManagers = (req.body as { managerEmails?: unknown }).managerEmails;
      if (!Array.isArray(rawManagers) || rawManagers.some((email) => typeof email !== "string")) {
        throw new AppError(400, "managerEmails must be an array of emails");
      }

      const contest = await departmentService.setContestManagers(
        resolveDepartment(req),
        req.user!.email,
        contestId,
        rawManagers as string[],
      );
      res.json({ contest });
    },
  };
}
