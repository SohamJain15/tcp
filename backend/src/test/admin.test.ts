import request from "supertest";
import { describe, expect, it } from "vitest";

import { DEPARTMENTS } from "../shared/constants/domain";
import { normalizeRole } from "../shared/utils/normalize";
import { createTestApp } from "./helpers/create-test-app";

const adminHeaders = {
  "x-coe-role": "ADMIN",
  "x-coe-email": "principal@tcetmumbai.in",
  "x-coe-name": "Principal",
};

const facultyHeaders = {
  "x-coe-role": "FACULTY",
  "x-coe-email": "faculty1@tcetmumbai.in",
  "x-coe-name": "Prof. Mehta",
};

const hodHeaders = {
  "x-coe-role": "FACULTY",
  "x-coe-email": "hod1@tcetmumbai.in",
  "x-coe-name": "Prof. Rao",
};

const COMPUTER_ENGINEERING = "B.E. Computer Engineering";
const encoded = encodeURIComponent(COMPUTER_ENGINEERING);

// ---------------------------------------------------------------------------
// Role resolution
// ---------------------------------------------------------------------------

describe("admin role resolution", () => {
  it("recognises ADMIN without demoting it", () => {
    expect(normalizeRole("ADMIN")).toBe("ADMIN");
    expect(normalizeRole("admin")).toBe("ADMIN");
    expect(normalizeRole(" Admin ")).toBe("ADMIN");
  });

  it("leaves the existing roles alone", () => {
    expect(normalizeRole("FACULTY")).toBe("FACULTY");
    expect(normalizeRole("STUDENT")).toBe("STUDENT");
  });

  it("still demotes anything unrecognised to the least-privileged role", () => {
    expect(normalizeRole("INDUSTRY")).toBe("STUDENT");
    expect(normalizeRole("SUPERUSER")).toBe("STUDENT");
    expect(normalizeRole(undefined)).toBe("STUDENT");
    expect(normalizeRole(null)).toBe("STUDENT");
    expect(normalizeRole(42)).toBe("STUDENT");
  });

  it("survives a round-trip through the repository", async () => {
    // normalizeRole runs on the READ path too (user.repository.mapUserRecord). Before ADMIN was added
    // there, an admin was persisted correctly and then silently read back as a student on the very
    // next request — invisible to any test that only checked the write.
    const { repositories } = createTestApp();
    const stored = await repositories.userRepository.getByEmail("principal@tcetmumbai.in");
    expect(stored?.role).toBe("ADMIN");
  });

  it("never treats an admin as HOD", async () => {
    const { repositories } = createTestApp();
    const stored = await repositories.userRepository.getByEmail("principal@tcetmumbai.in");
    expect(stored?.isHod).toBe(false);

    const { app } = createTestApp();
    const me = await request(app).get("/api/users/me").set(adminHeaders);
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe("ADMIN");
    expect(me.body.user.isHod).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

describe("admin endpoint authorization", () => {
  it("lets an admin list the canonical departments", async () => {
    const { app } = createTestApp();
    const response = await request(app).get("/api/admin/departments").set(adminHeaders);

    expect(response.status).toBe(200);
    expect(response.body.departments).toEqual([...DEPARTMENTS]);
  });

  it("denies students, faculty and HODs", async () => {
    const { app } = createTestApp();

    for (const headers of [{}, facultyHeaders, hodHeaders]) {
      const response = await request(app).get("/api/admin/departments").set(headers);
      expect(response.status).toBe(403);
    }
  });

  it("serves every canonical department", async () => {
    const { app } = createTestApp();

    for (const department of DEPARTMENTS) {
      const response = await request(app)
        .get(`/api/admin/departments/${encodeURIComponent(department)}/overview`)
        .set(adminHeaders);

      expect(response.status).toBe(200);
      expect(response.body.overview.department).toBe(department);
    }
  });

  it("rejects a department that is not on the canonical list", async () => {
    const { app } = createTestApp();

    for (const value of ["Hogwarts", "'; DROP TABLE users;--", "%%%", " "]) {
      const response = await request(app)
        .get(`/api/admin/departments/${encodeURIComponent(value)}/overview`)
        .set(adminHeaders);
      expect(response.status).toBe(404);
    }
  });

  it("accepts department names containing an en-dash and ampersand", async () => {
    // "B.Tech – Artificial Intelligence & Machine Learning" round-trips through the URL only if the
    // client encodes it and the server decodes it; a plain string compare would fail on either.
    const { app } = createTestApp();
    const department = "B.Tech – Artificial Intelligence & Machine Learning";

    const response = await request(app)
      .get(`/api/admin/departments/${encodeURIComponent(department)}/overview`)
      .set(adminHeaders);

    expect(response.status).toBe(200);
    expect(response.body.overview.department).toBe(department);
  });
});

// ---------------------------------------------------------------------------
// Parity with the HOD view
// ---------------------------------------------------------------------------

describe("admin analytics parity", () => {
  it("returns the same overview the HOD sees for the same department", async () => {
    const { app } = createTestApp();

    const hodResponse = await request(app).get("/api/department/overview").set(hodHeaders);
    const adminResponse = await request(app)
      .get(`/api/admin/departments/${encoded}/overview`)
      .set(adminHeaders);

    expect(hodResponse.status).toBe(200);
    expect(adminResponse.status).toBe(200);
    // `window` carries generated-at timestamps from a ticking test clock, so compare everything else.
    const { window: _hodWindow, ...hod } = hodResponse.body.overview;
    const { window: _adminWindow, ...admin } = adminResponse.body.overview;
    expect(admin).toEqual(hod);
  });

  it("honours the same year and windowDays filters", async () => {
    const { app } = createTestApp();
    const query = { year: 2, windowDays: 30 };

    const hodResponse = await request(app).get("/api/department/overview").query(query).set(hodHeaders);
    const adminResponse = await request(app)
      .get(`/api/admin/departments/${encoded}/overview`)
      .query(query)
      .set(adminHeaders);

    const { window: _h, ...hod } = hodResponse.body.overview;
    const { window: _a, ...admin } = adminResponse.body.overview;
    expect(admin).toEqual(hod);
    // student1 is in semester 4 (year 2), so a year-2 filter must not empty the roster.
    expect(admin.totals.studentCount).toBeGreaterThan(0);
  });

  it("returns the same student list and detail as the HOD scope", async () => {
    const { app } = createTestApp();

    const hodList = await request(app).get("/api/department/students").set(hodHeaders);
    const adminList = await request(app)
      .get(`/api/admin/departments/${encoded}/students`)
      .set(adminHeaders);

    expect(adminList.status).toBe(200);
    expect(adminList.body.items).toEqual(hodList.body.items);
    expect(adminList.body.items.length).toBeGreaterThan(0);

    const adminDetail = await request(app)
      .get(`/api/admin/departments/${encoded}/students/student1%40tcetmumbai.in`)
      .set(adminHeaders);

    expect(adminDetail.status).toBe(200);
    expect(adminDetail.body.student.student.email).toBe("student1@tcetmumbai.in");
  });

  it("returns the whole roster in one page rather than capping at 50", async () => {
    // A department roster is bounded by enrolment and the service already sorts the full list before
    // slicing, so the platform-wide 50-row cap only forced extra round trips to show one class.
    const { app, repositories } = createTestApp();

    const seedTime = new Date(Date.UTC(2026, 4, 7));
    for (let index = 0; index < 120; index += 1) {
      await repositories.userRepository.save({
        email: `bulk${index}@tcetmumbai.in`,
        role: "STUDENT",
        name: `Bulk ${index}`,
        uid: `TCET-BULK-${index}`,
        isProfileComplete: true,
        designation: null,
        isHod: false,
        rollNumber: `TCETB${index}`,
        department: COMPUTER_ENGINEERING,
        semester: 4,
        linkedInUrl: null,
        githubUrl: null,
        skills: [],
        rating: 0,
        score: 0,
        problemsSolved: 0,
        submissionCount: 0,
        acceptedSubmissionCount: 0,
        accuracy: 0,
    avgAcceptedRuntimeMs: 0,
    avgAcceptedMemoryKb: 0,
        createdAt: seedTime,
        updatedAt: seedTime,
        lastLoginAt: seedTime,
        lastAcceptedAt: null,
      });
    }

    const response = await request(app)
      .get(`/api/admin/departments/${encoded}/students`)
      .query({ pageSize: 1000 })
      .set(adminHeaders);

    expect(response.status).toBe(200);
    expect(response.body.pageInfo.totalCount).toBeGreaterThan(50);
    expect(response.body.items).toHaveLength(response.body.pageInfo.totalCount);
    expect(response.body.pageInfo.nextCursor).toBeNull();
  });

  it("still clamps an absurd page size", async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .get(`/api/admin/departments/${encoded}/students`)
      .query({ pageSize: 999999 })
      .set(adminHeaders);

    expect(response.status).toBe(200);
    expect(response.body.pageInfo.pageSize).toBe(1000);
  });

  it("404s a student who belongs to another department", async () => {
    // student2 is in Information Technology. Asking for them under Computer Engineering must not
    // confirm the account exists.
    const { app } = createTestApp();
    const response = await request(app)
      .get(`/api/admin/departments/${encoded}/students/student2%40tcetmumbai.in`)
      .set(adminHeaders);

    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// The admin surface must stay read-only and content-free
// ---------------------------------------------------------------------------

describe("admin containment", () => {
  it("exposes no contest content, answer keys, test cases or code", async () => {
    const { app } = createTestApp();

    const overview = await request(app)
      .get(`/api/admin/departments/${encoded}/overview`)
      .set(adminHeaders);
    const students = await request(app)
      .get(`/api/admin/departments/${encoded}/students`)
      .set(adminHeaders);
    const detail = await request(app)
      .get(`/api/admin/departments/${encoded}/students/student1%40tcetmumbai.in`)
      .set(adminHeaders);

    for (const response of [overview, students, detail]) {
      const body = JSON.stringify(response.body);
      for (const forbidden of ["code", "hiddenTestCases", "sampleTestCases", "correctAnswer", "problemStatement", "stdout"]) {
        expect(body).not.toContain(`"${forbidden}"`);
      }
    }
  });

  it("cannot reach problems, contests, class tests or submissions", async () => {
    const { app } = createTestApp();

    const routes = [
      request(app).get("/api/problems").set(adminHeaders),
      request(app).get("/api/contests").set(adminHeaders),
      request(app).get("/api/class-tests").set(adminHeaders),
      request(app).get("/api/submissions").set(adminHeaders),
    ];

    for (const response of await Promise.all(routes)) {
      expect(response.status).toBe(403);
    }
  });

  it("cannot author problems or contests", async () => {
    const { app } = createTestApp();

    const createProblem = await request(app)
      .post("/api/problems")
      .set(adminHeaders)
      .send({ title: "x", statement: "y" });
    expect(createProblem.status).toBe(403);

    const createContest = await request(app)
      .post("/api/contests")
      .set(adminHeaders)
      .send({ title: "x" });
    expect(createContest.status).toBe(403);
  });

  it("cannot read another user's profile or analytics", async () => {
    const { app } = createTestApp();

    const profile = await request(app)
      .get("/api/users/student1%40tcetmumbai.in")
      .set(adminHeaders);
    expect(profile.status).toBe(403);

    const analytics = await request(app)
      .get("/api/users/student1%40tcetmumbai.in/analytics")
      .set(adminHeaders);
    expect(analytics.status).toBe(403);
  });

  it("cannot edit its own profile or self-assign HOD", async () => {
    // Without an explicit guard an admin falls into the faculty PATCH branch, which honours
    // `isHod` straight from the request body — that would unlock the HOD department routes.
    const { app, repositories } = createTestApp();

    const response = await request(app)
      .patch("/api/users/me")
      .set(adminHeaders)
      .send({ name: "Principal", department: COMPUTER_ENGINEERING, designation: "Principal", isHod: true });

    expect(response.status).toBe(403);

    const stored = await repositories.userRepository.getByEmail("principal@tcetmumbai.in");
    expect(stored?.isHod).toBe(false);
    expect(stored?.department).toBeNull();
  });

  it("cannot use the HOD department routes", async () => {
    const { app } = createTestApp();
    const response = await request(app).get("/api/department/overview").set(adminHeaders);
    expect(response.status).toBe(403);
  });

  it("can read the leaderboard", async () => {
    const { app } = createTestApp();

    const list = await request(app).get("/api/leaderboard").set(adminHeaders);
    expect(list.status).toBe(200);

    const csv = await request(app).get("/api/leaderboard/export").set(adminHeaders);
    expect(csv.status).toBe(200);
  });
});

describe("admin contest leaderboard", () => {
  it("lists every contest without needing to own it", async () => {
    // Faculty see only contests they created or were delegated; institute leadership sees all of
    // them, which is the whole reason this endpoint exists rather than reusing /api/contests.
    const { app, repositories } = createTestApp();
    const now = new Date(Date.UTC(2026, 4, 6));

    for (const [index, owner] of ["someone@tcetmumbai.in", "another@tcetmumbai.in"].entries()) {
      await repositories.contestRepository.save({
        id: `contest_admin_${index}`,
        title: `Contest ${index}`,
        startAt: now,
        endAt: new Date(now.getTime() + 3_600_000),
        durationMinutes: 60,
        registrationOpenAt: now,
        registrationCloseAt: now,
        type: "Rated",
        lifecycleState: "Published",
        resultsPublished: index === 0,
        targetDepartment: null,
        maxViolations: 3,
        createdBy: owner,
        createdByRole: "FACULTY",
        managerEmails: [],
        questions: [],
        createdAt: now,
        updatedAt: now,
      });
    }

    const response = await request(app).get("/api/admin/contests").set(adminHeaders);

    expect(response.status).toBe(200);
    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain("contest_admin_0");
    expect(ids).toContain("contest_admin_1");
    // Metadata only — a contest's questions must never ride along on this payload.
    expect(JSON.stringify(response.body)).not.toContain("hiddenTestCases");
    expect(response.body.items[0]).not.toHaveProperty("questions");
  });

  it("serves standings for a published contest it does not own", async () => {
    const { app, repositories } = createTestApp();
    const now = new Date(Date.UTC(2026, 4, 6));

    await repositories.contestRepository.save({
      id: "contest_admin_pub",
      title: "Published",
      startAt: now,
      endAt: new Date(now.getTime() + 3_600_000),
      durationMinutes: 60,
      registrationOpenAt: now,
      registrationCloseAt: now,
      type: "Rated",
      lifecycleState: "Published",
      resultsPublished: true,
      targetDepartment: null,
      maxViolations: 3,
      createdBy: "someone-else@tcetmumbai.in",
      createdByRole: "FACULTY",
      managerEmails: [],
      questions: [],
      createdAt: now,
      updatedAt: now,
    });

    const response = await request(app)
      .get("/api/admin/contests/contest_admin_pub/standings")
      .set(adminHeaders);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.items)).toBe(true);
  });

  it("still refuses standings for an unpublished contest", async () => {
    // Attempts are only graded at publish, so there is nothing to rank before then.
    const { app, repositories } = createTestApp();
    const now = new Date(Date.UTC(2026, 4, 6));

    await repositories.contestRepository.save({
      id: "contest_admin_unpub",
      title: "Unpublished",
      startAt: now,
      endAt: new Date(now.getTime() + 3_600_000),
      durationMinutes: 60,
      registrationOpenAt: now,
      registrationCloseAt: now,
      type: "Rated",
      lifecycleState: "Published",
      resultsPublished: false,
      targetDepartment: null,
      maxViolations: 3,
      createdBy: "someone-else@tcetmumbai.in",
      createdByRole: "FACULTY",
      managerEmails: [],
      questions: [],
      createdAt: now,
      updatedAt: now,
    });

    const response = await request(app)
      .get("/api/admin/contests/contest_admin_unpub/standings")
      .set(adminHeaders);

    expect(response.status).toBe(409);
  });

  it("404s an unknown contest", async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .get("/api/admin/contests/contest_missing/standings")
      .set(adminHeaders);

    expect(response.status).toBe(404);
  });

  it("denies non-admins the contest endpoints", async () => {
    const { app } = createTestApp();

    for (const headers of [{}, facultyHeaders, hodHeaders]) {
      expect((await request(app).get("/api/admin/contests").set(headers)).status).toBe(403);
    }
  });
});
