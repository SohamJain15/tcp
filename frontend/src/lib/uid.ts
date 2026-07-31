// TCET UID format: admission_year-branch+div+rollno-passout_year, e.g. 24-COMPA35-28
export const UID_REGEX = /^\d{2}-[A-Z]{2,8}[A-Z]\d{1,3}-\d{2}$/;

const UID_PARSE_REGEX = /^(\d{2})-([A-Z]+?)([A-Z])(\d{1,3})-(\d{2})$/;

export interface ParsedUid {
  admissionYear: string;
  branch: string;
  division: string;
  rollNumber: string;
  passoutYear: string;
}

export function parseUid(uid: string): ParsedUid | null {
  const match = UID_PARSE_REGEX.exec(uid.trim().toUpperCase());
  if (!match) {
    return null;
  }

  const [, admissionYear, branch, division, rollNumber, passoutYear] = match;
  return { admissionYear, branch, division, rollNumber, passoutYear };
}

// Branch code -> allowed department label(s). Mirrors the backend
// uid-department resolver; IOT covers both the IoT and CSE-IoT programmes.
const BRANCH_TO_DEPARTMENTS: Record<string, string[]> = {
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

/** Departments a UID is allowed to map to (empty if the UID/branch is unrecognised). */
export function departmentsForUid(uid: string): string[] {
  const parsed = parseUid(uid);
  if (!parsed) {
    return [];
  }
  return BRANCH_TO_DEPARTMENTS[parsed.branch.toUpperCase()] ?? [];
}
