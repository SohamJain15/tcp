import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { labApi } from "@/api/services";
import { classroomApi, newRequestKey, type ScheduleDraft } from "@/api/classrooms";
import { ClassroomScheduleEditor, newSchedule } from "@/components/ClassroomScheduleEditor";
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
import { copyTextToClipboard } from "@/lib/clipboard";

const PATHNAME = "/faculty/labs/create";
const CODING_LANGUAGES = ["c", "cpp", "java", "python", "javascript", "typescript", "go", "kotlin"];

interface TestCaseDraft {
  input: string;
  output: string;
}

interface ExperimentDraft {
  key: string;
  kind: "sql" | "coding";
  title: string;
  aim: string;
  points: number;
  // sql
  schemaSql: string;
  solutionSql: string;
  ordered: boolean;
  preview?: SqlResultSet;
  // coding
  difficulty: "Easy" | "Medium" | "Hard";
  supportedLanguages: string[];
  constraints: string;
  inputFormat: string;
  outputFormat: string;
  timeLimitSeconds: number;
  memoryLimitMb: number;
  sampleTestCases: TestCaseDraft[];
  hiddenTestCases: TestCaseDraft[];
}

const emptyCase = (): TestCaseDraft => ({ input: "", output: "" });

function blankExperiment(kind: "sql" | "coding"): ExperimentDraft {
  return {
    key: `exp_${Math.random().toString(36).slice(2)}`,
    kind,
    title: "",
    aim: "",
    points: 100,
    schemaSql: "CREATE TABLE example (id INT, name VARCHAR(50));\nINSERT INTO example VALUES (1, 'Ada');",
    solutionSql: "SELECT * FROM example;",
    ordered: false,
    difficulty: "Easy",
    supportedLanguages: ["python"],
    constraints: "",
    inputFormat: "",
    outputFormat: "",
    timeLimitSeconds: 2,
    memoryLimitMb: 256,
    sampleTestCases: [emptyCase()],
    hiddenTestCases: [emptyCase()],
  };
}

const stripZero = (value: string) => Number(value.replace(/^0+(?=\d)/, ""));

const LAB_EXPERIMENTS_EXAMPLE_JSON = `[
  {
    "kind": "sql",
    "title": "List all students",
    "aim": "Select every student ordered by id.",
    "points": 10,
    "schemaSql": "CREATE TABLE students (id INT, name VARCHAR(50));\\nINSERT INTO students VALUES (1,'Ada'),(2,'Alan');",
    "solutionSql": "SELECT id, name FROM students ORDER BY id;",
    "ordered": true
  },
  {
    "kind": "coding",
    "title": "Echo a number",
    "aim": "Read an integer and print it.",
    "points": 20,
    "difficulty": "Easy",
    "supportedLanguages": ["python", "cpp"],
    "constraints": "",
    "inputFormat": "",
    "outputFormat": "",
    "timeLimitSeconds": 2,
    "memoryLimitMb": 256,
    "sampleTestCases": [{ "input": "5", "output": "5" }],
    "hiddenTestCases": [{ "input": "9", "output": "9" }]
  }
]`;

/** Parses a JSON array of experiments into editable drafts. Lenient — fills sensible defaults. */
function parseLabExperiments(source: string): { experiments?: ExperimentDraft[]; error?: string } {
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid JSON" };
  }
  const items = Array.isArray(data) ? data : [data];
  if (items.length === 0) {
    return { error: "Provide at least one experiment" };
  }
  const experiments: ExperimentDraft[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item || typeof item !== "object") {
      return { error: `Experiment ${index + 1} is not an object` };
    }
    const record = item as Record<string, unknown>;
    if (record.kind !== "sql" && record.kind !== "coding") return { error: `Experiment ${index + 1} must specify kind sql or coding` };
    const kind = record.kind === "coding" ? "coding" : "sql";
    const base = blankExperiment(kind);
    const cases = (value: unknown): TestCaseDraft[] =>
      Array.isArray(value)
        ? value.map((entry) => {
            const testCase = entry as Record<string, unknown>;
            return { input: String(testCase.input ?? ""), output: String(testCase.output ?? "") };
          })
        : [emptyCase()];
    experiments.push({
      ...base,
      title: String(record.title ?? ""),
      aim: String(record.aim ?? ""),
      points: Number(record.points ?? base.points),
      schemaSql: String(record.schemaSql ?? base.schemaSql),
      solutionSql: String(record.solutionSql ?? base.solutionSql),
      ordered: record.ordered === true,
      difficulty: (record.difficulty as ExperimentDraft["difficulty"]) ?? "Easy",
      supportedLanguages: Array.isArray(record.supportedLanguages)
        ? record.supportedLanguages.map(String)
        : base.supportedLanguages,
      constraints: String(record.constraints ?? ""),
      inputFormat: String(record.inputFormat ?? ""),
      outputFormat: String(record.outputFormat ?? ""),
      timeLimitSeconds: Number(record.timeLimitSeconds ?? base.timeLimitSeconds),
      memoryLimitMb: Number(record.memoryLimitMb ?? base.memoryLimitMb),
      sampleTestCases: cases(record.sampleTestCases),
      hiddenTestCases: cases(record.hiddenTestCases),
    });
  }
  return { experiments };
}

export default function CreateLab() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [kind, setKind] = useState<"DSA" | "DBMS">("DBMS");
  const [department, setDepartment] = useState<Department>(DEPARTMENTS[0]);
  const [semester, setSemester] = useState<string>("1");
  const [batch, setBatch] = useState("");
  const [requestKey] = useState(newRequestKey);
  const [sessions, setSessions] = useState<ScheduleDraft[]>([]);
  const [description, setDescription] = useState("");
  const [lifecycleState, setLifecycleState] = useState<"Draft" | "Published" | "Archived">("Published");
  const [experiments, setExperiments] = useState<ExperimentDraft[]>([blankExperiment("sql")]);
  const [showImport, setShowImport] = useState(false);
  const [jsonSource, setJsonSource] = useState("");

  const importFromJson = () => {
    const { experiments: parsed, error } = parseLabExperiments(jsonSource);
    if (error || !parsed) {
      toast.error(error ?? "Could not parse the JSON");
      return;
    }
    if (parsed.some(e => e.kind !== (kind === "DBMS" ? "sql" : "coding"))) {
      toast.error("Every experiment must match the classroom kind"); return;
    }
    setExperiments(parsed);
    setShowImport(false);
    setJsonSource("");
    toast.success(`${parsed.length} experiment${parsed.length === 1 ? "" : "s"} imported`);
  };

  const existing = useQuery({
    queryKey: ["faculty-lab", id],
    queryFn: () => classroomApi.get(id!),
    enabled: isEdit,
  });

  useEffect(() => {
    const lab = existing.data?.classroom;
    if (!lab) {
      return;
    }
    setTitle(lab.title);
    setSubject(lab.subject);
    setKind(lab.kind);
    setDepartment(lab.department);
    setSemester(String(lab.semester));
    setBatch(lab.batch);
    setDescription(lab.description ?? "");
    setLifecycleState(lab.lifecycleState);
    if (lab.experiments.length > 0) {
      setExperiments(
        lab.experiments.map((experiment) => ({
          ...blankExperiment(experiment.kind === "coding" ? "coding" : "sql"),
          key: experiment.id,
          kind: experiment.kind === "coding" ? "coding" : "sql",
          title: experiment.title,
          aim: experiment.aim,
          points: experiment.points,
          schemaSql: experiment.schemaSql ?? "",
          solutionSql: experiment.solutionSql ?? "",
          ordered: experiment.ordered ?? false,
          difficulty: experiment.difficulty ?? "Easy",
          supportedLanguages: experiment.supportedLanguages ?? ["python"],
          constraints: experiment.constraints ?? "",
          inputFormat: experiment.inputFormat ?? "",
          outputFormat: experiment.outputFormat ?? "",
          timeLimitSeconds: experiment.timeLimitSeconds ?? 2,
          memoryLimitMb: experiment.memoryLimitMb ?? 256,
          sampleTestCases: experiment.sampleTestCases?.map((tc) => ({ input: tc.input, output: tc.output })) ?? [emptyCase()],
          hiddenTestCases: experiment.hiddenTestCases?.map((tc) => ({ input: tc.input, output: tc.output })) ?? [emptyCase()],
        })),
      );
    }
  }, [existing.data]);

  const previewMutation = useMutation({
    mutationFn: (experiment: ExperimentDraft) =>
      labApi.previewSql(
        { schemaSql: experiment.schemaSql, solutionSql: experiment.solutionSql, ordered: experiment.ordered },
        PATHNAME,
      ),
  });

  const updateExperiment = (key: string, patch: Partial<ExperimentDraft>) => {
    setExperiments((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const runPreview = async (experiment: ExperimentDraft) => {
    try {
      const result = await previewMutation.mutateAsync(experiment);
      updateExperiment(experiment.key, { preview: result.expected });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The reference query failed to run");
    }
  };

  const buildPayload = () => ({
    requestKey, batch, sessions: isEdit ? [] : sessions,
    title,
    subject,
    kind,
    department,
    semester: Number(semester),
    description: description.trim() === "" ? null : description,
    lifecycleState,
    experiments: experiments.map((experiment, index) =>
      experiment.kind === "sql"
        ? {
            id: experiment.key,
            kind: "sql" as const,
            number: index + 1,
            title: experiment.title,
            aim: experiment.aim,
            points: 100,
            schemaSql: experiment.schemaSql,
            solutionSql: experiment.solutionSql,
            ordered: experiment.ordered,
          }
        : {
            id: experiment.key,
            kind: "coding" as const,
            number: index + 1,
            title: experiment.title,
            aim: experiment.aim,
            points: 100,
            difficulty: experiment.difficulty,
            constraints: experiment.constraints,
            inputFormat: experiment.inputFormat,
            outputFormat: experiment.outputFormat,
            timeLimitSeconds: Number(experiment.timeLimitSeconds),
            memoryLimitMb: Number(experiment.memoryLimitMb),
            supportedLanguages: experiment.supportedLanguages,
            sampleTestCases: experiment.sampleTestCases.filter((tc) => tc.input.trim() !== "" || tc.output.trim() !== ""),
            hiddenTestCases: experiment.hiddenTestCases.filter((tc) => tc.input.trim() !== "" || tc.output.trim() !== ""),
          },
    ),
  });

  const saveMutation = useMutation({
    mutationFn: () => (isEdit ? classroomApi.update(id!, buildPayload()) : classroomApi.create(buildPayload())),
    onSuccess: (data) => {
      toast.success(isEdit ? "Lab updated" : "Lab created");
      navigate(`/faculty/labs/${data.classroom.id}`);
    },
    onError: (error: Error) => toast.error(error.message || "Could not save the lab"),
  });

  return (
    <AppLayout>
      <div className="container max-w-4xl space-y-6 px-3 py-5 sm:px-6 sm:py-8">
        <h1 className="font-display text-3xl font-bold">{isEdit ? "Edit classroom" : "Create a batch classroom"}</h1>

        <Card className="space-y-4 p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="text-xs" htmlFor="classroom-title">Title</Label>
              <Input id="classroom-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="DBMS Practical Lab" />
            </div>
            <div>
              <Label className="text-xs" htmlFor="classroom-subject">Subject</Label>
              <Input id="classroom-subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Database Management Systems Lab" />
            </div>
            <div>
              <Label className="text-xs">Kind</Label>
              <ThemedSelect
                value={kind}
                onValueChange={(value) => {
                  const next = value as "DSA" | "DBMS";
                  if (next === kind) return;
                  if (experiments.some(e => e.title.trim() || e.aim.trim())) { toast.error("Remove authored experiments before changing the classroom kind"); return; }
                  setKind(next); setExperiments([blankExperiment(next === "DBMS" ? "sql" : "coding")]); setSessions([]);
                }}
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
                onValueChange={(value) => setDepartment(value as Department)}
                options={DEPARTMENTS.map((dept) => ({ value: dept, label: dept }))}
              />
            </div>
            <div>
              <Label className="text-xs">Semester</Label>
              <ThemedSelect
                value={semester}
                onValueChange={setSemester}
                options={[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => ({ value: String(sem), label: `Semester ${sem}` }))}
              />
            </div>
          </div>
          <label className="block space-y-1 text-sm">Batch<Input value={batch} onChange={event => setBatch(event.target.value)} placeholder="e.g. A1" maxLength={80} /></label>
          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} />
          </div>
        </Card>

        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Experiments</p>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowImport((open) => !open)}>
              {showImport ? "Close import" : "Import from JSON"}
            </Button>
          </div>
          {showImport && (
            <div className="space-y-2">
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void copyTextToClipboard(LAB_EXPERIMENTS_EXAMPLE_JSON);
                    toast.success("Example structure copied");
                  }}
                >
                  Copy JSON structure
                </Button>
              </div>
              <Textarea
                className="font-mono-code"
                rows={8}
                placeholder="Paste an array of experiments (sql and/or coding)…"
                value={jsonSource}
                onChange={(event) => setJsonSource(event.target.value)}
              />
              <div className="flex justify-end">
                <Button type="button" size="sm" disabled={!jsonSource.trim()} onClick={importFromJson}>
                  Import
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Importing replaces the current experiment list. Each item needs a <code>kind</code> of
                <code> "sql"</code> or <code>"coding"</code>.
              </p>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          {experiments.map((experiment, index) => (
            <Card key={experiment.key} className="space-y-3 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Experiment {index + 1}</p>
                <div className="flex items-center gap-2">
                  <ThemedSelect
                    value={experiment.kind}
                    onValueChange={(value) => updateExperiment(experiment.key, { kind: value as "sql" | "coding" })}
                    options={[{ value: kind === "DBMS" ? "sql" : "coding", label: kind === "DBMS" ? "SQL" : "Coding" }]}
                  />
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
                  value={100}
                  readOnly
                  aria-label="Maximum marks (100)"
                />
              </div>
              <Textarea
                placeholder="Aim / task for the student"
                value={experiment.aim}
                rows={2}
                onChange={(event) => updateExperiment(experiment.key, { aim: event.target.value })}
              />

              {experiment.kind === "sql" ? (
                <>
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
                </>
              ) : (
                <CodingFields experiment={experiment} onChange={(patch) => updateExperiment(experiment.key, patch)} />
              )}
            </Card>
          ))}

          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setExperiments((current) => [...current, blankExperiment(kind === "DBMS" ? "sql" : "coding")])}>
              + {kind === "DBMS" ? "SQL" : "Coding"} experiment
            </Button>
          </div>
        </div>

        {!isEdit && <Card className="space-y-4 p-5"><h2 className="text-lg font-semibold">Schedule sessions (optional)</h2><p className="text-sm text-muted-foreground">Choose experiments and a language for each date. You can add more sessions later.</p>{sessions.map((session, index) => <ClassroomScheduleEditor key={session.id} value={session} experiments={experiments.map(e => ({ ...e, id: e.key }))} onChange={value => setSessions(current => current.map((s, i) => i === index ? value : s))} onRemove={() => setSessions(current => current.filter(s => s.id !== session.id))} />)}<Button variant="outline" onClick={() => setSessions(current => [...current, newSchedule()])}>Add scheduled session</Button></Card>}
        {existing.isError && <p role="alert" className="text-destructive">{existing.error.message}</p>}
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

function CodingFields({
  experiment,
  onChange,
}: {
  experiment: ExperimentDraft;
  onChange: (patch: Partial<ExperimentDraft>) => void;
}) {
  const editCases = (field: "sampleTestCases" | "hiddenTestCases", cases: TestCaseDraft[]) => onChange({ [field]: cases });

  const renderCases = (field: "sampleTestCases" | "hiddenTestCases", label: string) => (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      {experiment[field].map((testCase, index) => (
        <div key={index} className="grid gap-2 md:grid-cols-2">
          <Textarea
            className="font-mono-code"
            rows={2}
            placeholder="Input"
            value={testCase.input}
            onChange={(event) => {
              const next = [...experiment[field]];
              next[index] = { ...next[index], input: event.target.value };
              editCases(field, next);
            }}
          />
          <Textarea
            className="font-mono-code"
            rows={2}
            placeholder="Expected output"
            value={testCase.output}
            onChange={(event) => {
              const next = [...experiment[field]];
              next[index] = { ...next[index], output: event.target.value };
              editCases(field, next);
            }}
          />
        </div>
      ))}
      <Button type="button" size="sm" variant="ghost" onClick={() => editCases(field, [...experiment[field], emptyCase()])}>
        + Case
      </Button>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label className="text-xs">Difficulty</Label>
          <ThemedSelect
            value={experiment.difficulty}
            onValueChange={(value) => onChange({ difficulty: value as ExperimentDraft["difficulty"] })}
            options={["Easy", "Medium", "Hard"].map((d) => ({ value: d, label: d }))}
          />
        </div>
        <div>
          <Label className="text-xs">Time / memory limits</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              value={experiment.timeLimitSeconds}
              onChange={(event) => onChange({ timeLimitSeconds: stripZero(event.target.value) })}
            />
            <Input
              type="number"
              value={experiment.memoryLimitMb}
              onChange={(event) => onChange({ memoryLimitMb: stripZero(event.target.value) })}
            />
          </div>
        </div>
      </div>

      <div>
        <Label className="text-xs">Allowed languages</Label>
        <div className="flex flex-wrap gap-3">
          {CODING_LANGUAGES.map((language) => (
            <label key={language} className="flex items-center gap-1 text-sm">
              <Checkbox
                checked={experiment.supportedLanguages.includes(language)}
                onCheckedChange={(checked) =>
                  onChange({
                    supportedLanguages: checked
                      ? [...experiment.supportedLanguages, language]
                      : experiment.supportedLanguages.filter((item) => item !== language),
                  })
                }
              />
              {language}
            </label>
          ))}
        </div>
      </div>

      <Textarea
        placeholder="Constraints"
        value={experiment.constraints}
        rows={2}
        onChange={(event) => onChange({ constraints: event.target.value })}
      />
      {renderCases("sampleTestCases", "Sample test cases (shown to students)")}
      {renderCases("hiddenTestCases", "Hidden test cases (at least one required)")}
    </div>
  );
}
