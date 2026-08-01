import { describe, expect, it } from "vitest";
import { deriveDivisionFromUid, resolveUidBranch, uidMatchesDepartment } from "./uid-department";

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
