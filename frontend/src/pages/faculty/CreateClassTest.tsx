import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CheckCircle2, ClipboardCopy, FileJson, Trash2, Upload, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { classTestApi } from "@/api/services";
import { DEPARTMENTS, type ClassTestAudienceFilter, type ClassTestQuestionType } from "@/api/types";
import { AppLayout } from "@/components/AppLayout";
import { ThemedSelect } from "@/components/ThemedSelect";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CONTEST_CODING_EXAMPLE_JSON, parseContestCodingQuestionsJson } from "@/lib/contest-question-import";
import type { JsonImportFieldError } from "@/lib/problem-import-schema";
import { copyTextToClipboard } from "@/lib/clipboard";

const PATHNAME = "/faculty/class-tests/create";
const DIVISIONS = ["A", "B", "C", "D", "E"];
const QUESTION_TYPES: ClassTestQuestionType[] = ["MCQ", "MSQ", "ShortAnswer", "Coding"];

const questionTypeLabel = (type: ClassTestQuestionType) =>
  type === "ShortAnswer" ? "Short answer" : type;
const CODING_LANGUAGES = ["c", "cpp", "java", "python", "javascript", "typescript", "go", "kotlin"];

interface DraftQuestion {
  key: string;
  type: ClassTestQuestionType;
  points: number;
  statement: string;
  options: string[];
  correctAnswer: string;
  correctAnswers: string[];
  expectedSentences: number;
  modelAnswer: string;
  problemTitle: string;
  supportedLanguages: string[];
  difficulty: "Easy" | "Medium" | "Hard";
  constraints: string;
  inputFormat: string;
  outputFormat: string;
  timeLimitSeconds: number;
  memoryLimitMb: number;
  sampleTestCases: TestCaseDraft[];
  hiddenTestCases: TestCaseDraft[];
}

interface TestCaseDraft {
  input: string;
  output: string;
  explanation: string;
}

const emptyTestCase = (): TestCaseDraft => ({ input: "", output: "", explanation: "" });

function blankQuestion(type: ClassTestQuestionType): DraftQuestion {
  return {
    key: `draft_${Math.random().toString(36).slice(2)}`,
    type,
    points: type === "Coding" ? 10 : 5,
    statement: "",
    options: ["", ""],
    correctAnswer: "",
    correctAnswers: [],
    expectedSentences: 4,
    modelAnswer: "",
    problemTitle: "",
    // Default to a single language: most class tests want one, and it also means the student
    // sees no language picker at all.
    supportedLanguages: ["java"],
    difficulty: "Easy",
    constraints: "",
    inputFormat: "",
    outputFormat: "",
    timeLimitSeconds: 2,
    memoryLimitMb: 256,
    sampleTestCases: [emptyTestCase()],
    // A coding question is refused without one — marks are proportional to hidden cases passed.
    hiddenTestCases: [emptyTestCase()],
  };
}

/** Strips the draft shape down to what the API expects for each question type. */
function toPayloadQuestion(question: DraftQuestion) {
  const base = { points: Number(question.points) };
  switch (question.type) {
    case "MCQ":
      return {
        ...base,
        type: "MCQ",
        statement: question.statement,
        options: question.options.filter(Boolean),
        correctAnswer: question.correctAnswer,
      };
    case "MSQ":
      return {
        ...base,
        type: "MSQ",
        statement: question.statement,
        options: question.options.filter(Boolean),
        correctAnswers: question.correctAnswers,
      };
    case "ShortAnswer":
      return {
        ...base,
        type: "ShortAnswer",
        statement: question.statement,
        expectedSentences: Number(question.expectedSentences),
        modelAnswer: question.modelAnswer || undefined,
      };
    case "Coding":
      return {
        ...base,
        type: "Coding",
        problemTitle: question.problemTitle,
        difficulty: question.difficulty,
        problemStatement: question.statement,
        constraints: question.constraints,
        inputFormat: question.inputFormat,
        outputFormat: question.outputFormat,
        timeLimitSeconds: Number(question.timeLimitSeconds),
        memoryLimitMb: Number(question.memoryLimitMb),
        // Blank rows are scaffolding the faculty never filled in — drop them rather than
        // judging against an empty case.
        sampleTestCases: question.sampleTestCases
          .filter((testCase) => testCase.input.trim() !== "" || testCase.output.trim() !== "")
          .map((testCase) => ({
            input: testCase.input,
            output: testCase.output,
            explanation: testCase.explanation || undefined,
          })),
        hiddenTestCases: question.hiddenTestCases
          .filter((testCase) => testCase.input.trim() !== "" || testCase.output.trim() !== "")
          .map((testCase) => ({ input: testCase.input, output: testCase.output })),
        supportedLanguages: question.supportedLanguages,
      };
  }
}

export default function CreateClassTest() {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [instructions, setInstructions] = useState("");
  const [startAt, setStartAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [maxViolations, setMaxViolations] = useState(1);

  const [audience, setAudience] = useState<ClassTestAudienceFilter>({
    department: DEPARTMENTS[0],
    division: null,
    semester: null,
    rollFrom: null,
    rollTo: null,
  });
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [questions, setQuestions] = useState<DraftQuestion[]>([blankQuestion("MCQ")]);
  const [authoringTab, setAuthoringTab] = useState("form");
  const [jsonSource, setJsonSource] = useState("");
  const [jsonErrors, setJsonErrors] = useState<JsonImportFieldError[]>([]);
  const [jsonStructureCopied, setJsonStructureCopied] = useState(false);

  const previewMutation = useMutation({
    mutationFn: () => classTestApi.previewAudience(audience, PATHNAME),
    onError: (error: Error) => toast.error(error.message || "Could not load students"),
  });
  const candidates = previewMutation.data?.students ?? [];

  const createMutation = useMutation({
    mutationFn: () =>
      classTestApi.create(
        {
          title,
          subject,
          instructions: instructions || null,
          startAt: new Date(startAt).toISOString(),
          durationMinutes: Number(durationMinutes),
          maxViolations: Number(maxViolations),
          audience,
          // Everyone the filter found, minus anyone the faculty unticked.
          assignedEmails: candidates
            .filter((student) => !excluded.has(student.email))
            .map((student) => student.email),
          questions: questions.map(toPayloadQuestion),
          lifecycleState: "Published",
        },
        PATHNAME,
      ),
    onSuccess: (data) => {
      toast.success("Class test scheduled");
      navigate(`/faculty/class-tests/${data.classTest.id}`);
    },
    onError: (error: Error) => toast.error(error.message || "Could not create the class test"),
  });

  const updateQuestion = (key: string, patch: Partial<DraftQuestion>) => {
    setQuestions((current) => current.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  };

  // Google-Forms style: a question can be added at the end or slotted in after any question,
  // so faculty never has to scroll back to a toolbar at the top.
  const addQuestion = (type: ClassTestQuestionType, afterIndex?: number) => {
    setQuestions((current) => {
      if (afterIndex === undefined) return [...current, blankQuestion(type)];
      const next = [...current];
      next.splice(afterIndex + 1, 0, blankQuestion(type));
      return next;
    });
  };

  // Question numbers are derived from array order, so moving an entry renumbers everything.
  const moveQuestion = (index: number, direction: -1 | 1) => {
    setQuestions((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const updateTestCase = (
    key: string,
    bucket: "sampleTestCases" | "hiddenTestCases",
    index: number,
    patch: Partial<TestCaseDraft>,
  ) => {
    setQuestions((current) =>
      current.map((q) =>
        q.key === key
          ? { ...q, [bucket]: q[bucket].map((tc, i) => (i === index ? { ...tc, ...patch } : tc)) }
          : q,
      ),
    );
  };

  const copyJsonStructure = async () => {
    try {
      await copyTextToClipboard(CONTEST_CODING_EXAMPLE_JSON);
      setJsonStructureCopied(true);
      toast.success("Ideal JSON structure copied");
      window.setTimeout(() => setJsonStructureCopied(false), 1600);
    } catch {
      toast.error("Could not copy JSON structure");
    }
  };

  // Same parser and same JSON shape contests use, so a question file written for one works in
  // the other. Imported questions land in the list below for review before scheduling.
  const importQuestionsFromJson = (source: string) => {
    const { questions: imported, errors } = parseContestCodingQuestionsJson(source);
    setJsonErrors(errors);
    if (errors.length > 0) return;

    setQuestions((current) => [
      ...current,
      ...imported.map((question) => ({
        ...blankQuestion("Coding"),
        // The shared parser defaults an omitted `points` to 100 (contest scale) — the Marks
        // field beside each question is where faculty bring that down to class-test marks.
        points: question.points,
        problemTitle: question.problemTitle,
        difficulty: question.difficulty,
        statement: question.problemStatement,
        constraints: question.constraints,
        inputFormat: question.inputFormat,
        outputFormat: question.outputFormat,
        sampleTestCases: question.sampleTestCases.map((tc) => ({ ...tc, explanation: "" })),
        hiddenTestCases: question.hiddenTestCases.map((tc) => ({ ...tc, explanation: "" })),
      })),
    ]);
    setJsonSource("");
    setAuthoringTab("form");
    toast.success(`${imported.length} coding question${imported.length === 1 ? "" : "s"} added`);
  };

  const importQuestionsFromFile = async (file: File) => {
    try {
      importQuestionsFromJson(await file.text());
    } catch {
      toast.error("Could not read that file");
    }
  };

  const assignedCount = candidates.filter((student) => !excluded.has(student.email)).length;

  return (
    <AppLayout>
      <div className="container max-w-4xl space-y-6 py-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">Class Test</p>
          <h1 className="mt-1 font-display text-3xl font-bold">New Class Test</h1>
        </div>

        <Card className="profile-card space-y-4 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Details</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="ct-title">Title</Label>
              <Input id="ct-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lecture 4 Quiz" />
            </div>
            <div>
              <Label htmlFor="ct-subject">Subject</Label>
              <Input id="ct-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="COOS, ATCD, DBMS…" />
            </div>
            <div>
              <Label htmlFor="ct-start">Scheduled start</Label>
              <Input id="ct-start" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ct-duration">Duration (minutes)</Label>
              <Input
                id="ct-duration"
                type="number"
                min={1}
                // The server caps this at 240; bounding it here means an inline nudge instead of
                // a rejection after the whole form is filled in.
                max={240}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Everyone finishes at the same moment — starting late does not add time.
              </p>
            </div>
            <div>
              <Label htmlFor="ct-violations">Violations before auto-submit</Label>
              <Input
                id="ct-violations"
                type="number"
                min={1}
                value={maxViolations}
                onChange={(e) => setMaxViolations(Number(e.target.value))}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                1 means the first tab-switch ends the test and flags it.
              </p>
            </div>
          </div>
          <div>
            <Label htmlFor="ct-instructions">Instructions (optional)</Label>
            <Textarea
              id="ct-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Printed notes allowed. No other resources."
            />
          </div>
        </Card>

        <Card className="profile-card space-y-4 p-5">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Who takes this test
            </h2>
            <p className="mt-1 text-xs text-muted-foreground/80">
              Find the class, then untick anyone who should not sit it. Only the students you keep
              can open the paper.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <Label>Department</Label>
              <ThemedSelect
                value={audience.department}
                onValueChange={(value) => setAudience((a) => ({ ...a, department: value as typeof a.department }))}
                options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
              />
            </div>
            <div>
              <Label>Division</Label>
              <ThemedSelect
                value={audience.division ?? "all"}
                onValueChange={(value) =>
                  setAudience((a) => ({ ...a, division: value === "all" ? null : value }))
                }
                options={[{ value: "all", label: "All" }, ...DIVISIONS.map((d) => ({ value: d, label: d }))]}
              />
            </div>
            <div>
              <Label>Semester</Label>
              <ThemedSelect
                value={audience.semester ? String(audience.semester) : "all"}
                onValueChange={(value) =>
                  setAudience((a) => ({ ...a, semester: value === "all" ? null : Number(value) }))
                }
                options={[
                  { value: "all", label: "All" },
                  ...[1, 2, 3, 4, 5, 6, 7, 8].map((s) => ({ value: String(s), label: String(s) })),
                ]}
              />
            </div>
            <div>
              <Label htmlFor="ct-roll-from">Roll from</Label>
              <Input
                id="ct-roll-from"
                type="number"
                value={audience.rollFrom ?? ""}
                onChange={(e) =>
                  setAudience((a) => ({ ...a, rollFrom: e.target.value === "" ? null : Number(e.target.value) }))
                }
              />
            </div>
            <div>
              <Label htmlFor="ct-roll-to">Roll to</Label>
              <Input
                id="ct-roll-to"
                type="number"
                value={audience.rollTo ?? ""}
                onChange={(e) =>
                  setAudience((a) => ({ ...a, rollTo: e.target.value === "" ? null : Number(e.target.value) }))
                }
              />
            </div>
            <div className="flex items-end md:col-span-2">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setExcluded(new Set());
                  previewMutation.mutate();
                }}
                disabled={previewMutation.isPending}
              >
                <Users className="mr-2 h-4 w-4" />
                {previewMutation.isPending ? "Finding students…" : "Find students"}
              </Button>
            </div>
          </div>

          {candidates.length > 0 && (
            <div className="border border-border">
              <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm">
                <span className="font-medium">
                  {assignedCount} of {candidates.length} selected
                </span>
                <button
                  type="button"
                  className="text-xs text-accent hover:underline"
                  onClick={() => setExcluded(new Set())}
                >
                  Select all
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {candidates.map((student) => (
                  <label
                    key={student.email}
                    className="flex cursor-pointer items-center gap-3 border-b border-border px-4 py-2 last:border-b-0 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={!excluded.has(student.email)}
                      onCheckedChange={(checked) =>
                        setExcluded((current) => {
                          const next = new Set(current);
                          if (checked) next.delete(student.email);
                          else next.add(student.email);
                          return next;
                        })
                      }
                    />
                    <span className="w-12 font-mono-code text-sm">{student.rollNumber}</span>
                    <span className="flex-1 text-sm">{student.name ?? student.email}</span>
                    <span className="text-xs text-muted-foreground">{student.uid}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="profile-card space-y-4 p-5">
          <Tabs value={authoringTab} onValueChange={setAuthoringTab}>
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="form">Questions</TabsTrigger>
              <TabsTrigger value="json">
                <FileJson className="mr-1.5 h-3.5 w-3.5" /> Import JSON
              </TabsTrigger>
            </TabsList>

            <TabsContent value="json" className="mt-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-bold">Import coding questions</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Paste one coding question or an array of them, or upload a .json file. This is
                    the same format contests use, so a question file works in both. MCQ, MSQ and
                    short answer are written by hand.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={copyJsonStructure}>
                  {jsonStructureCopied ? (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  ) : (
                    <ClipboardCopy className="mr-2 h-4 w-4" />
                  )}
                  {jsonStructureCopied ? "Copied structure" : "Copy JSON structure"}
                </Button>
              </div>

              <Textarea
                value={jsonSource}
                onChange={(e) => setJsonSource(e.target.value)}
                placeholder="Paste the copied JSON structure here and replace the values with your question data."
                className="min-h-[280px] resize-y font-mono-code text-xs leading-5"
              />

              {jsonErrors.length > 0 ? (
                <div className="max-h-48 overflow-auto border border-destructive/30 bg-destructive/10 p-3 text-sm">
                  <p className="font-medium text-destructive">Import validation failed</p>
                  <ul className="mt-2 space-y-1">
                    {jsonErrors.map((error, index) => (
                      <li key={`${error.path}-${error.message}-${index}`}>
                        <span className="font-mono-code text-xs">{error.path}</span>: {error.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="border border-border bg-muted/60 p-3 text-sm text-muted-foreground">
                  Imported questions are added to the Questions tab, where you can set the marks and
                  the languages students may answer in before scheduling.
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-3">
                <Button type="button" variant="outline" asChild>
                  <label className="cursor-pointer">
                    <FileJson className="mr-2 h-4 w-4" /> Upload .json file
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        // Reset first, so picking the same file twice still fires a change.
                        e.target.value = "";
                        if (file) void importQuestionsFromFile(file);
                      }}
                    />
                  </label>
                </Button>
                <Button type="button" onClick={() => importQuestionsFromJson(jsonSource)} disabled={!jsonSource.trim()}>
                  <Upload className="mr-2 h-4 w-4" /> Validate & add questions
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="form" className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Questions</h2>
            <span className="text-xs text-muted-foreground">
              {questions.length} question{questions.length === 1 ? "" : "s"} ·{" "}
              {questions.reduce((total, q) => total + Number(q.points || 0), 0)} marks
            </span>
          </div>

          {questions.map((question, index) => (
            <div key={question.key}>
            <div className="space-y-3 border border-border p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  Q{index + 1} · {questionTypeLabel(question.type)}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={index === 0}
                    onClick={() => moveQuestion(index, -1)}
                    aria-label="Move question up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={index === questions.length - 1}
                    onClick={() => moveQuestion(index, 1)}
                    aria-label="Move question down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Label htmlFor={`pts-${question.key}`} className="text-xs">
                    Marks
                  </Label>
                  <Input
                    id={`pts-${question.key}`}
                    type="number"
                    min={0}
                    className="w-20"
                    value={question.points}
                    onChange={(e) => updateQuestion(question.key, { points: Number(e.target.value) })}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setQuestions((c) => c.filter((q) => q.key !== question.key))}
                    aria-label="Remove question"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {question.type === "Coding" && (
                <div className="grid gap-3 md:grid-cols-[1fr_10rem]">
                  <Input
                    placeholder="Problem title"
                    value={question.problemTitle}
                    onChange={(e) => updateQuestion(question.key, { problemTitle: e.target.value })}
                  />
                  <ThemedSelect
                    value={question.difficulty}
                    onValueChange={(value) =>
                      updateQuestion(question.key, { difficulty: value as DraftQuestion["difficulty"] })
                    }
                    options={["Easy", "Medium", "Hard"].map((d) => ({ value: d, label: d }))}
                  />
                </div>
              )}

              <Textarea
                placeholder="Question text"
                value={question.statement}
                onChange={(e) => updateQuestion(question.key, { statement: e.target.value })}
              />

              {(question.type === "MCQ" || question.type === "MSQ") && (
                <div className="space-y-2">
                  {question.options.map((option, optionIndex) => (
                    <div key={optionIndex} className="flex items-center gap-2">
                      <Input
                        placeholder={`Option ${optionIndex + 1}`}
                        value={option}
                        onChange={(e) => {
                          const options = [...question.options];
                          options[optionIndex] = e.target.value;
                          updateQuestion(question.key, { options });
                        }}
                      />
                      {question.type === "MCQ" ? (
                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                          <input
                            type="radio"
                            name={`correct-${question.key}`}
                            checked={question.correctAnswer === option && option !== ""}
                            onChange={() => updateQuestion(question.key, { correctAnswer: option })}
                          />
                          Correct
                        </label>
                      ) : (
                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Checkbox
                            checked={question.correctAnswers.includes(option)}
                            onCheckedChange={(checked) => {
                              const correctAnswers = checked
                                ? [...question.correctAnswers, option]
                                : question.correctAnswers.filter((a) => a !== option);
                              updateQuestion(question.key, { correctAnswers });
                            }}
                          />
                          Correct
                        </label>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => updateQuestion(question.key, { options: [...question.options, ""] })}
                  >
                    + Option
                  </Button>
                </div>
              )}

              {question.type === "ShortAnswer" && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="text-xs">Expected sentences</Label>
                    <Input
                      type="number"
                      min={1}
                      value={question.expectedSentences}
                      onChange={(e) => updateQuestion(question.key, { expectedSentences: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Model answer (only you see this)</Label>
                    <Textarea
                      value={question.modelAnswer}
                      onChange={(e) => updateQuestion(question.key, { modelAnswer: e.target.value })}
                      placeholder="Shown beside the student's answer while you mark it."
                    />
                  </div>
                </div>
              )}

              {question.type === "Coding" && (
                <div>
                  <Label className="text-xs">Languages students may use</Label>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {CODING_LANGUAGES.map((language) => (
                      <label key={language} className="flex items-center gap-1.5 text-sm">
                        <Checkbox
                          checked={question.supportedLanguages.includes(language)}
                          onCheckedChange={(checked) => {
                            const supportedLanguages = checked
                              ? [...question.supportedLanguages, language]
                              : question.supportedLanguages.filter((l) => l !== language);
                            updateQuestion(question.key, { supportedLanguages });
                          }}
                        />
                        {language}
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Pick one to force a single language — students then get no language choice at all.
                    The server rejects any other language, so this holds even outside the editor.
                  </p>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <Label className="text-xs">Input format</Label>
                      <Textarea
                        value={question.inputFormat}
                        onChange={(e) => updateQuestion(question.key, { inputFormat: e.target.value })}
                        placeholder="First line contains N…"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Output format</Label>
                      <Textarea
                        value={question.outputFormat}
                        onChange={(e) => updateQuestion(question.key, { outputFormat: e.target.value })}
                        placeholder="Print a single integer…"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs">Constraints</Label>
                      <Textarea
                        value={question.constraints}
                        onChange={(e) => updateQuestion(question.key, { constraints: e.target.value })}
                        placeholder="1 <= N <= 10^5"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Program run limit (seconds)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={question.timeLimitSeconds}
                        onChange={(e) => updateQuestion(question.key, { timeLimitSeconds: Number(e.target.value) })}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Longest the student's code may run per test case before it is marked
                        Timeout. Usually 1–5. This is not the time they get to answer — that is the
                        test duration above.
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs">Memory limit (MB)</Label>
                      <Input
                        type="number"
                        min={16}
                        max={1024}
                        value={question.memoryLimitMb}
                        onChange={(e) => updateQuestion(question.key, { memoryLimitMb: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  {(["sampleTestCases", "hiddenTestCases"] as const).map((bucket) => (
                    <div key={bucket} className="mt-4 space-y-2">
                      <Label className="text-xs">
                        {bucket === "sampleTestCases" ? "Sample test cases (students see these)" : "Hidden test cases (used for marks)"}
                      </Label>
                      {question[bucket].map((testCase, caseIndex) => (
                        <div key={caseIndex} className="space-y-2 border border-border p-3">
                          <div className="grid gap-2 md:grid-cols-2">
                            <Textarea
                              value={testCase.input}
                              onChange={(e) => updateTestCase(question.key, bucket, caseIndex, { input: e.target.value })}
                              placeholder="Input"
                              className="font-mono-code text-xs"
                            />
                            <Textarea
                              value={testCase.output}
                              onChange={(e) => updateTestCase(question.key, bucket, caseIndex, { output: e.target.value })}
                              placeholder="Expected output"
                              className="font-mono-code text-xs"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            {bucket === "sampleTestCases" && (
                              <Input
                                value={testCase.explanation}
                                onChange={(e) =>
                                  updateTestCase(question.key, bucket, caseIndex, { explanation: e.target.value })
                                }
                                placeholder="Explanation (optional)"
                              />
                            )}
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="ml-auto"
                              onClick={() =>
                                updateQuestion(question.key, {
                                  [bucket]: question[bucket].filter((_, i) => i !== caseIndex),
                                } as Partial<DraftQuestion>)
                              }
                              aria-label="Remove test case"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          updateQuestion(question.key, {
                            [bucket]: [...question[bucket], emptyTestCase()],
                          } as Partial<DraftQuestion>)
                        }
                      >
                        + Test case
                      </Button>
                      {bucket === "hiddenTestCases" && question.hiddenTestCases.every((tc) => tc.input.trim() === "" && tc.output.trim() === "") && (
                        <p className="text-xs text-destructive">
                          Add at least one hidden test case — without one, students are scored only on
                          cases they can already see.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Slot a question in right here, rather than appending and dragging it up. */}
            <div className="flex flex-wrap items-center gap-1.5 py-2 pl-1">
              <span className="text-xs text-muted-foreground">Insert after:</span>
              {QUESTION_TYPES.map((type) => (
                <Button
                  key={type}
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => addQuestion(type, index)}
                >
                  + {questionTypeLabel(type)}
                </Button>
              ))}
            </div>
            </div>
          ))}

          {questions.length === 0 && (
            <p className="border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No questions yet — add one below.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <span className="text-sm font-medium">Add question:</span>
            {QUESTION_TYPES.map((type) => (
              <Button
                key={type}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => addQuestion(type)}
              >
                + {questionTypeLabel(type)}
              </Button>
            ))}
          </div>
            </TabsContent>
          </Tabs>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => navigate("/faculty/class-tests")}>
            Cancel
          </Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || assignedCount === 0 || !title || !subject || !startAt}
          >
            {createMutation.isPending ? "Scheduling…" : `Schedule for ${assignedCount} student(s)`}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
