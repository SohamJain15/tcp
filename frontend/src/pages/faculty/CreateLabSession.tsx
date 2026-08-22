import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { labApi, labSessionApi } from "@/api/services";
import { DEPARTMENTS, type Department } from "@/api/types";
import { AppLayout } from "@/components/AppLayout";
import { ThemedSelect } from "@/components/ThemedSelect";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PATHNAME = "/faculty/lab-sessions/create";
const DIVISIONS = ["A", "B", "C", "D", "E"];

export default function CreateLabSession() {
  const navigate = useNavigate();
  const [labId, setLabId] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [startAt, setStartAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [department, setDepartment] = useState<Department | "">("");
  const [division, setDivision] = useState<string>("ALL");
  const [semester, setSemester] = useState<string>("ALL");
  const [rollFrom, setRollFrom] = useState("");
  const [rollTo, setRollTo] = useState("");
  const [maxViolations, setMaxViolations] = useState(1);

  const labsQuery = useQuery({ queryKey: ["faculty-labs"], queryFn: () => labApi.list(PATHNAME) });
  const labs = labsQuery.data?.items ?? [];
  const lab = useMemo(() => labs.find((item) => item.id === labId), [labs, labId]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const experimentIds = (lab?.experiments ?? []).filter((exp) => selected[exp.id]).map((exp) => exp.id);
      return labSessionApi.create(
        {
          labId,
          experimentIds,
          startAt: startAt ? new Date(startAt).toISOString() : "",
          durationMinutes: Number(durationMinutes),
          audience: {
            department,
            division: division === "ALL" ? null : division,
            semester: semester === "ALL" ? null : Number(semester),
            rollFrom: rollFrom.trim() === "" ? null : Number(rollFrom),
            rollTo: rollTo.trim() === "" ? null : Number(rollTo),
          },
          assignedEmails: [],
          maxViolations: Number(maxViolations),
          lifecycleState: "Published",
        },
        PATHNAME,
      );
    },
    onSuccess: () => {
      toast.success("Session scheduled");
      navigate("/faculty/lab-sessions");
    },
    onError: (error: Error) => toast.error(error.message || "Could not schedule the session"),
  });

  const chosenCount = Object.values(selected).filter(Boolean).length;
  const canSave = Boolean(labId) && chosenCount > 0 && Boolean(startAt) && Boolean(department);

  return (
    <AppLayout>
      <div className="container max-w-3xl space-y-6 px-3 py-5 sm:px-6 sm:py-8">
        <h1 className="font-display text-3xl font-bold">Schedule a lab session</h1>

        <Card className="space-y-4 p-5">
          <div>
            <Label className="text-xs">Lab</Label>
            <ThemedSelect
              value={labId}
              onValueChange={(value) => {
                setLabId(value);
                setSelected({});
              }}
              options={[
                { value: "", label: "Select a lab…" },
                ...labs.map((item) => ({ value: item.id, label: `${item.title} (${item.kind})` })),
              ]}
            />
          </div>

          {lab && (
            <div>
              <Label className="text-xs">Experiments to include</Label>
              <div className="space-y-1">
                {lab.experiments.map((experiment) => (
                  <label key={experiment.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selected[experiment.id] ?? false}
                      onCheckedChange={(checked) =>
                        setSelected((current) => ({ ...current, [experiment.id]: checked === true }))
                      }
                    />
                    {experiment.number}. {experiment.title} ({experiment.kind}, {experiment.points} marks)
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="text-xs">Start at</Label>
              <Input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Duration (minutes)</Label>
              <Input
                type="number"
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(Number(event.target.value.replace(/^0+(?=\d)/, "")))}
              />
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <p className="text-sm font-semibold">Who sits it</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="text-xs">Department</Label>
              <ThemedSelect
                value={department}
                onValueChange={(value) => setDepartment(value as Department)}
                options={[{ value: "", label: "Select…" }, ...DEPARTMENTS.map((dept) => ({ value: dept, label: dept }))]}
              />
            </div>
            <div>
              <Label className="text-xs">Division</Label>
              <ThemedSelect
                value={division}
                onValueChange={setDivision}
                options={[{ value: "ALL", label: "All" }, ...DIVISIONS.map((d) => ({ value: d, label: d }))]}
              />
            </div>
            <div>
              <Label className="text-xs">Semester</Label>
              <ThemedSelect
                value={semester}
                onValueChange={setSemester}
                options={[{ value: "ALL", label: "All" }, ...[1, 2, 3, 4, 5, 6, 7, 8].map((s) => ({ value: String(s), label: String(s) }))]}
              />
            </div>
            <div>
              <Label className="text-xs">Max violations</Label>
              <Input
                type="number"
                value={maxViolations}
                onChange={(event) => setMaxViolations(Number(event.target.value.replace(/^0+(?=\d)/, "")))}
              />
            </div>
            <div>
              <Label className="text-xs">Roll from</Label>
              <Input value={rollFrom} onChange={(event) => setRollFrom(event.target.value)} placeholder="optional" />
            </div>
            <div>
              <Label className="text-xs">Roll to</Label>
              <Input value={rollTo} onChange={(event) => setRollTo(event.target.value)} placeholder="optional" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Everyone matching this filter is assigned. {chosenCount} experiment{chosenCount === 1 ? "" : "s"} selected.
          </p>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate("/faculty/lab-sessions")}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSave || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? "Scheduling…" : "Schedule session"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
