export interface SqlPolicyResult {
  ok: boolean;
  error?: string;
}

/**
 * Remove literals and comments before checking a student query. This keeps a query such as
 * `SELECT 'DROP DATABASE'` valid while still detecting dangerous SQL tokens outside strings.
 */
export function maskLiteralsAndComments(sql: string): string {
  let output = "";
  let quote: "'" | '"' | "`" | null = null;

  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index];
    const next = sql[index + 1] ?? "";

    if (quote) {
      output += " ";
      if (current === "\\") {
        output += " ";
        index += 1;
      } else if (current === quote) {
        if (sql[index + 1] === quote) {
          output += " ";
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (current === "'" || current === '"' || current === "`") {
      quote = current;
      output += " ";
      continue;
    }

    if (current === "#" || (current === "-" && next === "-" && /\s/.test(sql[index + 2] ?? ""))) {
      output += "  ";
      index += current === "#" ? 0 : 1;
      while (index + 1 < sql.length && sql[index + 1] !== "\n" && sql[index + 1] !== "\r") {
        output += " ";
        index += 1;
      }
      continue;
    }

    if (current === "/" && next === "*") {
      output += "  ";
      index += 2;
      while (index < sql.length && !(sql[index] === "*" && sql[index + 1] === "/")) {
        output += " ";
        index += 1;
      }
      if (index < sql.length) {
        output += "  ";
        index += 1;
      }
      continue;
    }

    output += current;
  }

  return output;
}

function hasMoreThanOneStatement(maskedSql: string): boolean {
  const semicolonPositions = [...maskedSql].reduce<number[]>((positions, character, index) => {
    if (character === ";") {
      positions.push(index);
    }
    return positions;
  }, []);

  if (semicolonPositions.length === 0) {
    return false;
  }

  const lastSemicolon = semicolonPositions[semicolonPositions.length - 1];
  return maskedSql.slice(lastSemicolon + 1).trim() !== "" || semicolonPositions.length > 1;
}

const forbiddenPatterns: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /\b(?:grant|revoke)\b/i, message: "Permission-management statements are not allowed." },
  { pattern: /\b(?:create|alter|drop|rename)\s+user\b/i, message: "User-management statements are not allowed." },
  { pattern: /\b(?:create|drop)\s+database\b/i, message: "Database-management statements are not allowed." },
  { pattern: /\b(?:use|flush|shutdown|install|uninstall)\b/i, message: "Server-level statements are not allowed." },
  { pattern: /\bset\s+(?:global|persist)\b/i, message: "Global server settings cannot be changed." },
  { pattern: /\b(?:load_file|load\s+data|into\s+(?:out|dump)file)\b/i, message: "File-system access is not allowed." },
  { pattern: /\b(?:create\s+(?:procedure|function|trigger|event)|alter\s+(?:procedure|function|event)|call)\b/i, message: "Stored-program execution is not allowed." },
  { pattern: /\b(?:show\s+(?:databases|schemas|grants)|information_schema|performance_schema|mysql\.|sys\.)\b/i, message: "System metadata is not available in the SQL sandbox." },
  { pattern: /\b(?:sleep|benchmark)\s*\(/i, message: "Artificial delay and resource-amplification functions are not allowed." },
];

export function validateStudentSql(sql: string, maxLength: number): SqlPolicyResult {
  const trimmed = sql.trim();
  if (!trimmed) {
    return { ok: false, error: "Write a query first." };
  }
  if (trimmed.length > maxLength) {
    return { ok: false, error: `Query is too large. The maximum length is ${maxLength} characters.` };
  }

  const masked = maskLiteralsAndComments(trimmed);
  if (hasMoreThanOneStatement(masked)) {
    return { ok: false, error: "Only one SQL statement may be executed per request." };
  }

  const dangerous = forbiddenPatterns.find(({ pattern }) => pattern.test(masked));
  if (dangerous) {
    return { ok: false, error: dangerous.message };
  }

  return { ok: true };
}

export function validateSqlTextLength(sql: string, maxLength: number, label: string): SqlPolicyResult {
  if (sql.length > maxLength) {
    return { ok: false, error: `${label} is too large. The maximum length is ${maxLength} characters.` };
  }
  return { ok: true };
}

/**
 * Statements that are forbidden by the verb they *open* with. Matching the leading keyword rather
 * than any occurrence keeps a legitimate `use` or `drop` column name from being rejected, which
 * matters for application experiments where students name their own columns.
 */
const forbiddenLeadingStatements: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /^(?:grant|revoke)\b/i, message: "Permission-management statements are not allowed." },
  {
    pattern: /^(?:create|alter|drop|rename)\s+user\b/i,
    message: "User-management statements are not allowed.",
  },
  {
    pattern: /^(?:create|drop|alter)\s+(?:database|schema)\b/i,
    message: "You already have your own database — create tables inside it instead of a new database.",
  },
  {
    pattern: /^(?:use|flush|shutdown|install|uninstall|reset|purge|kill)\b/i,
    message: "Server-level statements are not allowed. Your statements already run inside your own database.",
  },
  { pattern: /^set\s+(?:global|persist)\b/i, message: "Global server settings cannot be changed." },
  { pattern: /^delimiter\b/i, message: "DELIMITER is a client-side command and is not supported here." },
  {
    pattern: /^show\s+(?:databases|schemas|grants)\b/i,
    message: "System metadata is not available in the SQL sandbox.",
  },
  { pattern: /^load\s+data\b/i, message: "File-system access is not allowed." },
];

/**
 * Constructs that are dangerous wherever they appear, not only at the head of a statement — a
 * subquery reading `information_schema` or a `SLEEP()` buried in a WHERE clause.
 */
const forbiddenAnywherePatterns: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /\b(?:load_file\s*\(|into\s+(?:out|dump)file\b)/i, message: "File-system access is not allowed." },
  {
    pattern: /\b(?:information_schema|performance_schema)\s*\.|\bmysql\s*\.\s*\w|\bsys\s*\.\s*\w/i,
    message: "System metadata is not available in the SQL sandbox.",
  },
  {
    pattern: /\b(?:sleep|benchmark)\s*\(/i,
    message: "Artificial delay and resource-amplification functions are not allowed.",
  },
];

/** Returns the first policy violation in one already-masked statement, or undefined. */
function statementViolation(maskedStatement: string): string | undefined {
  const trimmed = maskedStatement.trim();
  const leading = forbiddenLeadingStatements.find(({ pattern }) => pattern.test(trimmed));
  if (leading) {
    return leading.message;
  }
  return forbiddenAnywherePatterns.find(({ pattern }) => pattern.test(trimmed))?.message;
}

/**
 * Split a masked script on its top-level semicolons, mapping each fragment back to the original
 * text. Masking runs first so a semicolon inside a string literal or comment never splits.
 */
function splitMaskedStatements(sql: string): Array<{ sql: string; masked: string }> {
  const masked = maskLiteralsAndComments(sql);
  const statements: Array<{ sql: string; masked: string }> = [];
  let start = 0;
  const push = (end: number) => {
    // The mask is character-aligned with the source, so the same slice bounds apply to both.
    if (sql.slice(start, end).trim() !== "") {
      statements.push({ sql: sql.slice(start, end).trim(), masked: masked.slice(start, end).trim() });
    }
  };
  for (let index = 0; index < masked.length; index += 1) {
    if (masked[index] !== ";") {
      continue;
    }
    push(index);
    start = index + 1;
  }
  push(sql.length);
  return statements;
}

export function splitSqlStatements(sql: string): string[] {
  return splitMaskedStatements(sql).map((statement) => statement.sql);
}

/**
 * Validate a multi-statement script for an application-based experiment (DDL, DML, constraints,
 * a mini-project schema). Unlike {@link validateStudentSql} this permits many statements and the
 * full table-level surface, because the student owns the whole throwaway database — only the
 * statements that reach beyond it stay blocked.
 */
export function validateStudentScript(
  sql: string,
  maxLength: number,
  maxStatements: number,
): SqlPolicyResult & { statements?: string[] } {
  const trimmed = sql.trim();
  if (!trimmed) {
    return { ok: false, error: "Write at least one statement first." };
  }
  if (trimmed.length > maxLength) {
    return { ok: false, error: `Script is too large. The maximum length is ${maxLength} characters.` };
  }

  const statements = splitMaskedStatements(trimmed);
  if (statements.length === 0) {
    return { ok: false, error: "Write at least one statement first." };
  }
  if (statements.length > maxStatements) {
    return { ok: false, error: `A script may contain at most ${maxStatements} statements.` };
  }
  for (const [index, statement] of statements.entries()) {
    const violation = statementViolation(statement.masked);
    if (violation) {
      return { ok: false, error: `Statement ${index + 1}: ${violation}` };
    }
  }
  return { ok: true, statements: statements.map((statement) => statement.sql) };
}

/**
 * Validate faculty-authored seed SQL at authoring time. A pasted dump that opens with
 * `CREATE DATABASE x; USE x;` seeds its tables into the wrong schema, and every student query then
 * fails with "table doesn't exist" — a failure that is impossible to diagnose from the student's
 * side. Rejecting it when the classroom is saved is the only place it can be caught usefully.
 */
export function validateSchemaSql(sql: string, maxLength: number): SqlPolicyResult {
  const length = validateSqlTextLength(sql, maxLength, "Schema SQL");
  if (!length.ok) {
    return length;
  }
  if (sql.trim() === "") {
    return { ok: true };
  }

  for (const [index, statement] of splitMaskedStatements(sql).entries()) {
    if (/^(?:create|drop|alter)\s+(?:database|schema)\b/i.test(statement.masked)) {
      return {
        ok: false,
        error:
          "Remove CREATE DATABASE / DROP DATABASE from the seed. Every student already gets their own empty database, so seed the tables directly into it.",
      };
    }
    if (/^use\b/i.test(statement.masked)) {
      return {
        ok: false,
        error:
          "Remove the USE statement from the seed. The seed already runs inside the student's own database, and USE would send the tables somewhere the student cannot reach.",
      };
    }
    const violation = statementViolation(statement.masked);
    if (violation) {
      return { ok: false, error: `Seed statement ${index + 1}: ${violation}` };
    }
  }
  return { ok: true };
}
