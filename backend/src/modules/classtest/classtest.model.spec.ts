import { describe, expect, it } from "vitest";
import type { UserRecord } from "../user/user.model";
import {
  computeClassTestStatus,
  isAssignedToClassTest,
  isLanguageAllowed,
  matchesAudienceFilter,
  toAssignedStudent,
  type ClassTestAudienceFilter,
  type ClassTestCodingQuestion,
  type ClassTestRecord,
} from "./classtest.model";

const COMP = "B.E. Computer Engineering" as const;
const AIDS = "B.Tech – Artificial Intelligence & Data Science" as const;

function student(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    email: "s@tcetmumbai.in",
    role: "STUDENT",
    name: "Test Student",
    uid: "24-COMPA15-28",
    rollNumber: "15",
    department: COMP,
    semester: 5,
    isProfileComplete: true,
    isHod: false,
    linkedInUrl: null,
    githubUrl: null,
    skills: [],
    rating: 0,
    score: 0,
    problemsSolved: 0,
    submissionCount: 0,
    acceptedSubmissionCount: 0,
    accuracy: 0,
    designation: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    lastLoginAt: null,
    lastAcceptedAt: null,
    ...overrides,
  } as UserRecord;
}

const compADivisionRolls11to20: ClassTestAudienceFilter = {
  department: COMP,
  division: "A",
  semester: null,
  rollFrom: 11,
  rollTo: 20,
};

describe("matchesAudienceFilter", () => {
  it("matches a student inside the department, division and roll range", () => {
    expect(matchesAudienceFilter(student(), compADivisionRolls11to20)).toBe(true);
  });

  it("excludes rolls outside the range at both ends", () => {
    expect(
      matchesAudienceFilter(student({ uid: "24-COMPA10-28", rollNumber: "10" }), compADivisionRolls11to20),
    ).toBe(false);
    expect(
      matchesAudienceFilter(student({ uid: "24-COMPA21-28", rollNumber: "21" }), compADivisionRolls11to20),
    ).toBe(false);
    // Boundaries are inclusive — "roll 11 to 20" means 11 and 20 both sit the test.
    expect(
      matchesAudienceFilter(student({ uid: "24-COMPA11-28", rollNumber: "11" }), compADivisionRolls11to20),
    ).toBe(true);
    expect(
      matchesAudienceFilter(student({ uid: "24-COMPA20-28", rollNumber: "20" }), compADivisionRolls11to20),
    ).toBe(true);
  });

  it("excludes another division and another department", () => {
    expect(
      matchesAudienceFilter(student({ uid: "24-COMPB15-28" }), compADivisionRolls11to20),
    ).toBe(false);
    expect(
      matchesAudienceFilter(student({ department: AIDS, uid: "24-AIDSA15-28" }), compADivisionRolls11to20),
    ).toBe(false);
  });

  it("never matches a faculty account", () => {
    expect(matchesAudienceFilter(student({ role: "FACULTY" }), compADivisionRolls11to20)).toBe(false);
  });

  it("treats null division / roll range / semester as 'no restriction'", () => {
    const wholeDepartment: ClassTestAudienceFilter = {
      department: COMP,
      division: null,
      semester: null,
      rollFrom: null,
      rollTo: null,
    };
    expect(matchesAudienceFilter(student({ uid: "24-COMPD99-28", rollNumber: "99" }), wholeDepartment)).toBe(true);
  });

  it("filters by semester when set", () => {
    const filter = { ...compADivisionRolls11to20, semester: 3 };
    expect(matchesAudienceFilter(student({ semester: 3 }), filter)).toBe(true);
    expect(matchesAudienceFilter(student({ semester: 5 }), filter)).toBe(false);
  });

  it("matches nobody when the department is unreadable, rather than widening the audience", () => {
    // Only reachable from a corrupt stored document. Failing closed means a broken test
    // reaches no one, instead of quietly opening to every student on the platform.
    const broken: ClassTestAudienceFilter = { ...compADivisionRolls11to20, department: null };
    expect(matchesAudienceFilter(student(), broken)).toBe(false);
  });

  it("excludes a student whose roll number is unusable when a range is set", () => {
    // A missing/garbage roll cannot be proven to be inside 11-20, so it must not slip in.
    expect(matchesAudienceFilter(student({ rollNumber: null }), compADivisionRolls11to20)).toBe(false);
    expect(matchesAudienceFilter(student({ rollNumber: "n/a" }), compADivisionRolls11to20)).toBe(false);
  });
});

describe("isAssignedToClassTest", () => {
  const test = {
    assignedStudents: [toAssignedStudent(student({ email: "picked@tcetmumbai.in" }))],
  } as ClassTestRecord;

  it("admits only students on the frozen list", () => {
    expect(isAssignedToClassTest(test, "picked@tcetmumbai.in")).toBe(true);
    expect(isAssignedToClassTest(test, "other@tcetmumbai.in")).toBe(false);
  });

  it("compares email case-insensitively", () => {
    expect(isAssignedToClassTest(test, "Picked@TcetMumbai.in")).toBe(true);
  });

  it("is independent of the filter, so a later profile change cannot revoke access", () => {
    // The student has moved to division B and roll 99 — outside the original filter — but they
    // were assigned, so they keep access. The frozen list is the authority.
    const moved = student({ email: "picked@tcetmumbai.in", uid: "24-COMPB99-28", rollNumber: "99" });
    expect(matchesAudienceFilter(moved, compADivisionRolls11to20)).toBe(false);
    expect(isAssignedToClassTest(test, moved.email)).toBe(true);
  });
});

describe("toAssignedStudent", () => {
  it("captures the division alongside the roll so faculty can see who was picked", () => {
    expect(toAssignedStudent(student())).toEqual({
      email: "s@tcetmumbai.in",
      name: "Test Student",
      uid: "24-COMPA15-28",
      rollNumber: "15",
      division: "A",
    });
  });
});

describe("computeClassTestStatus", () => {
  const test = { startAt: new Date("2026-08-03T10:00:00.000Z"), durationMinutes: 5 };

  it("moves Scheduled -> Live -> Ended around the shared window", () => {
    expect(computeClassTestStatus(test, new Date("2026-08-03T09:59:59.000Z"))).toBe("Scheduled");
    expect(computeClassTestStatus(test, new Date("2026-08-03T10:00:00.000Z"))).toBe("Live");
    expect(computeClassTestStatus(test, new Date("2026-08-03T10:04:59.000Z"))).toBe("Live");
    // A 5-minute quiz locks for everyone exactly 5 minutes after the scheduled start.
    expect(computeClassTestStatus(test, new Date("2026-08-03T10:05:00.000Z"))).toBe("Ended");
  });
});

describe("isLanguageAllowed", () => {
  const javaOnly = { supportedLanguages: ["java"] } as ClassTestCodingQuestion;

  it("permits only the languages the question declares", () => {
    expect(isLanguageAllowed(javaOnly, "java")).toBe(true);
    expect(isLanguageAllowed(javaOnly, "python")).toBe(false);
    expect(isLanguageAllowed(javaOnly, "cpp")).toBe(false);
  });

  it("supports a multi-language question such as C or C++ only", () => {
    const cFamily = { supportedLanguages: ["c", "cpp"] } as ClassTestCodingQuestion;
    expect(isLanguageAllowed(cFamily, "c")).toBe(true);
    expect(isLanguageAllowed(cFamily, "cpp")).toBe(true);
    expect(isLanguageAllowed(cFamily, "java")).toBe(false);
  });
});
