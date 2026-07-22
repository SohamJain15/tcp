import { ArrowLeft, CheckCircle2, ClipboardCopy, FileJson, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { AppLayout } from "@/components/AppLayout";
import { ApiError } from "@/api/client";
import { contestsApi } from "@/api/services";
import { EXECUTABLE_LANGUAGES } from "@/api/mappers";
import {
  DEPARTMENTS,
  type ContestQuestion,
  type ContestType,
  type Department,
  type FacultyContestDetail,
  type ProblemTestCase,
} from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ThemedSelect } from "@/components/ThemedSelect";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  CONTEST_CODING_EXAMPLE_JSON,
  parseContestCodingQuestionsJson,
} from "@/lib/contest-question-import";
import type { JsonImportFieldError } from "@/lib/problem-import-schema";

type BuilderQuestionType = "MCQ" | "MSQ" | "Coding";
type CodingDifficulty = "Easy" | "Medium" | "Hard";
type TestCaseBuilder = { input: string; output: string };

type ContestMetadata = {
  title: string;
  startTime: string;
  endTime: string;
  duration: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
  type: ContestType;
  targetDepartment: Department | "All";
  maxViolations: string;
};

type BaseQuestion = {
  id: string;
  type: BuilderQuestionType;
  points: number;
};

type CodingQuestion = BaseQuestion & {
  type: "Coding";
  problemTitle: string;
  difficulty: CodingDifficulty;
  problemStatement: string;
  constraints: string;
  inputFormat: string;
  outputFormat: string;
  sampleTestCases: TestCaseBuilder[];
  hiddenTestCases: TestCaseBuilder[];
};

type ChoiceQuestion = BaseQuestion & {
  type: "MCQ" | "MSQ";
  statement: string;
  options: string[];
  correctAnswer: string;
  correctAnswers: string[];
};

type BuilderQuestion = CodingQuestion | ChoiceQuestion;

const OPTION_KEYS = ["A", "B", "C", "D"] as const;
function emptyTestCase(): TestCaseBuilder {
  return { input: "", output: "" };
}

function createQuestion(type: BuilderQuestionType): BuilderQuestion {
  const id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  if (type === "Coding") {
    return {
      id,
      type,
      problemTitle: "",
      difficulty: "Easy",
      problemStatement: "",
      constraints: "",
      inputFormat: "",
      outputFormat: "",
      sampleTestCases: [emptyTestCase()],
      hiddenTestCases: [emptyTestCase()],
      points: 100,
    };
  }

  return {
    id,
    type,
    statement: "",
    options: ["", "", "", ""],
    correctAnswer: "A",
    correctAnswers: [],
    points: 10,
  };
}

function normalizeTestCases(testCases: ProblemTestCase[]): TestCaseBuilder[] {
  return testCases.length > 0 ? testCases.map((testCase) => ({ input: testCase.input, output: testCase.output })) : [emptyTestCase()];
}

function mapContestQuestionToBuilder(question: ContestQuestion): BuilderQuestion {
  if (question.type === "Coding") {
    return {
      id: question.id,
      type: "Coding",
      points: question.points,
      problemTitle: question.problemTitle,
      difficulty: question.difficulty,
      problemStatement: question.problemStatement,
      constraints: question.constraints,
      inputFormat: question.inputFormat,
      outputFormat: question.outputFormat,
      sampleTestCases: normalizeTestCases(question.sampleTestCases),
      hiddenTestCases: normalizeTestCases(question.hiddenTestCases),
    };
  }

  if (question.type === "MSQ") {
    return {
      id: question.id,
      type: "MSQ",
      points: question.points,
      statement: question.statement,
      options: question.options,
      correctAnswer: "A",
      correctAnswers: question.correctAnswers,
    };
  }

  return {
    id: question.id,
    type: "MCQ",
    points: question.points,
    statement: question.statement,
    options: question.options,
    correctAnswer: question.correctAnswer,
    correctAnswers: [],
  };
}

function toDateTimeLocalValue(isoTimestamp: string): string {
  const instant = new Date(isoTimestamp);
  const offsetMs = instant.getTimezoneOffset() * 60_000;
  return new Date(instant.getTime() - offsetMs).toISOString().slice(0, 16);
}

function mapContestToMetadata(contest: FacultyContestDetail): ContestMetadata {
  return {
    title: contest.title,
    startTime: toDateTimeLocalValue(contest.startAt),
    endTime: toDateTimeLocalValue(contest.endAt),
    duration: String(contest.durationMinutes),
    registrationOpenAt: toDateTimeLocalValue(contest.registrationOpenAt),
    registrationCloseAt: toDateTimeLocalValue(contest.registrationCloseAt),
    type: contest.type,
    targetDepartment: contest.targetDepartment ?? "All",
    maxViolations: String(contest.maxViolations),
  };
}

function toIsoOrEmpty(dateTimeLocalValue: string): string {
  return dateTimeLocalValue ? new Date(dateTimeLocalValue).toISOString() : "";
}

/** Minutes between the contest start and end, or null while either end is unset/invalid. */
function computeWindowMinutes(startTime: string, endTime: string): number | null {
  if (!startTime || !endTime) {
    return null;
  }

  const windowMs = new Date(endTime).getTime() - new Date(startTime).getTime();
  return Number.isFinite(windowMs) ? Math.floor(windowMs / 60_000) : null;
}

/**
 * The API requires a non-empty input on every test case, so half-filled rows are dropped here
 * rather than sent and rejected. A question left with no hidden cases still fails validation,
 * which is the message faculty actually need to see.
 */
function filterCompletedTestCases(testCases: TestCaseBuilder[]): TestCaseBuilder[] {
  return testCases
    .map((testCase) => ({ input: testCase.input.trim(), output: testCase.output.trim() }))
    .filter((testCase) => testCase.input.length > 0);
}

/** Blank option boxes are ignored so a 2-option MCQ does not fail on the unused C/D fields. */
function filterFilledOptions(options: string[]): string[] {
  return options.map((option) => option.trim()).filter((option) => option.length > 0);
}

/**
 * Turns a rejected save into the specific, per-field list the backend already sends, instead of
 * the bare "Validation failed" message.
 */
function toSaveErrors(error: unknown): JsonImportFieldError[] {
  if (error instanceof ApiError) {
    const details = (error.details as { details?: { fieldIssues?: JsonImportFieldError[] } })?.details;
    if (details?.fieldIssues?.length) {
      return details.fieldIssues;
    }
  }

  return [{ path: "contest", message: (error as Error)?.message || "Failed to save contest" }];
}

/** "questions.2.constraints" reads better as "Question 3 › constraints". */
function humanizeErrorPath(path: string): string {
  const questionMatch = /^questions\.(\d+)\.?(.*)$/.exec(path);
  if (questionMatch) {
    const [, index, rest] = questionMatch;
    return rest ? `Question ${Number(index) + 1} › ${rest}` : `Question ${Number(index) + 1}`;
  }

  return path;
}

export default function CreateContest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = Boolean(id);
  const pathname = isEditMode ? `/faculty/contests/${id}/edit` : "/faculty/create-contest";
  const [metadata, setMetadata] = useState<ContestMetadata>({
    title: "",
    startTime: "",
    endTime: "",
    duration: "",
    registrationOpenAt: "",
    registrationCloseAt: "",
    type: "Rated",
    targetDepartment: "All",
    maxViolations: "3",
  });
  const [questions, setQuestions] = useState<BuilderQuestion[]>([]);
  const [authoringTab, setAuthoringTab] = useState("form");
  const [jsonSource, setJsonSource] = useState("");
  const [jsonErrors, setJsonErrors] = useState<JsonImportFieldError[]>([]);
  const [jsonStructureCopied, setJsonStructureCopied] = useState(false);
  const [saveErrors, setSaveErrors] = useState<JsonImportFieldError[]>([]);

  const contestQuery = useQuery({
    queryKey: ["faculty-contest-edit", id],
    queryFn: () => contestsApi.getFacultyDetail(id!, pathname),
    enabled: isEditMode,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const normalizedQuestions: ContestQuestion[] = questions.map((question) => {
        if (question.type === "Coding") {
          return {
            id: question.id,
            type: "Coding",
            points: question.points,
            problemTitle: question.problemTitle.trim(),
            difficulty: question.difficulty,
            problemStatement: question.problemStatement.trim(),
            constraints: question.constraints.trim(),
            inputFormat: question.inputFormat.trim(),
            outputFormat: question.outputFormat.trim(),
            sampleTestCases: filterCompletedTestCases(question.sampleTestCases),
            hiddenTestCases: filterCompletedTestCases(question.hiddenTestCases),
            timeLimitSeconds: 1,
            memoryLimitMb: 256,
            supportedLanguages: [...EXECUTABLE_LANGUAGES],
          };
        }

        if (question.type === "MSQ") {
          return {
            id: question.id,
            type: "MSQ",
            points: question.points,
            statement: question.statement.trim(),
            options: filterFilledOptions(question.options),
            correctAnswers: question.correctAnswers,
          };
        }

        return {
          id: question.id,
          type: "MCQ",
          points: question.points,
          statement: question.statement.trim(),
          options: filterFilledOptions(question.options),
          correctAnswer: question.correctAnswer,
        };
      });

      const payload = {
        title: metadata.title.trim(),
        startTime: toIsoOrEmpty(metadata.startTime),
        endTime: toIsoOrEmpty(metadata.endTime),
        duration: Number(metadata.duration),
        // Left blank, the backend opens registration immediately and closes it at contest start.
        ...(metadata.registrationOpenAt ? { registrationOpenAt: toIsoOrEmpty(metadata.registrationOpenAt) } : {}),
        ...(metadata.registrationCloseAt ? { registrationCloseAt: toIsoOrEmpty(metadata.registrationCloseAt) } : {}),
        type: metadata.type,
        targetDepartment: metadata.targetDepartment === "All" ? null : metadata.targetDepartment,
        maxViolations: Number(metadata.maxViolations),
        questions: normalizedQuestions,
      };

      return isEditMode ? contestsApi.update(id!, payload, pathname) : contestsApi.create(payload, pathname);
    },
    onSuccess: (response) => {
      setSaveErrors([]);
      toast.success(isEditMode ? "Contest updated successfully" : "Contest created successfully");
      navigate(`/faculty/contests/${response.contest.id}`);
    },
    onError: (error) => {
      const errors = toSaveErrors(error);
      setSaveErrors(errors);
      toast.error(
        errors.length === 1
          ? errors[0].message
          : `${errors.length} problems need fixing before this contest can be saved`,
      );
    },
  });

  useEffect(() => {
    if (!contestQuery.data?.contest) {
      return;
    }

    const contest = contestQuery.data.contest;
    setMetadata(mapContestToMetadata(contest));
    setQuestions(contest.questions.map(mapContestQuestionToBuilder));
  }, [contestQuery.data]);

  const totalPoints = useMemo(
    () => questions.reduce((acc, question) => acc + (Number.isFinite(question.points) ? question.points : 0), 0),
    [questions],
  );

  const windowMinutes = computeWindowMinutes(metadata.startTime, metadata.endTime);
  const durationMinutes = Number(metadata.duration);
  const durationExceedsWindow =
    windowMinutes !== null && Number.isFinite(durationMinutes) && durationMinutes > windowMinutes;

  const addQuestion = (type: BuilderQuestionType) => {
    setQuestions((current) => [...current, createQuestion(type)]);
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

  // Imported questions land in the same builder list as hand-authored ones, so faculty can
  // review and tweak them in the form before saving.
  const importQuestionsFromJson = () => {
    const { questions: imported, errors } = parseContestCodingQuestionsJson(jsonSource);
    setJsonErrors(errors);

    if (errors.length > 0) {
      return;
    }

    setQuestions((current) => [
      ...current,
      ...imported.map((question) => ({
        ...createQuestion("Coding"),
        ...question,
        sampleTestCases: normalizeTestCases(question.sampleTestCases),
        hiddenTestCases: normalizeTestCases(question.hiddenTestCases),
      })) as BuilderQuestion[],
    ]);
    setJsonSource("");
    setAuthoringTab("form");
    toast.success(`${imported.length} coding question${imported.length === 1 ? "" : "s"} added`);
  };

  const removeQuestion = (questionId: string) => {
    setQuestions((current) => current.filter((question) => question.id !== questionId));
  };

  const updateQuestion = (questionId: string, updater: (question: BuilderQuestion) => BuilderQuestion) => {
    setQuestions((current) => current.map((question) => (question.id === questionId ? updater(question) : question)));
  };

  const addTestCase = (questionId: string, bucket: "sampleTestCases" | "hiddenTestCases") => {
    updateQuestion(questionId, (question) =>
      question.type === "Coding"
        ? { ...question, [bucket]: [...question[bucket], emptyTestCase()] }
        : question,
    );
  };

  const updateTestCase = (
    questionId: string,
    bucket: "sampleTestCases" | "hiddenTestCases",
    index: number,
    field: keyof TestCaseBuilder,
    value: string,
  ) => {
    updateQuestion(questionId, (question) => {
      if (question.type !== "Coding") {
        return question;
      }

      const nextCases = question[bucket].map((testCase, testCaseIndex) =>
        testCaseIndex === index ? { ...testCase, [field]: value } : testCase,
      );
      return { ...question, [bucket]: nextCases };
    });
  };

  const removeTestCase = (questionId: string, bucket: "sampleTestCases" | "hiddenTestCases", index: number) => {
    updateQuestion(questionId, (question) => {
      if (question.type !== "Coding") {
        return question;
      }

      const nextCases = question[bucket].filter((_, testCaseIndex) => testCaseIndex !== index);
      return { ...question, [bucket]: nextCases.length > 0 ? nextCases : [emptyTestCase()] };
    });
  };

  if (isEditMode && contestQuery.isLoading) {
    return (
      <AppLayout>
        <div className="container py-8 text-muted-foreground">Loading contest editor...</div>
      </AppLayout>
    );
  }

  if (isEditMode && (contestQuery.isError || !contestQuery.data?.contest)) {
    return (
      <AppLayout>
        <div className="container py-8 text-destructive">
          {(contestQuery.error as Error)?.message || "Failed to load contest for editing"}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container space-y-6 py-8">
        <div>
          {isEditMode && (
            <Link
              to={`/faculty/contests/${id}`}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-accent"
            >
              <ArrowLeft className="h-4 w-4" /> Back to contest
            </Link>
          )}
          <h1 className="font-display text-3xl font-bold">{isEditMode ? "Edit Contest" : "Create Contest"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Configure contest metadata and build mixed question sets.</p>
        </div>

        <Card className="space-y-4 p-6 shadow-card">
          <h2 className="border-b border-border pb-2 font-display text-lg font-bold">Contest Metadata</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Title</label>
              <Input value={metadata.title} onChange={(event) => setMetadata((current) => ({ ...current, title: event.target.value }))} placeholder="e.g. Weekly Coding Contest - Round 3" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="contest-start-time">Contest Window Opens</label>
              <Input id="contest-start-time" type="datetime-local" value={metadata.startTime} onChange={(event) => setMetadata((current) => ({ ...current, startTime: event.target.value }))} />
              <p className="text-xs text-muted-foreground">Students can begin their attempt from this moment.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="contest-end-time">Contest Window Closes</label>
              <Input id="contest-end-time" type="datetime-local" value={metadata.endTime} onChange={(event) => setMetadata((current) => ({ ...current, endTime: event.target.value }))} />
              <p className="text-xs text-muted-foreground">Every attempt is force-submitted at this time.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="contest-duration">Attempt Duration (minutes)</label>
              <Input id="contest-duration" type="number" min={1} value={metadata.duration} onChange={(event) => setMetadata((current) => ({ ...current, duration: event.target.value }))} placeholder="120" />
              {durationExceedsWindow ? (
                <p className="text-xs font-medium text-destructive">
                  The window is only {windowMinutes} minutes long — shorten the duration or extend the window.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Each student gets this long from when they start
                  {windowMinutes !== null ? `; the window is ${windowMinutes} minutes` : ""}.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="contest-type">Contest Type</label>
              <ThemedSelect
                id="contest-type"
                value={metadata.type}
                onValueChange={(value) => setMetadata((current) => ({ ...current, type: value as ContestType }))}
                options={[
                  { value: "Rated", label: "Rated" },
                  { value: "Practice", label: "Practice" },
                ]}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="contest-registration-open">Registration Opens</label>
              <Input id="contest-registration-open" type="datetime-local" value={metadata.registrationOpenAt} onChange={(event) => setMetadata((current) => ({ ...current, registrationOpenAt: event.target.value }))} />
              <p className="text-xs text-muted-foreground">Leave blank to open registration immediately.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="contest-registration-close">Registration Closes</label>
              <Input id="contest-registration-close" type="datetime-local" value={metadata.registrationCloseAt} onChange={(event) => setMetadata((current) => ({ ...current, registrationCloseAt: event.target.value }))} />
              <p className="text-xs text-muted-foreground">Leave blank to close it when the contest starts.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="contest-department">Department Visibility</label>
              <ThemedSelect
                id="contest-department"
                value={metadata.targetDepartment}
                onValueChange={(value) => setMetadata((current) => ({ ...current, targetDepartment: value as Department | "All" }))}
                options={[
                  { value: "All", label: "All Departments" },
                  ...DEPARTMENTS.map((department) => ({ value: department, label: department })),
                ]}
              />
              <p className="text-xs text-muted-foreground">
                {metadata.targetDepartment === "All"
                  ? "Visible to every student."
                  : "Only students in this department can see and register."}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="contest-max-violations">Violation Warning Threshold</label>
              <Input id="contest-max-violations" type="number" min={1} value={metadata.maxViolations} onChange={(event) => setMetadata((current) => ({ ...current, maxViolations: event.target.value }))} />
              <p className="text-xs text-muted-foreground">Screenshot attempts warn the student at this count. Each one costs 5 points.</p>
            </div>
          </div>
        </Card>

        <Card className="space-y-5 p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
            <h2 className="font-display text-lg font-bold">Questions</h2>
            <p className="text-sm text-muted-foreground">
              {questions.length} question{questions.length === 1 ? "" : "s"} • {totalPoints} pts total
            </p>
          </div>

          <Tabs value={authoringTab} onValueChange={setAuthoringTab}>
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="form">Form Builder</TabsTrigger>
              <TabsTrigger value="json">
                <FileJson className="mr-1.5 h-3.5 w-3.5" /> Import JSON
              </TabsTrigger>
            </TabsList>

            <TabsContent value="json" className="mt-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-bold">Import Coding Questions</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Paste one coding question or an array of them. MCQ and MSQ are authored in the
                    Form Builder.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={copyJsonStructure}>
                  {jsonStructureCopied ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <ClipboardCopy className="mr-2 h-4 w-4" />}
                  {jsonStructureCopied ? "Copied Structure" : "Copy JSON Structure"}
                </Button>
              </div>

              <Textarea
                value={jsonSource}
                onChange={(event) => setJsonSource(event.target.value)}
                placeholder="Paste the copied JSON structure here and replace the values with your question data."
                className="min-h-[320px] resize-y font-mono-code text-xs leading-5"
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
                  Validated questions are appended to the Form Builder, where you can review and edit
                  them before saving the contest.
                </p>
              )}

              <div className="flex justify-end">
                <Button type="button" onClick={importQuestionsFromJson} disabled={!jsonSource.trim()}>
                  <Upload className="mr-2 h-4 w-4" /> Validate & Add Questions
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="form" className="mt-5 space-y-5">
          <div>
            {questions.length === 0 && (
              <Card className="border border-dashed border-border p-4 text-sm text-muted-foreground shadow-none">
                No questions added yet.
              </Card>
            )}

            {questions.map((question, index) => (
              <Card key={question.id} className="mb-4 border border-border p-4 shadow-none last:mb-0">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-semibold">Q{index + 1} • {question.type}</p>
                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => removeQuestion(question.id)}>
                    <Trash2 className="mr-1 h-4 w-4" /> Remove
                  </Button>
                </div>

                {question.type === "Coding" ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Problem Title</label>
                      <Input value={question.problemTitle} onChange={(event) => updateQuestion(question.id, (current) => current.type === "Coding" ? { ...current, problemTitle: event.target.value } : current)} placeholder="e.g. Reverse a Linked List" />
                    </div>

                    <div className="space-y-2 md:max-w-xs">
                      <label className="text-sm font-medium">Difficulty</label>
                      <ThemedSelect
                        value={question.difficulty}
                        onValueChange={(value) => updateQuestion(question.id, (current) => current.type === "Coding" ? { ...current, difficulty: value as CodingDifficulty } : current)}
                        placeholder="Select difficulty"
                        options={[
                          { value: "Easy", label: "Easy" },
                          { value: "Medium", label: "Medium" },
                          { value: "Hard", label: "Hard" },
                        ]}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Problem Statement</label>
                      <Textarea className="min-h-[100px]" value={question.problemStatement} onChange={(event) => updateQuestion(question.id, (current) => current.type === "Coding" ? { ...current, problemStatement: event.target.value } : current)} placeholder="Instructions for the student" />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Constraints</label>
                      <Textarea value={question.constraints} onChange={(event) => updateQuestion(question.id, (current) => current.type === "Coding" ? { ...current, constraints: event.target.value } : current)} placeholder="e.g. 1 <= N <= 10^5" />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Input Format</label>
                        <Textarea value={question.inputFormat} onChange={(event) => updateQuestion(question.id, (current) => current.type === "Coding" ? { ...current, inputFormat: event.target.value } : current)} placeholder="Describe the contest coding input format" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Output Format</label>
                        <Textarea value={question.outputFormat} onChange={(event) => updateQuestion(question.id, (current) => current.type === "Coding" ? { ...current, outputFormat: event.target.value } : current)} placeholder="Describe the required output format" />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Sample Test Cases</label>
                        <Button variant="outline" size="sm" onClick={() => addTestCase(question.id, "sampleTestCases")}>Add Sample Case</Button>
                      </div>
                      {question.sampleTestCases.map((testCase, testCaseIndex) => (
                        <div key={`${question.id}-sample-${testCaseIndex}`} className="rounded border border-border p-3">
                          <div className="mb-3 flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sample Case {testCaseIndex + 1}</span>
                            <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => removeTestCase(question.id, "sampleTestCases", testCaseIndex)}>
                              <Trash2 className="mr-1 h-4 w-4" /> Remove
                            </Button>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Input</label>
                              <Textarea value={testCase.input} onChange={(event) => updateTestCase(question.id, "sampleTestCases", testCaseIndex, "input", event.target.value)} placeholder="Sample testcase input" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Expected Output</label>
                              <Textarea value={testCase.output} onChange={(event) => updateTestCase(question.id, "sampleTestCases", testCaseIndex, "output", event.target.value)} placeholder="Sample testcase output" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Hidden Test Cases</label>
                        <Button variant="outline" size="sm" onClick={() => addTestCase(question.id, "hiddenTestCases")}>Add Hidden Case</Button>
                      </div>
                      {question.hiddenTestCases.map((testCase, testCaseIndex) => (
                        <div key={`${question.id}-hidden-${testCaseIndex}`} className="rounded border border-border p-3">
                          <div className="mb-3 flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hidden Case {testCaseIndex + 1}</span>
                            <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => removeTestCase(question.id, "hiddenTestCases", testCaseIndex)}>
                              <Trash2 className="mr-1 h-4 w-4" /> Remove
                            </Button>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Input</label>
                              <Textarea value={testCase.input} onChange={(event) => updateTestCase(question.id, "hiddenTestCases", testCaseIndex, "input", event.target.value)} placeholder="Hidden testcase input" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Expected Output</label>
                              <Textarea value={testCase.output} onChange={(event) => updateTestCase(question.id, "hiddenTestCases", testCaseIndex, "output", event.target.value)} placeholder="Hidden testcase output" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2 md:max-w-xs">
                      <label className="text-sm font-medium">Points</label>
                      <Input type="number" min={1} value={question.points} onChange={(event) => updateQuestion(question.id, (current) => ({ ...current, points: Number(event.target.value) || 0 }))} />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Question Statement</label>
                      <Textarea value={question.statement} onChange={(event) => updateQuestion(question.id, (current) => current.type === "MCQ" || current.type === "MSQ" ? { ...current, statement: event.target.value } : current)} placeholder="Enter the question statement" />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      {OPTION_KEYS.map((optionKey, optionIndex) => (
                        <div key={optionKey} className="space-y-2">
                          <label className="text-sm font-medium">Option {optionKey}</label>
                          <Input value={question.options[optionIndex] ?? ""} onChange={(event) => updateQuestion(question.id, (current) => {
                            if (current.type !== "MCQ" && current.type !== "MSQ") return current;
                            const nextOptions = [...current.options];
                            nextOptions[optionIndex] = event.target.value;
                            return { ...current, options: nextOptions };
                          })} placeholder={`Option ${optionKey}`} />
                        </div>
                      ))}
                    </div>

                    {question.type === "MCQ" ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Correct Answer</label>
                          <ThemedSelect
                            value={question.correctAnswer}
                            onValueChange={(value) => updateQuestion(question.id, (current) => current.type === "MCQ" ? { ...current, correctAnswer: value } : current)}
                            placeholder="Select correct option"
                            options={OPTION_KEYS.map((key) => ({ value: key, label: `Option ${key}` }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Points</label>
                          <Input type="number" min={1} value={question.points} onChange={(event) => updateQuestion(question.id, (current) => ({ ...current, points: Number(event.target.value) || 0 }))} />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-medium">Correct Answers</label>
                          <div className="mt-2 grid gap-2 md:grid-cols-4">
                            {OPTION_KEYS.map((key) => {
                              const checked = question.correctAnswers.includes(key);
                              return (
                                <label key={key} className="flex items-center gap-2 rounded border border-border px-3 py-2 text-sm">
                                  <Checkbox checked={checked} onCheckedChange={(nextChecked) => updateQuestion(question.id, (current) => {
                                    if (current.type !== "MSQ") return current;
                                    const normalizedChecked = Boolean(nextChecked);
                                    const nextAnswers = normalizedChecked ? [...current.correctAnswers, key] : current.correctAnswers.filter((answer) => answer !== key);
                                    return { ...current, correctAnswers: nextAnswers };
                                  })} />
                                  <span>Option {key}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-2 md:max-w-xs">
                          <label className="text-sm font-medium">Points</label>
                          <Input type="number" min={1} value={question.points} onChange={(event) => updateQuestion(question.id, (current) => ({ ...current, points: Number(event.target.value) || 0 }))} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => addQuestion("MCQ")}>
                  <Plus className="mr-1.5 h-4 w-4" /> Add MCQ
                </Button>
                <Button variant="outline" onClick={() => addQuestion("MSQ")}>
                  <Plus className="mr-1.5 h-4 w-4" /> Add MSQ
                </Button>
                <Button variant="outline" onClick={() => addQuestion("Coding")}>
                  <Plus className="mr-1.5 h-4 w-4" /> Add Coding Problem
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </Card>

        {saveErrors.length > 0 && (
          <Card className="border border-destructive/40 bg-destructive/10 p-4 shadow-none">
            <h3 className="font-display text-base font-bold text-destructive">
              This contest could not be saved
            </h3>
            <ul className="mt-2 max-h-56 space-y-1.5 overflow-auto text-sm">
              {saveErrors.map((error, index) => (
                <li key={`${error.path}-${error.message}-${index}`} className="flex flex-wrap gap-x-1.5">
                  <span className="font-mono-code text-xs font-semibold">{humanizeErrorPath(error.path)}</span>
                  <span className="text-muted-foreground">— {error.message}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          {questions.length === 0 && (
            <Badge variant="outline" className="text-muted-foreground">Add at least one question</Badge>
          )}
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || questions.length === 0 || durationExceedsWindow}
          >
            {saveMutation.isPending ? (isEditMode ? "Saving..." : "Creating...") : isEditMode ? "Save Changes" : "Create Contest"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
