import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { labApi } from "@/api/services";
import { DEPARTMENTS, type Department, type SqlResultSet } from "@/api/types";
import { AppLayout } from "@/components/AppLayout";
import { SqlResultTable } from "@/components/SqlWorkspace";
import { ThemedSelect } from "@/components/ThemedSelect";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const PATHNAME = "/faculty/labs/create";

interface SqlExperimentDraft {
  key: string;
  title: string;
  aim: string;
  points: number;
  schemaSql: string;
  solutionSql: string;
  ordered: boolean;
  preview?: SqlResultSet;
}

const blankExperiment = (): SqlExperimentDraft => ({
  key: `exp_${Math.random().toString(36).slice(2)}`,
  title: "",
  aim: "",
  points: 10,
  schemaSql: "CREATE TABLE example (id INT, name VARCHAR(50));\nINSERT INTO example VALUES (1, 'Ada');",
  solutionSql: "SELECT * FROM example;",
  ordered: false,
});

export default function CreateLab() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [kind, setKind] = useState<"DSA" | "DBMS">("DBMS");
  const [department, setDepartment] = useState<Department | "ALL">("ALL");
  const [semester, setSemester] = useState<string>("ALL");
  const [description, setDescription] = useState("");
  const [lifecycleState, setLifecycleState] = useState<"Draft" | "Published" | "Archived">("Draft");
  const [experiments, setExperiments] = useState<SqlExperimentDraft[]>([blankExperiment()]);

  const existing = useQuery({
    queryKey: ["faculty-lab", id],
    queryFn: () => labApi.get(id!, `/faculty/labs/${id}/edit`),
    enabled: isEdit,
  });

  useEffect(() => {
    const lab = existing.data?.lab;
    if (!lab) {
      return;
    }
    setTitle(lab.title);
    setSubject(lab.subject);
    setKind(lab.kind);
    setDepartment(lab.department ?? "ALL");
    setSemester(lab.semester ? String(lab.semester) : "ALL");
    setDescription(lab.description ?? "");
    setLifecycleState(lab.lifecycleState);
    const sqlExperiments = lab.experiments
      .filter((experiment) => experiment.kind === "sql")
      .map((experiment) => ({
        key: experiment.id,
        title: experiment.title,
        aim: experiment.aim,
        points: experiment.points,
        schemaSql: experiment.schemaSql ?? "",
        solutionSql: experiment.solutionSql ?? "",
        ordered: experiment.ordered ?? false,
      }));
    if (sqlExperiments.length > 0) {
      setExperiments(sqlExperiments);
    }
  }, [existing.data]);

  const previewMutation = useMutation({
    mutationFn: (experiment: SqlExperimentDraft) =>
      labApi.previewSql(
        { schemaSql: experiment.schemaSql, solutionSql: experiment.solutionSql, ordered: experiment.ordered },
        PATHNAME,
      ),
  });

  const updateExperiment = (key: string, patch: Partial<SqlExperimentDraft>) => {
    setExperiments((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const runPreview = async (experiment: SqlExperimentDraft) => {
    try {
      const result = await previewMutation.mutateAsync(experiment);
      updateExperiment(experiment.key, { preview: result.expected });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The reference query failed to run");
    }
  };

  const buildPayload = () => ({
    title,
    subject,
    kind,
    department: department === "ALL" ? null : department,
    semester: semester === "ALL" ? null : Number(semester),
    description: description.trim() === "" ? null : description,
    lifecycleState,
    experiments: experiments.map((experiment, index) => ({
      kind: "sql" as const,
      number: index + 1,
      title: experiment.title,
      aim: experiment.aim,
      points: Number(experiment.points),
      schemaSql: experiment.schemaSql,
      solutionSql: experiment.solutionSql,
      ordered: experiment.ordered,
    })),
  });

  const saveMutation = useMutation({
    mutationFn: () => (isEdit ? labApi.update(id!, buildPayload(), PATHNAME) : labApi.create(buildPayload(), PATHNAME)),
    onSuccess: () => {
      toast.success(isEdit ? "Lab updated" : "Lab created");
      navigate("/faculty/labs");
    },
    onError: (error: Error) => toast.error(error.message || "Could not save the lab"),
  });

  return (
    <AppLayout>
      <div className="container max-w-4xl space-y-6 px-3 py-5 sm:px-6 sm:py-8">
        <h1 className="font-display text-3xl font-bold">{isEdit ? "Edit lab" : "Create lab"}</h1>

        <Card className="space-y-4 p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="text-xs">Title</Label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="DBMS Practical Lab" />
            </div>
            <div>
              <Label className="text-xs">Subject</Label>
              <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Database Management Systems Lab" />
            </div>
            <div>
              <Label className="text-xs">Kind</Label>
              <ThemedSelect
                value={kind}
                onValueChange={(value) => setKind(value as "DSA" | "DBMS")}
                options={[
                  { value: "DBMS", label: "DBMS (SQL)" },
                  { value: "DSA", label: "DSA (coding)" },
                ]}
              />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <ThemedSelect
                value={lifecycleState}
                onValueChange={(value) => setLifecycleState(value as typeof lifecycleState)}
                options={["Draft", "Published", "Archived"].map((state) => ({ value: state, label: state }))}
              />
            </div>
            <div>
              <Label className="text-xs">Department</Label>
              <ThemedSelect
                value={department}
                onValueChange={(value) => setDepartment(value as Department | "ALL")}
                options={[{ value: "ALL", label: "All departments" }, ...DEPARTMENTS.map((dept) => ({ value: dept, label: dept }))]}
              />
            </div>
            <div>
              <Label className="text-xs">Semester</Label>
              <ThemedSelect
                value={semester}
                onValueChange={setSemester}
                options={[{ value: "ALL", label: "All semesters" }, ...[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => ({ value: String(sem), label: `Semester ${sem}` }))]}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} />
          </div>
          {kind === "DSA" && (
            <p className="text-xs text-muted-foreground">
              Note: coding-experiment authoring is coming next. For now, experiments below are SQL.
            </p>
          )}
        </Card>

        <div className="space-y-4">
          {experiments.map((experiment, index) => (
            <Card key={experiment.key} className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Experiment {index + 1}</p>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Remove experiment"
                  disabled={experiments.length <= 1}
                  onClick={() => setExperiments((current) => current.filter((item) => item.key !== experiment.key))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <Input
                  placeholder="Experiment title"
                  value={experiment.title}
                  onChange={(event) => updateExperiment(experiment.key, { title: event.target.value })}
                />
                <Input
                  type="number"
                  className="w-28"
                  value={experiment.points}
                  onChange={(event) => updateExperiment(experiment.key, { points: Number(event.target.value.replace(/^0+(?=\d)/, "")) })}
                />
              </div>
              <Textarea
                placeholder="Aim / task for the student"
                value={experiment.aim}
                rows={2}
                onChange={(event) => updateExperiment(experiment.key, { aim: event.target.value })}
              />
              <div>
                <Label className="text-xs">Schema + seed SQL (shown to students)</Label>
                <Textarea
                  className="font-mono-code"
                  rows={4}
                  value={experiment.schemaSql}
                  onChange={(event) => updateExperiment(experiment.key, { schemaSql: event.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Reference (solution) query — hidden from students</Label>
                <Textarea
                  className="font-mono-code"
                  rows={3}
                  value={experiment.solutionSql}
                  onChange={(event) => updateExperiment(experiment.key, { solutionSql: event.target.value })}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={experiment.ordered}
                    onCheckedChange={(checked) => updateExperiment(experiment.key, { ordered: checked === true })}
                  />
                  Row order matters (task uses ORDER BY)
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={previewMutation.isPending}
                  onClick={() => runPreview(experiment)}
                >
                  {previewMutation.isPending ? "Running…" : "Preview expected result"}
                </Button>
              </div>
              {experiment.preview && (
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Expected result:</p>
                  <SqlResultTable result={experiment.preview} />
                </div>
              )}
            </Card>
          ))}

          <Button type="button" variant="ghost" onClick={() => setExperiments((current) => [...current, blankExperiment()])}>
            + Experiment
          </Button>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate("/faculty/labs")}>
            Cancel
          </Button>
          <Button type="button" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Create lab"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
