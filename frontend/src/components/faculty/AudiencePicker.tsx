import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { classTestApi } from "@/api/services";
import { DEPARTMENTS, type Department } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemedSelect } from "@/components/ThemedSelect";

/**
 * The "who is in this group" picker, shared by class tests, lab sessions and lab attendance.
 *
 * Three near-identical copies of this existed; the security property lives on the server (only
 * students the filter returned can be assigned), but the shape of the filter has to match the
 * backend's `ClassTestAudienceFilter` exactly, and three copies is three chances to drift.
 */

/** No shared constant existed for these; they were hardcoded in two separate pages. */
export const DIVISIONS = ["A", "B", "C", "D", "E"] as const;

export const STUDENT_YEARS = [
  { value: "1", label: "1st Year" },
  { value: "2", label: "2nd Year" },
  { value: "3", label: "3rd Year" },
  { value: "4", label: "4th Year" },
] as const;

export interface AudienceFilterValue {
  department: Department | "";
  division: string;
  semester: string;
  year: string;
  rollFrom: string;
  rollTo: string;
}

export const EMPTY_AUDIENCE: AudienceFilterValue = {
  department: "",
  division: "ALL",
  semester: "ALL",
  year: "ALL",
  rollFrom: "",
  rollTo: "",
};

export interface AudiencePreviewStudent {
  email: string;
  name: string | null;
  uid: string | null;
  rollNumber: string | null;
  division: string | null;
}

/** The wire shape the backend's audience schema expects. */
export function toAudiencePayload(value: AudienceFilterValue) {
  return {
    department: value.department,
    division: value.division === "ALL" ? null : value.division,
    semester: value.semester === "ALL" ? null : Number(value.semester),
    year: value.year === "ALL" ? null : Number(value.year),
    rollFrom: value.rollFrom.trim() === "" ? null : Number(value.rollFrom),
    rollTo: value.rollTo.trim() === "" ? null : Number(value.rollTo),
  };
}

export interface AudiencePickerProps {
  value: AudienceFilterValue;
  onChange: (value: AudienceFilterValue) => void;
  /** Emails the faculty ticked. Empty means "everyone the filter found". */
  selectedEmails: string[];
  onSelectedEmailsChange: (emails: string[]) => void;
  pathname: string;
  title?: string;
  description?: string;
  /** Rendered inside the filter grid — e.g. a "Max violations" input a caller also needs. */
  extraFields?: React.ReactNode;
}

export function AudiencePicker({
  value,
  onChange,
  selectedEmails,
  onSelectedEmailsChange,
  pathname,
  title = "Who is in this group",
  description,
  extraFields,
}: AudiencePickerProps) {
  const [roster, setRoster] = useState<AudiencePreviewStudent[] | null>(null);

  const previewMutation = useMutation({
    mutationFn: () => classTestApi.previewAudience(toAudiencePayload(value), pathname),
    onSuccess: (response) => {
      const students = response.students as AudiencePreviewStudent[];
      setRoster(students);
      // Everyone found is ticked by default — assigning a whole batch is the common case.
      onSelectedEmailsChange(students.map((student) => student.email));
      if (students.length === 0) {
        toast.warning("No students match this filter");
      }
    },
    onError: (error: Error) => toast.error(error.message || "Could not load students"),
  });

  const set = (patch: Partial<AudienceFilterValue>) => onChange({ ...value, ...patch });
  const picked = new Set(selectedEmails);

  const toggle = (email: string, checked: boolean) => {
    const next = new Set(picked);
    if (checked) {
      next.add(email);
    } else {
      next.delete(email);
    }
    onSelectedEmailsChange(Array.from(next));
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label className="text-xs">Department</Label>
          <ThemedSelect
            value={value.department}
            placeholder="Select…"
            onValueChange={(next) => set({ department: next as Department })}
            options={DEPARTMENTS.map((department) => ({ value: department, label: department }))}
          />
        </div>
        <div>
          <Label className="text-xs">Year</Label>
          <ThemedSelect
            value={value.year}
            onValueChange={(next) => set({ year: next })}
            options={[{ value: "ALL", label: "All" }, ...STUDENT_YEARS.map((year) => ({ ...year }))]}
          />
        </div>
        <div>
          <Label className="text-xs">Division</Label>
          <ThemedSelect
            value={value.division}
            onValueChange={(next) => set({ division: next })}
            options={[
              { value: "ALL", label: "All" },
              ...DIVISIONS.map((division) => ({ value: division, label: division })),
            ]}
          />
        </div>
        <div>
          <Label className="text-xs">Semester</Label>
          <ThemedSelect
            value={value.semester}
            onValueChange={(next) => set({ semester: next })}
            options={[
              { value: "ALL", label: "All" },
              ...[1, 2, 3, 4, 5, 6, 7, 8].map((semester) => ({ value: String(semester), label: String(semester) })),
            ]}
          />
        </div>
        <div>
          <Label className="text-xs">Roll from</Label>
          <Input value={value.rollFrom} onChange={(event) => set({ rollFrom: event.target.value })} placeholder="optional" />
        </div>
        <div>
          <Label className="text-xs">Roll to</Label>
          <Input value={value.rollTo} onChange={(event) => set({ rollTo: event.target.value })} placeholder="optional" />
        </div>
        {extraFields}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!value.department || previewMutation.isPending}
          onClick={() => previewMutation.mutate()}
        >
          {previewMutation.isPending ? "Loading…" : "Find students"}
        </Button>
        <p className="text-xs text-muted-foreground">
          {roster
            ? `${roster.filter((student) => picked.has(student.email)).length} of ${roster.length} students selected.`
            : "Not previewed — everyone matching the filter is included."}
        </p>
        {roster && roster.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              onSelectedEmailsChange(
                picked.size === roster.length ? [] : roster.map((student) => student.email),
              )
            }
          >
            {picked.size === roster.length ? "Untick all" : "Tick all"}
          </Button>
        )}
      </div>

      {roster && roster.length > 0 && (
        <div className="max-h-64 space-y-1 overflow-y-auto rounded border border-border p-3">
          {roster.map((student) => (
            <label key={student.email} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={picked.has(student.email)}
                onCheckedChange={(checked) => toggle(student.email, checked === true)}
              />
              <span className="font-medium">{student.name ?? student.email}</span>
              <span className="text-xs text-muted-foreground">
                {student.rollNumber ?? "—"} · {student.division ?? "—"}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
