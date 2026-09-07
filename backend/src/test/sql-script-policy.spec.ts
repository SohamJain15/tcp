import { describe, expect, it } from "vitest";

import {
  splitSqlStatements,
  validateSchemaSql,
  validateStudentScript,
} from "../execution/sql/sql-policy";

const script = (sql: string) => validateStudentScript(sql, 12_000, 100);

describe("splitSqlStatements", () => {
  it("splits on top-level semicolons and drops empty fragments", () => {
    expect(splitSqlStatements("CREATE TABLE t (id INT);\nINSERT INTO t VALUES (1);;\n")).toEqual([
      "CREATE TABLE t (id INT)",
      "INSERT INTO t VALUES (1)",
    ]);
  });

  it("keeps a trailing statement that has no semicolon", () => {
    expect(splitSqlStatements("INSERT INTO t VALUES (1); SELECT * FROM t")).toEqual([
      "INSERT INTO t VALUES (1)",
      "SELECT * FROM t",
    ]);
  });

  it("does not split on a semicolon inside a string or a comment", () => {
    expect(splitSqlStatements("INSERT INTO t VALUES ('a;b')")).toEqual(["INSERT INTO t VALUES ('a;b')"]);
    expect(splitSqlStatements("SELECT 1 -- one; two\n")).toEqual(["SELECT 1 -- one; two"]);
  });
});

describe("validateStudentScript", () => {
  it("allows the multi-statement DDL + DML a syllabus experiment needs", () => {
    const result = script(`
      CREATE TABLE department (id INT PRIMARY KEY, name VARCHAR(50) NOT NULL UNIQUE);
      CREATE TABLE student (id INT PRIMARY KEY, dept_id INT, FOREIGN KEY (dept_id) REFERENCES department(id));
      INSERT INTO department VALUES (1, 'CSE');
      INSERT INTO student VALUES (1, 1);
      SELECT * FROM student;
    `);
    expect(result.ok).toBe(true);
    expect(result.statements).toHaveLength(5);
  });

  it("still refuses to leave the student's own database", () => {
    expect(script("CREATE DATABASE mine;").ok).toBe(false);
    expect(script("USE mysql;").ok).toBe(false);
    expect(script("CREATE TABLE t (id INT); DROP DATABASE tcp_lab_x;").error).toContain("Statement 2");
    expect(script("GRANT ALL ON *.* TO 'x'@'%';").ok).toBe(false);
    expect(script("SELECT * FROM information_schema.tables;").ok).toBe(false);
    expect(script("SELECT LOAD_FILE('/etc/passwd');").ok).toBe(false);
    expect(script("SELECT SLEEP(30);").ok).toBe(false);
    expect(script("DELIMITER $$").ok).toBe(false);
  });

  it("matches the forbidden verb only at the head of a statement, so column names stay usable", () => {
    // A `use` column and a `drop` column are ordinary identifiers in a student-designed schema.
    expect(script("CREATE TABLE water (id INT, use VARCHAR(20), drop_count INT);").ok).toBe(true);
    expect(script("SELECT 'DROP DATABASE x' AS warning;").ok).toBe(true);
  });

  it("caps the statement count and the script length", () => {
    const many = Array.from({ length: 101 }, (_, index) => `SELECT ${index};`).join("\n");
    expect(script(many).error).toContain("at most 100 statements");
    expect(validateStudentScript("SELECT 1;", 4, 100).error).toContain("too large");
    expect(script("   ").ok).toBe(false);
  });
});

describe("validateSchemaSql", () => {
  it("accepts an ordinary seed, including an empty one for design-your-own experiments", () => {
    expect(validateSchemaSql("", 100_000).ok).toBe(true);
    expect(
      validateSchemaSql("CREATE TABLE students (id INT, name VARCHAR(50));\nINSERT INTO students VALUES (1,'Ada');", 100_000).ok,
    ).toBe(true);
  });

  it("rejects a pasted dump that would seed the wrong database", () => {
    const result = validateSchemaSql("CREATE DATABASE dbms_lab;\nUSE dbms_lab;\nCREATE TABLE students (id INT);", 100_000);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("CREATE DATABASE");
  });

  it("rejects a USE statement on its own, which sends the tables out of reach", () => {
    const result = validateSchemaSql("USE dbms_lab;\nCREATE TABLE students (id INT);", 100_000);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("USE statement");
  });

  it("rejects DELIMITER, file access and permission changes in a seed", () => {
    expect(validateSchemaSql("DELIMITER $$", 100_000).ok).toBe(false);
    expect(validateSchemaSql("LOAD DATA INFILE '/etc/passwd' INTO TABLE t;", 100_000).ok).toBe(false);
    expect(validateSchemaSql("GRANT ALL ON *.* TO 'x'@'%';", 100_000).ok).toBe(false);
  });

  it("rejects an oversized seed", () => {
    expect(validateSchemaSql("SELECT 1;", 4).error).toContain("too large");
  });
});
