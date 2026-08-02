import { describe, expect, it } from "vitest";
import {
  deriveDivisionFromUid,
  deriveSemesterFromUid,
  resolveUidBranch,
  uidMatchesDepartment,
} from "./uid-department";

describe("resolveUidBranch", () => {
  it("parses the branch code from a well-formed UID", () => {
    expect(resolveUidBranch("24-AIDSA49-28").code).toBe("AIDS");
    expect(resolveUidBranch("24-COMPB12-28").code).toBe("COMP");
    expect(resolveUidBranch("23-ITA05-27").code).toBe("IT");
    expect(resolveUidBranch("24-CIVILC03-28").code).toBe("CIVIL");
    expect(resolveUidBranch("24-CSEB07-28").code).toBe("CSE");
    expect(resolveUidBranch("24-MMEA01-28").code).toBe("MME");
    expect(resolveUidBranch("24-ENTCD11-28").code).toBe("ENTC");
    expect(resolveUidBranch("24-ECSA02-28").code).toBe("ECS");
    expect(resolveUidBranch("24-MECHB09-28").code).toBe("MECH");
    expect(resolveUidBranch("24-AIMLA20-28").code).toBe("AIML");
  });

  it("handles the IoT code (case-insensitive)", () => {
    expect(resolveUidBranch("24-IoTB12-28").code).toBe("IOT");
    expect(resolveUidBranch("24-IOTB12-28").departments).toContain("B.Tech – Internet of Things (IoT)");
  });

  it("returns null for unparseable UIDs", () => {
    expect(resolveUidBranch("").code).toBeNull();
    expect(resolveUidBranch("mock-uid").code).toBeNull();
    expect(resolveUidBranch("24-XYZA10-28").code).toBeNull();
  });
});

describe("uidMatchesDepartment", () => {
  it("accepts a matching department", () => {
    expect(uidMatchesDepartment("24-AIDSA49-28", "B.Tech – Artificial Intelligence & Data Science")).toBe(true);
    expect(uidMatchesDepartment("24-COMPB12-28", "B.E. Computer Engineering")).toBe(true);
    expect(uidMatchesDepartment("23-ITA05-27", "B.E. Information Technology")).toBe(true);
  });

  it("IoT UID matches both IoT and CSE-IoT departments", () => {
    expect(uidMatchesDepartment("24-IoTB12-28", "B.Tech – Internet of Things (IoT)")).toBe(true);
    expect(uidMatchesDepartment("24-IoTB12-28", "B.Tech – Computer Science & Engineering (CSE-IOT)")).toBe(true);
  });

  it("rejects a mismatching department", () => {
    expect(uidMatchesDepartment("24-AIDSA49-28", "B.E. Computer Engineering")).toBe(false);
    expect(uidMatchesDepartment("24-COMPB12-28", "B.Tech – Artificial Intelligence & Data Science")).toBe(false);
  });

  it("rejects when UID has no recognisable branch or no department", () => {
    expect(uidMatchesDepartment("mock-uid", "B.E. Computer Engineering")).toBe(false);
    expect(uidMatchesDepartment("24-AIDSA49-28", null)).toBe(false);
  });
});

describe("deriveDivisionFromUid", () => {
  it("reads the division letter that sits between the branch code and the roll number", () => {
    expect(deriveDivisionFromUid("24-AIDSA49-28")).toBe("A");
    expect(deriveDivisionFromUid("24-COMPB7-28")).toBe("B");
    expect(deriveDivisionFromUid("24-CSED12-28")).toBe("D");
  });

  it("uses the longest matching branch code so the division is not read from it", () => {
    // "CIVIL" must win over any shorter prefix, otherwise "I" would be read as the division.
    expect(deriveDivisionFromUid("24-CIVILC102-28")).toBe("C");
    expect(deriveDivisionFromUid("24-IOTA1-28")).toBe("A");
  });

  it("is case-insensitive, matching the rest of the UID helpers", () => {
    expect(deriveDivisionFromUid("24-aidsa49-28")).toBe("A");
  });

  it("returns null for a UID with no recognisable branch", () => {
    expect(deriveDivisionFromUid("24-XXXA1-28")).toBeNull();
    expect(deriveDivisionFromUid("mock-uid")).toBeNull();
  });

  it("returns null when the roll segment is missing or not numeric", () => {
    // Without digits after the division letter this is not a well-formed UID, and
    // guessing a division from it would silently mis-target a class test.
    expect(deriveDivisionFromUid("24-AIDSAB-28")).toBeNull();
    expect(deriveDivisionFromUid("24-AIDSA-28")).toBeNull();
  });

  it("returns null for empty or missing input", () => {
    expect(deriveDivisionFromUid("")).toBeNull();
    expect(deriveDivisionFromUid(null)).toBeNull();
    expect(deriveDivisionFromUid(undefined)).toBeNull();
  });
});

describe("deriveSemesterFromUid", () => {
  const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

  it("tracks a regular four-year student across all eight semesters", () => {
    const uid = "24-AIDSA60-28";
    expect(deriveSemesterFromUid(uid, at("2024-08-01"))).toBe(1);
    expect(deriveSemesterFromUid(uid, at("2025-02-01"))).toBe(2);
    expect(deriveSemesterFromUid(uid, at("2025-08-01"))).toBe(3);
    expect(deriveSemesterFromUid(uid, at("2026-02-01"))).toBe(4);
    expect(deriveSemesterFromUid(uid, at("2026-08-01"))).toBe(5);
    expect(deriveSemesterFromUid(uid, at("2027-02-01"))).toBe(6);
    expect(deriveSemesterFromUid(uid, at("2027-08-01"))).toBe(7);
    expect(deriveSemesterFromUid(uid, at("2028-02-01"))).toBe(8);
  });

  it("puts a lateral-entry student in the same semester as the batch they sit with", () => {
    // A three-year UID starts at semester 3, so it converges with the four-year batch that
    // graduates in the same year — they finish together, so they progress together.
    for (const [regular, dse] of [
      ["24-AIDSA60-28", "25-AIDSA65-28"],
      ["25-COMPB10-29", "26-COMPB77-29"],
      ["26-ITA5-30", "27-ITA88-30"],
    ]) {
      for (const when of ["2026-08-01", "2027-02-01", "2027-08-01"]) {
        expect(deriveSemesterFromUid(dse, at(when))).toBe(deriveSemesterFromUid(regular, at(when)));
      }
    }
  });

  it("ignores branch, division and roll number entirely", () => {
    // Only the two years matter. Every combination of the other parts must agree, otherwise the
    // rule has accidentally become specific to some students.
    const when = at("2026-08-01");
    const results = new Set<number | null>();
    for (const branch of ["COMP", "IT", "AIDS", "AIML", "ENTC", "ECS", "MECH", "CIVIL", "CSE", "MME", "IOT"]) {
      for (const division of ["A", "B", "C", "D", "E"]) {
        for (const roll of [1, 7, 60, 102, 999]) {
          results.add(deriveSemesterFromUid(`24-${branch}${division}${roll}-28`, when));
        }
      }
    }
    expect(results.size).toBe(1);
    expect([...results][0]).toBe(5);
  });

  it("works for every batch year, not just one", () => {
    const when = at("2026-08-01");
    expect(deriveSemesterFromUid("23-COMPA10-27", when)).toBe(7);
    expect(deriveSemesterFromUid("24-COMPA10-28", when)).toBe(5);
    expect(deriveSemesterFromUid("25-COMPA10-29", when)).toBe(3);
    expect(deriveSemesterFromUid("26-COMPA10-30", when)).toBe(1);
  });

  it("rolls over on 1 July, not before", () => {
    expect(deriveSemesterFromUid("24-AIDSA60-28", at("2026-06-30"))).toBe(4);
    expect(deriveSemesterFromUid("24-AIDSA60-28", at("2026-07-01"))).toBe(5);
  });

  it("clamps at both ends rather than running off the scale", () => {
    // Long after graduating, and (defensively) before the programme began.
    expect(deriveSemesterFromUid("24-AIDSA60-28", at("2035-01-01"))).toBe(8);
    expect(deriveSemesterFromUid("24-AIDSA60-28", at("2020-01-01"))).toBe(1);
  });

  it("returns null for a UID it cannot trust", () => {
    const when = at("2026-08-01");
    expect(deriveSemesterFromUid("mock-uid", when)).toBeNull();
    expect(deriveSemesterFromUid("TCET001", when)).toBeNull();
    expect(deriveSemesterFromUid("", when)).toBeNull();
    expect(deriveSemesterFromUid(null, when)).toBeNull();
    expect(deriveSemesterFromUid(undefined, when)).toBeNull();
    expect(deriveSemesterFromUid("24-XXXA1-28", when)).toBeNull();
    expect(deriveSemesterFromUid("24-AIDSAB-28", when)).toBeNull();
  });

  it("refuses an implausible programme length instead of guessing", () => {
    // A corrupt pass year must not silently place a student in some arbitrary semester.
    expect(deriveSemesterFromUid("24-AIDSA60-24", at("2026-08-01"))).toBeNull();
    expect(deriveSemesterFromUid("24-AIDSA60-99", at("2026-08-01"))).toBeNull();
    expect(deriveSemesterFromUid("28-AIDSA60-24", at("2026-08-01"))).toBeNull();
  });
});
