export function toFacultyStudentProfilePath(email: string): string {
  return `/faculty/students/${encodeURIComponent(email)}`;
}

