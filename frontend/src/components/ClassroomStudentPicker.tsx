import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { classTestApi } from "@/api/services";
import type { Department } from "@/api/types";
import { DIVISIONS } from "@/components/faculty/AudiencePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemedSelect } from "@/components/ThemedSelect";

export function ClassroomStudentPicker({
  department,
  semester,
  selectedEmails,
  onChange,
}: {
  department: Department;
  semester: number;
  selectedEmails: string[] | null;
  onChange: (emails: string[] | null) => void;
}) {
  const [division, setDivision] = useState("ALL");
  const [rollFrom, setRollFrom] = useState("");
  const [rollTo, setRollTo] = useState("");
  const roster = useQuery({
    queryKey: [
      "classroom-student-candidates",
      department,
      semester,
      division,
      rollFrom,
      rollTo,
    ],
    queryFn: () =>
      classTestApi.previewAudience({
        department,
        semester,
        division: division === "ALL" ? null : division,
        year: null,
        rollFrom: rollFrom.trim() ? Number(rollFrom) : null,
        rollTo: rollTo.trim() ? Number(rollTo) : null,
      }),
    enabled: false,
  });
  const selected = new Set(selectedEmails ?? []);
  const students = roster.data?.students ?? [];
  const validRange =
    [rollFrom, rollTo].every((value) => !value || /^\d+$/.test(value)) &&
    (!rollFrom || !rollTo || Number(rollFrom) <= Number(rollTo));
  function toggle(email: string, checked: boolean) {
    const next = new Set(selected);
    checked ? next.add(email) : next.delete(email);
    onChange([...next]);
  }
  return (
    <section className="space-y-4" aria-labelledby="batch-students-heading">
      <div>
        <h2 id="batch-students-heading" className="text-lg font-semibold">
          Students in this lab batch
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Find students in {department}, semester {semester}, then select the
          students who belong to this batch. Selected students join using your
          lab workspace code.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={selectedEmails !== null}
          onChange={(e) => onChange(e.target.checked ? [] : null)}
        />
        Restrict this lab workspace to selected students
      </label>
      {selectedEmails !== null ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <p className="text-sm">Division</p>
              <ThemedSelect
                value={division}
                onValueChange={setDivision}
                options={[
                  { value: "ALL", label: "All divisions" },
                  ...DIVISIONS.map((value) => ({ value, label: value })),
                ]}
              />
            </div>
            <label className="space-y-1 text-sm">
              Roll number from
              <Input
                type="number"
                min={1}
                value={rollFrom}
                onChange={(e) => setRollFrom(e.target.value)}
                placeholder="e.g. 1"
              />
            </label>
            <label className="space-y-1 text-sm">
              Roll number to
              <Input
                type="number"
                min={1}
                value={rollTo}
                onChange={(e) => setRollTo(e.target.value)}
                placeholder="e.g. 35"
              />
            </label>
          </div>
          {!validRange && (
            <p role="alert" className="text-sm text-destructive">
              Enter a valid roll number range.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={roster.isFetching || !validRange}
              onClick={() => void roster.refetch()}
            >
              {roster.isFetching ? "Loading students…" : "Find students"}
            </Button>
            <span className="text-sm">
              {selected.size} students selected for this batch
            </span>
            {students.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  onChange([
                    ...new Set([
                      ...selected,
                      ...students.map((student) => student.email),
                    ]),
                  ])
                }
              >
                Select displayed students
              </Button>
            )}
            {selected.size > 0 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => onChange([])}
              >
                Clear selection
              </Button>
            )}
          </div>
          {roster.isError && (
            <p role="alert" className="text-sm text-destructive">
              {roster.error.message}
            </p>
          )}
          {roster.data && !students.length && (
            <p className="text-sm text-muted-foreground">
              No students match these filters.
            </p>
          )}
          {students.length > 0 && (
            <div className="max-h-96 overflow-auto rounded border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr>
                    <th className="p-3">Select</th>
                    <th className="p-3">Student name</th>
                    <th className="p-3">Roll number</th>
                    <th className="p-3">Division</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.email} className="border-t">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${student.name ?? student.email}`}
                          checked={selected.has(student.email)}
                          onChange={(e) =>
                            toggle(student.email, e.target.checked)
                          }
                        />
                      </td>
                      <td className="p-3">
                        <p>{student.name ?? student.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {student.email}
                        </p>
                      </td>
                      <td className="p-3">{student.rollNumber ?? "—"}</td>
                      <td className="p-3">{student.division ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Students outside your selection cannot join, even with the code.
            Removing an enrolled student from the selection revokes lab workspace
            access; saved session records remain.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Any student in this department and semester can join using the code.
          Enable selection to restrict enrollment to a specific batch.
        </p>
      )}
    </section>
  );
}
