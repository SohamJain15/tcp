export interface SqlPolicyResult {
  ok: boolean;
  error?: string;
}

/**
 * Remove literals and comments before checking a student query. This keeps a query such as
 * `SELECT 'DROP DATABASE'` valid while still detecting dangerous SQL tokens outside strings.
 */
function maskLiteralsAndComments(sql: string): string {
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
