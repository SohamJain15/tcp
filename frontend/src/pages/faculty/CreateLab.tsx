import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { labApi } from "@/api/services";
import { classroomApi, newRequestKey, type ScheduleDraft } from "@/api/classrooms";
import { ClassroomScheduleEditor, newSchedule } from "@/components/ClassroomScheduleEditor";
import { ClassroomStudentPicker } from "@/components/ClassroomStudentPicker";
import {
  DEPARTMENTS,
  SQL_CHECK_TYPES,
  SQL_CONSTRAINT_KINDS,
  type Department,
  type SqlCheck,
  type SqlCheckType,
  type SqlMode,
  type SqlResultSet,
} from "@/api/types";
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
  sqlMode: SqlMode;
  checks: SqlCheck[];
  facultyMarked: boolean;
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
    sqlMode: "query",
    checks: [],
    facultyMarked: false,
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
    "sqlMode": "query",
    "title": "List all students",
    "aim": "Select every student ordered by id.",
    "points": 10,
    "schemaSql": "CREATE TABLE students (id INT, name VARCHAR(50));\\nINSERT INTO students VALUES (1,'Ada'),(2,'Alan');",
    "solutionSql": "SELECT id, name FROM students ORDER BY id;",
    "ordered": true
  },
  {
    "kind": "sql",
    "sqlMode": "script",
    "title": "Create a set of tables and apply constraints",
    "aim": "Create at least three related tables using PRIMARY KEY, FOREIGN KEY, UNIQUE and NOT NULL, then insert sample rows.",
    "points": 20,
    "schemaSql": "",
    "checks": [
      { "type": "tableCount", "label": "At least 3 tables created", "min": 3 },
      { "type": "hasConstraint", "label": "A primary key is defined", "anyTable": true, "constraint": "PRIMARY KEY" },
      { "type": "hasConstraint", "label": "A foreign key links two tables", "anyTable": true, "constraint": "FOREIGN KEY" },
      { "type": "rowCount", "label": "Sample rows inserted", "anyTable": true, "min": 3 }
    ]
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

const SQL_KEYS = new Set([
  "kind",
  "sqlMode",
  "title",
  "aim",
  "points",
  "schemaSql",
  "solutionSql",
  "ordered",
  "checks",
  "facultyMarked",
]);
const CODING_KEYS = new Set([
  "kind",
  "title",
  "aim",
  "points",
  "difficulty",
  "supportedLanguages",
  "constraints",
  "inputFormat",
  "outputFormat",
  "timeLimitSeconds",
  "memoryLimitMb",
  "sampleTestCases",
  "hiddenTestCases",
]);
const CHECK_KEYS = new Set([
  "type",
  "label",
  "table",
  "anyTable",
  "column",
  "dataType",
  "constraint",
  "min",
  "max",
  "sql",
  "minRows",
  "maxRows",
]);

/**
 * Parses a JSON array of experiments into editable drafts.
 *
 * Strict on purpose. A lenient parse silently swapped a misspelled `schemaSQL` for the placeholder
 * seed, so the lab was published against an `example` table nobody wrote — and the failure only
 * surfaced later as "table doesn't exist" in a student's workspace, with no way to trace it back.
 * An unknown key is now a named error at import time.
 */
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
    const where = `Experiment ${index + 1}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { error: `${where} is not an object` };
    }
    const record = item as Record<string, unknown>;
    if (record.kind !== "sql" && record.kind !== "coding") {
      return { error: `${where} must specify kind sql or coding` };
    }
    const kind = record.kind;
    const allowed = kind === "sql" ? SQL_KEYS : CODING_KEYS;
    const unknown = Object.keys(record).filter((key) => !allowed.has(key));
    if (unknown.length > 0) {
      return { error: `${where}: unknown field${unknown.length === 1 ? "" : "s"} ${unknown.join(", ")}` };
    }
    if (typeof record.title !== "string" || record.title.trim() === "") {
      return { error: `${where} needs a title` };
    }
    if (typeof record.aim !== "string" || record.aim.trim() === "") {
      return { error: `${where} needs an aim` };
    }

    const base = blankExperiment(kind);
    const cases = (value: unknown): TestCaseDraft[] =>
      Array.isArray(value)
        ? value.map((entry) => {
            const testCase = entry as Record<string, unknown>;
            return { input: String(testCase.input ?? ""), output: String(testCase.output ?? "") };
          })
        : [emptyCase()];

    const checks: SqlCheck[] = [];
    if (kind === "sql" && record.checks !== undefined) {
      if (!Array.isArray(record.checks)) {
        return { error: `${where}: "checks" must be an array` };
      }
      for (let position = 0; position < record.checks.length; position += 1) {
        const entry = record.checks[position] as Record<string, unknown>;
        const at = `${where}, check ${position + 1}`;
        if (!entry || typeof entry !== "object") {
          return { error: `${at} is not an object` };
        }
        if (!SQL_CHECK_TYPES.includes(entry.type as SqlCheckType)) {
          return { error: `${at}: unknown type "${String(entry.type)}"` };
        }
        if (typeof entry.label !== "string" || entry.label.trim() === "") {
          return { error: `${at} needs a label — students see it as the rubric` };
        }
        const strayKeys = Object.keys(entry).filter((key) => !CHECK_KEYS.has(key));
        if (strayKeys.length > 0) {
          return { error: `${at}: unknown field${strayKeys.length === 1 ? "" : "s"} ${strayKeys.join(", ")}` };
        }
        checks.push(entry as unknown as SqlCheck);
      }
    }

    const sqlMode: SqlMode = record.sqlMode === "script" ? "script" : "query";
    if (kind === "sql" && record.sqlMode !== undefined && record.sqlMode !== "query" && record.sqlMode !== "script") {
      return { error: `${where}: "sqlMode" must be "query" or "script"` };
    }
    if (kind === "sql" && sqlMode === "query" && checks.length > 0) {
      return { error: `${where}: checks apply to script experiments — set "sqlMode": "script"` };
    }
    if (kind === "sql" && sqlMode === "script" && checks.length === 0 && record.facultyMarked !== true) {
      return {
        error: `${where}: a script experiment needs at least one check, or "facultyMarked": true`,
      };
    }

    experiments.push({
      ...base,
      title: record.title,
      aim: record.aim,
      points: record.points === undefined ? base.points : Number(record.points),
      sqlMode,
      checks,
      facultyMarked: record.facultyMarked === true,
      // Script experiments legitimately start from an empty database, so an omitted seed there
      // means "empty", not "use the placeholder".
      schemaSql:
        record.schemaSql !== undefined
          ? String(record.schemaSql)
          : sqlMode === "script"
            ? ""
            : base.schemaSql,
      solutionSql:
        record.solutionSql !== undefined
          ? String(record.solutionSql)
          : sqlMode === "script"
            ? ""
            : base.solutionSql,
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
  const [selectedStudentEmails, setSelectedStudentEmails] = useState<string[] | null>([]);
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
    setSelectedStudentEmails(lab.selectedStudentEmails ?? null);
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
          sqlMode: experiment.sqlMode ?? "query",
          checks: experiment.checks ?? [],
          facultyMarked: experiment.facultyMarked ?? false,
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
    requestKey, batch, selectedStudentEmails, sessions: isEdit ? [] : sessions,
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
            points: experiment.points,
            sqlMode: experiment.sqlMode,
            schemaSql: experiment.schemaSql,
            solutionSql: experiment.solutionSql,
            ordered: experiment.ordered,
            checks: experiment.sqlMode === "script" ? experiment.checks : [],
            facultyMarked: experiment.sqlMode === "script" && experiment.facultyMarked,
          }
        : {
            id: experiment.key,
            kind: "coding" as const,
            number: index + 1,
            title: experiment.title,
            aim: experiment.aim,
            points: experiment.points,
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
                onValueChange={(value) => { setDepartment(value as Department); setSelectedStudentEmails(current => current === null ? null : []); }}
                options={DEPARTMENTS.map((dept) => ({ value: dept, label: dept }))}
              />
            </div>
            <div>
              <Label className="text-xs">Semester</Label>
              <ThemedSelect
                value={semester}
                onValueChange={(value) => { setSemester(value); setSelectedStudentEmails(current => current === null ? null : []); }}
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

        <Card className="p-5"><ClassroomStudentPicker department={department} semester={Number(semester)} selectedEmails={selectedStudentEmails} onChange={setSelectedStudentEmails} /></Card>

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
                    <Label className="text-xs">Experiment type</Label>
                    <ThemedSelect
                      value={experiment.sqlMode}
                      onValueChange={(value) =>
                        updateExperiment(experiment.key, { sqlMode: value as SqlMode })
                      }
                      options={[
                        { value: "query", label: "Query — write one statement against a seeded schema" },
                        { value: "script", label: "Application — write a script (DDL / DML / design your own schema)" },
                      ]}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {experiment.sqlMode === "query"
                        ? "Graded by comparing the student's result grid to your reference query."
                        : "Students run many statements. Because they design their own tables, grading is by the checks below plus your own mark — not by comparing to a reference answer."}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs">
                      Schema + seed SQL (shown to students)
                      {experiment.sqlMode === "script" && " — leave empty to start them on an empty database"}
                    </Label>
                    <Textarea
                      className="font-mono-code"
                      rows={4}
                      value={experiment.schemaSql}
                      onChange={(event) => updateExperiment(experiment.key, { schemaSql: event.target.value })}
                    />
                  </div>
                  {experiment.sqlMode === "query" ? (
                    <>
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
                            onCheckedChange={(checked) =>
                              updateExperiment(experiment.key, { ordered: checked === true })
                            }
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
                    <ChecksEditor
                      experiment={experiment}
                      onChange={(patch) => updateExperiment(experiment.key, patch)}
                    />
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
          <Button type="button" disabled={saveMutation.isPending || (selectedStudentEmails !== null && selectedStudentEmails.length === 0)} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Create lab"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}

const CHECK_TYPE_LABELS: Record<SqlCheckType, string> = {
  tableExists: "A table with this name exists",
  tableCount: "How many tables were created",
  hasColumn: "A column exists (optionally of a given type)",
  hasConstraint: "A constraint is present (PK / FK / UNIQUE / …)",
  rowCount: "A table holds at least this many rows",
  queryReturns: "A verification query returns rows",
};

/**
 * The rubric editor for an application experiment.
 *
 * Every check can be pinned to one table name or left name-agnostic. Name-agnostic is the default
 * and the important one: students design their own schema, so `students` and `student_tbl` are both
 * correct answers, and a check that insists on one of them would fail half the class.
 */
function ChecksEditor({
  experiment,
  onChange,
}: {
  experiment: ExperimentDraft;
  onChange: (patch: Partial<ExperimentDraft>) => void;
}) {
  const patchCheck = (index: number, patch: Partial<SqlCheck>) =>
    onChange({
      checks: experiment.checks.map((check, position) => (position === index ? { ...check, ...patch } : check)),
    });
  const scoped = (check: SqlCheck) => check.table !== undefined && check.anyTable !== true;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs">Checks — students see these labels as their rubric</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            onChange({
              checks: [
                ...experiment.checks,
                { type: "hasConstraint", label: "", anyTable: true, constraint: "PRIMARY KEY" },
              ],
            })
          }
        >
          Add check
        </Button>
      </div>

      {experiment.checks.length === 0 ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={experiment.facultyMarked}
            onCheckedChange={(checked) => onChange({ facultyMarked: checked === true })}
          />
          No automatic checks — I will mark this experiment myself
        </label>
      ) : (
        experiment.checks.map((check, index) => (
          <Card key={index} className="space-y-2 p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 space-y-2">
                <ThemedSelect
                  value={check.type}
                  onValueChange={(value) => patchCheck(index, { type: value as SqlCheckType })}
                  options={SQL_CHECK_TYPES.map((type) => ({ value: type, label: CHECK_TYPE_LABELS[type] }))}
                />
                <Input
                  placeholder="Label shown to the student, e.g. “A foreign key links two tables”"
                  value={check.label}
                  onChange={(event) => patchCheck(index, { label: event.target.value })}
                />
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Remove check"
                onClick={() => onChange({ checks: experiment.checks.filter((_, position) => position !== index) })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {check.type === "hasConstraint" && (
                <ThemedSelect
                  value={check.constraint ?? "PRIMARY KEY"}
                  onValueChange={(value) =>
                    patchCheck(index, { constraint: value as SqlCheck["constraint"] })
                  }
                  options={SQL_CONSTRAINT_KINDS.map((kind) => ({ value: kind, label: kind }))}
                />
              )}
              {(check.type === "hasColumn" || check.type === "hasConstraint") && (
                <Input
                  placeholder="Column name (optional)"
                  value={check.column ?? ""}
                  onChange={(event) => patchCheck(index, { column: event.target.value || undefined })}
                />
              )}
              {check.type === "hasColumn" && (
                <Input
                  placeholder="Data type, e.g. varchar (optional)"
                  value={check.dataType ?? ""}
                  onChange={(event) => patchCheck(index, { dataType: event.target.value || undefined })}
                />
              )}
              {(check.type === "tableCount" || check.type === "rowCount") && (
                <Input
                  type="number"
                  min={0}
                  placeholder="Minimum"
                  value={check.min ?? ""}
                  onChange={(event) => patchCheck(index, { min: stripZero(event.target.value) })}
                />
              )}
              {check.type === "tableExists" && (
                <Input
                  placeholder="Table name"
                  value={check.table ?? ""}
                  onChange={(event) => patchCheck(index, { table: event.target.value })}
                />
              )}
              {check.type === "queryReturns" && (
                <Textarea
                  className="font-mono-code sm:col-span-2"
                  rows={2}
                  placeholder="SELECT … — run against the student's database"
                  value={check.sql ?? ""}
                  onChange={(event) => patchCheck(index, { sql: event.target.value })}
                />
              )}
            </div>

            {["hasColumn", "hasConstraint", "rowCount"].includes(check.type) && (
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={!scoped(check)}
                  onCheckedChange={(checked) =>
                    patchCheck(index, checked === true ? { anyTable: true, table: undefined } : { anyTable: undefined, table: "" })
                  }
                />
                Any table satisfies this — students may name their tables however they like
              </label>
            )}
            {scoped(check) && ["hasColumn", "hasConstraint", "rowCount"].includes(check.type) && (
              <Input
                placeholder="Table this check applies to"
                value={check.table ?? ""}
                onChange={(event) => patchCheck(index, { table: event.target.value })}
              />
            )}
          </Card>
        ))
      )}
    </div>
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
