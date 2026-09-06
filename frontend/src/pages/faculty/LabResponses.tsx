import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { labApi } from "@/api/services";
import { toStatusLabel } from "@/api/mappers";
import type { SubmissionStatus } from "@/api/types";
import { AppLayout } from "@/components/AppLayout";
import { SubmittedAnswerSheet } from "@/components/faculty/SubmittedAnswerSheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThemedSelect } from "@/components/ThemedSelect";
import { cn } from "@/lib/utils";

/**
 * What students actually answered in one lab.
 *
 * A student × experiment grid: every student who has submitted anything is a row, every experiment
 * a column, each cell their marks. Clicking a cell opens the submitted query or source.
 *
 * Students who never attempted are absent rather than shown as empty rows — who *should* have been
 * present is a property of the lab attendance session, not of the lab.
 */
export default function LabResponses() {
  const { id = "" } = useParams();
  const pathname = `/faculty/labs/${id}/responses`;
  const [experimentFilter, setExperimentFilter] = useState("all");
  const [unsolvedOnly, setUnsolvedOnly] = useState(false);
  const [openCell, setOpenCell] = useState<{ experimentId: string; email: string; name: string } | null>(null);

  const labQuery = useQuery({
    queryKey: ["faculty-lab", id],
    queryFn: () => labApi.get(id, pathname),
    enabled: Boolean(id),
  });

  const responsesQuery = useQuery({
    queryKey: ["faculty-lab-responses", id],
    queryFn: () => labApi.listResponses(id, undefined, pathname),
    enabled: Boolean(id),
  });

  const detailQuery = useQuery({
    queryKey: ["faculty-lab-response", id, openCell?.experimentId, openCell?.email],
    queryFn: () => labApi.getResponse(id, openCell!.experimentId, openCell!.email, pathname),
    enabled: Boolean(openCell),
  });

  const lab = labQuery.data?.lab;
  const rows = responsesQuery.data?.items ?? [];

  const experiments = useMemo(
    () =>
      (lab?.experiments ?? [])
        .filter((experiment) => experimentFilter === "all" || experiment.id === experimentFilter)
        .sort((left, right) => left.number - right.number),
    [lab, experimentFilter],
  );

  /** One row per student, with their cell for each experiment. */
  const students = useMemo(() => {
    const byStudent = new Map<
      string,
      { email: string; name: string; rollNumber: string | null; division: string | null; cells: Map<string, (typeof rows)[number]> }
    >();
    for (const row of rows) {
      const existing = byStudent.get(row.userEmail) ?? {
        email: row.userEmail,
        name: row.userName ?? row.userEmail,
        rollNumber: row.rollNumber,
        division: row.division,
        cells: new Map<string, (typeof rows)[number]>(),
      };
      existing.cells.set(row.experimentId, row);
      byStudent.set(row.userEmail, existing);
    }
    return Array.from(byStudent.values())
      .filter((student) =>
        unsolvedOnly ? experiments.some((experiment) => !student.cells.get(experiment.id)?.passed) : true,
      )
      .sort((left, right) => Number(left.rollNumber ?? 0) - Number(right.rollNumber ?? 0));
  }, [rows, experiments, unsolvedOnly]);

  const detail = detailQuery.data?.response;

  if (labQuery.isLoading || !lab) {
    return (
      <AppLayout>
        <div className="container py-8 text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container space-y-6 px-3 py-5 sm:px-6 sm:py-8">
        <div>
          <Link to="/faculty/labs" className="text-sm text-muted-foreground hover:underline">
            ← All labs
          </Link>
          <p className="mt-2 text-sm font-semibold uppercase tracking-widest text-accent">{lab.subject}</p>
          <h1 className="mt-1 font-display text-3xl font-bold">{lab.title} — responses</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <ThemedSelect
            value={experimentFilter}
            onValueChange={setExperimentFilter}
            triggerClassName="h-9 w-auto min-w-[220px] text-sm"
            options={[
              { value: "all", label: "All experiments" },
              ...[...lab.experiments]
                .sort((left, right) => left.number - right.number)
                .map((experiment) => ({
                  value: experiment.id,
                  label: `${experiment.number}. ${experiment.title}`,
                })),
            ]}
          />
          <Button variant={unsolvedOnly ? "default" : "outline"} size="sm" onClick={() => setUnsolvedOnly((on) => !on)}>
            {unsolvedOnly ? "Showing unsolved only" : "Show unsolved only"}
          </Button>
          <span className="text-sm text-muted-foreground">
            {students.length} student{students.length === 1 ? "" : "s"} with submissions
          </span>
        </div>

        <Card className="profile-card overflow-hidden">
          {/* Wide grids scroll inside the card rather than making the page scroll sideways. */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="border-b border-border px-3 py-2 text-left font-semibold">Roll</th>
                  <th className="border-b border-border px-3 py-2 text-left font-semibold">Student</th>
                  {experiments.map((experiment) => (
                    <th
                      key={experiment.id}
                      className="border-b border-border px-3 py-2 text-left font-semibold"
                      title={experiment.title}
                    >
                      {experiment.number}. {experiment.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.email} className="odd:bg-muted/20">
                    <td className="border-b border-border px-3 py-2">{student.rollNumber ?? "—"}</td>
                    <td className="border-b border-border px-3 py-2">
                      <div className="font-medium">{student.name}</div>
                      <div className="text-xs text-muted-foreground">{student.email}</div>
                    </td>
                    {experiments.map((experiment) => {
                      const cell = student.cells.get(experiment.id);
                      return (
                        <td key={experiment.id} className="border-b border-border px-3 py-2">
                          {cell ? (
                            <button
                              type="button"
                              onClick={() =>
                                setOpenCell({
                                  experimentId: experiment.id,
                                  email: student.email,
                                  name: student.name,
                                })
                              }
                              className={cn(
                                "rounded px-2 py-1 text-left text-xs underline-offset-2 hover:underline",
                                cell.passed ? "text-emerald-600" : "text-amber-600",
                              )}
                            >
                              {cell.awardedPoints}/{cell.maxPoints}
                              <span className="ml-1 text-muted-foreground">
                                {cell.passed ? "✓" : toStatusLabel(cell.status as SubmissionStatus)}
                              </span>
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {students.length === 0 && (
                  <tr>
                    <td colSpan={experiments.length + 2} className="px-3 py-6 text-center text-muted-foreground">
                      {responsesQuery.isLoading ? "Loading…" : "No submissions yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <SubmittedAnswerSheet
        open={Boolean(openCell)}
        onOpenChange={(open) => !open && setOpenCell(null)}
        title={detail?.experimentTitle ?? "Submitted answer"}
        subtitle={openCell ? `${openCell.name} · ${openCell.email}` : undefined}
        loading={detailQuery.isLoading}
        facts={
          detail
            ? detail.kind === "sql"
              ? [
                  { label: "Marks", value: `${detail.awardedPoints}/${detail.maxPoints}` },
                  {
                    label: "Verdict",
                    value: detail.passed ? "Correct" : toStatusLabel(detail.status as SubmissionStatus),
                    tone: detail.passed ? ("ok" as const) : ("warn" as const),
                  },
                ]
              : [
                  {
                    label: "Tests",
                    value: detail.latest ? `${detail.latest.passedCount}/${detail.latest.totalCount}` : "—",
                  },
                  {
                    label: "Verdict",
                    value: detail.latest ? toStatusLabel(detail.latest.status as SubmissionStatus) : "Not attempted",
                    tone:
                      detail.latest && detail.latest.passedCount === detail.latest.totalCount
                        ? ("ok" as const)
                        : ("warn" as const),
                  },
                ]
            : []
        }
        body={
          detail
            ? detail.kind === "sql"
              ? detail.studentSql
                ? { language: "sql", code: detail.studentSql }
                : null
              : detail.latest
                ? { language: detail.latest.language, code: detail.latest.code }
                : null
            : null
        }
        history={detail?.kind === "coding" ? detail.history : []}
      />
    </AppLayout>
  );
}
