import { describe, expect, it } from "vitest";
import { validateStudentSql } from "../execution/sql/sql-policy";

describe("SQL sandbox policy", () => {
  it("allows normal DBMS statements and quoted text", () => {
    expect(validateStudentSql("SELECT 'DROP DATABASE';", 1000).ok).toBe(true);
    expect(validateStudentSql("CREATE TABLE t (id INT)", 1000).ok).toBe(true);
    expect(validateStudentSql("UPDATE t SET id = 2", 1000).ok).toBe(true);
  });

  it("rejects multiple statements", () => {
    const result = validateStudentSql("SELECT 1; SELECT 2", 1000);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("one SQL statement");
  });

  it("rejects server, file-system, and metadata access", () => {
    expect(validateStudentSql("DROP DATABASE tcp_lab_x", 1000).ok).toBe(false);
    expect(validateStudentSql("SELECT LOAD_FILE('/etc/passwd')", 1000).ok).toBe(false);
    expect(validateStudentSql("SELECT * FROM information_schema.tables", 1000).ok).toBe(false);
    expect(validateStudentSql("GRANT ALL ON *.* TO 'x'@'%'", 1000).ok).toBe(false);
  });

  it("rejects oversized queries", () => {
    const result = validateStudentSql("SELECT " + "x".repeat(20), 10);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("too large");
  });
});
