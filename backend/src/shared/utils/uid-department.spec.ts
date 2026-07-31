import { describe, expect, it } from "vitest";
import { resolveUidBranch, uidMatchesDepartment } from "./uid-department";

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
