import type { Department } from "../types/domain";

/**
 * TCET UID format: `JoinYear-BranchDivRollno-PassYear`, e.g. `24-AIDSA49-28`.
 * The middle segment is `<BRANCH><DIV><ROLL>` where BRANCH is a department code
 * (letters), DIV is a single letter, ROLL is digits. We only need the BRANCH code,
 * which we read as the longest known code the middle segment starts with.
 */

// Branch code -> the department(s) it is allowed to map to. Codes are matched
// case-insensitively. `IOT` covers both the IoT and CSE-IoT programmes (per spec
// they are the same). Aliases containing "&" never appear in a UID, so only the
// clean forms are listed.
const CODE_TO_DEPARTMENTS: Record<string, Department[]> = {
  COMP: ["B.E. Computer Engineering"],
  IT: ["B.E. Information Technology"],
  AIML: ["B.Tech – Artificial Intelligence & Machine Learning"],
  AIDS: ["B.Tech – Artificial Intelligence & Data Science"],
  ENTC: ["B.E. Electronics & Tele-Communication"],
  ECS: ["B.E. Electronics and Computer Science"],
  MECH: ["B.E. Mechanical Engineering"],
  CIVIL: ["B.E. Civil Engineering"],
  CSE: ["B.E. Computer Science and Engineering (Cyber Security)"],
  MME: ["B.E. Mechanical and Mechatronics Engineering (Additive Manufacturing)"],
  IOT: [
    "B.Tech – Internet of Things (IoT)",
    "B.Tech – Computer Science & Engineering (CSE-IOT)",
  ],
};

// Longest first so e.g. "CIVIL" is matched before any shorter code could shadow it.
const CODES_BY_LENGTH = Object.keys(CODE_TO_DEPARTMENTS).sort((a, b) => b.length - a.length);

export interface UidBranch {
  /** The recognised branch code (canonical uppercase key), or null if unparseable. */
  code: string | null;
  /** Departments this UID is allowed to belong to (empty if unrecognised). */
  departments: Department[];
}

/** Extract the branch code + allowed departments from a UID. */
export function resolveUidBranch(uid: string | null | undefined): UidBranch {
  const value = (uid ?? "").trim();
  if (!value) {
    return { code: null, departments: [] };
  }
  const parts = value.split("-");
  // A well-formed UID has three parts; the middle holds the branch code.
  const middle = (parts.length >= 3 ? parts[1] : parts[0]).toUpperCase();
  for (const code of CODES_BY_LENGTH) {
    if (middle.startsWith(code)) {
      return { code, departments: CODE_TO_DEPARTMENTS[code] };
    }
  }
  return { code: null, departments: [] };
}

/**
 * Whether a UID's branch code is consistent with the chosen department.
 * Returns false when the UID has no recognisable branch (an invalid UID) or when
 * the branch maps to a different department.
 */
export function uidMatchesDepartment(uid: string | null | undefined, department: string | null | undefined): boolean {
  if (!department) {
    return false;
  }
  const { departments } = resolveUidBranch(uid);
  return departments.includes(department as Department);
}

/** Human-readable list of departments a UID is allowed to belong to. */
export function departmentsForUid(uid: string | null | undefined): Department[] {
  return resolveUidBranch(uid).departments;
}

/**
 * Division letter from a UID, e.g. `24-AIDSA49-28` -> `"A"`.
 *
 * The division sits between the branch code and the roll number, so it is found by
 * stripping the branch prefix and taking the next letter — the same decomposition
 * `deriveRollNumberFromUid` relies on. Returns null when the UID is malformed or its
 * branch is unrecognised, which callers treat as "does not match any division".
 */
export function deriveDivisionFromUid(uid: string | null | undefined): string | null {
  const value = (uid ?? "").trim();
  if (!value) {
    return null;
  }

  const { code } = resolveUidBranch(value);
  if (!code) {
    return null;
  }

  const parts = value.split("-");
  const middle = (parts.length >= 3 ? parts[1] : parts[0]).toUpperCase();
  const division = middle.charAt(code.length);
  // Must be a letter followed by the roll digits; anything else is a malformed UID.
  return /^[A-Z]$/.test(division) && /^\d+$/.test(middle.slice(code.length + 1)) ? division : null;
}

/** Odd semesters (1, 3, 5, 7) begin in July; even ones in January. */
const ODD_SEMESTER_START_MONTH = 7;
/** Shortest and longest plausible programme, in years. Guards against a corrupt pass year. */
const MIN_PROGRAMME_YEARS = 1;
const MAX_PROGRAMME_YEARS = 6;
const SEMESTERS_PER_YEAR = 2;
const FINAL_SEMESTER = 8;

/** Both years a UID carries: `24-AIDSA60-28` -> joined 2024, passes out 2028. */
function resolveUidYears(uid: string): { joinYear: number; passYear: number } | null {
  const parts = uid.trim().split("-");
  if (parts.length < 3) {
    return null;
  }

  const join = Number(parts[0]);
  const pass = Number(parts[parts.length - 1]);
  if (!/^\d{2}$/.test(parts[0]) || !/^\d{2}$/.test(parts[parts.length - 1])) {
    return null;
  }

  return { joinYear: 2000 + join, passYear: 2000 + pass };
}

/**
 * The semester a student is currently in, derived from their UID.
 *
 * Every engineering programme here ends at semester 8, so the *pass* year tells us where a
 * student starts: a four-year UID (`24-…-28`) begins at semester 1, while a three-year
 * lateral-entry one (`25-…-28`) begins at semester 3. That is why a DSE student and the batch
 * they sit with always land on the same semester — they finish together, so they progress
 * together.
 *
 * Nothing but the two years is consulted: branch, division and roll number never affect the
 * result. Returns null for a UID that cannot be parsed, or one claiming an implausible
 * programme length, so a bad UID fails closed rather than producing a confident wrong answer.
 */
export function deriveSemesterFromUid(uid: string | null | undefined, now: Date): number | null {
  const value = (uid ?? "").trim();
  if (!value) {
    return null;
  }

  // Reuse the branch check so anything that is not a real TCET UID is rejected here too.
  if (!resolveUidBranch(value).code || deriveDivisionFromUid(value) === null) {
    return null;
  }

  const years = resolveUidYears(value);
  if (!years) {
    return null;
  }

  const programmeYears = years.passYear - years.joinYear;
  if (programmeYears < MIN_PROGRAMME_YEARS || programmeYears > MAX_PROGRAMME_YEARS) {
    return null;
  }

  // A shorter programme means the student joined further along: 4 years -> sem 1, 3 years -> sem 3.
  const startSemester = FINAL_SEMESTER + 1 - programmeYears * SEMESTERS_PER_YEAR;

  // Semesters completed since joining. Before July the student is still in the even (spring)
  // semester that began in January, hence the -1.
  const elapsed =
    (now.getUTCFullYear() - years.joinYear) * SEMESTERS_PER_YEAR +
    (now.getUTCMonth() + 1 >= ODD_SEMESTER_START_MONTH ? 0 : -1);

  // Clamped so a student who has graduated stays at 8 rather than running off the scale.
  return Math.min(FINAL_SEMESTER, Math.max(1, startSemester + elapsed));
}
