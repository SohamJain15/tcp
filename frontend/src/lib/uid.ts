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
