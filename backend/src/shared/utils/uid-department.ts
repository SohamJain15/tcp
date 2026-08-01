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
