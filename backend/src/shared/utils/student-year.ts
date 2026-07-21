export type StudentYear = 1 | 2 | 3 | 4;

export function deriveStudentYearFromSemester(semester: number | null | undefined): StudentYear | null {
  if (semester === null || semester === undefined || !Number.isFinite(semester)) {
    return null;
  }

  const normalized = Math.floor(semester);
  if (normalized < 1 || normalized > 8) {
    return null;
  }

  return Math.ceil(normalized / 2) as StudentYear;
}

export function matchesStudentYearSemester(semester: number | null | undefined, year: StudentYear | undefined): boolean {
  if (!year) {
    return true;
  }

  return deriveStudentYearFromSemester(semester) === year;
}

export function formatStudentYearLabel(year: StudentYear): string {
  switch (year) {
    case 1:
      return "1st Year";
    case 2:
      return "2nd Year";
    case 3:
      return "3rd Year";
    case 4:
      return "4th Year";
  }
}
