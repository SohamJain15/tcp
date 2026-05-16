import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { AppLayout } from "@/components/AppLayout";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type BuilderQuestionType = "MCQ" | "MSQ" | "Coding";
type CodingDifficulty = "Easy" | "Medium" | "Hard";
type TestCaseBuilder = { input: string; output: string };

type ContestMetadata = {
  title: string;
  startTime: string;
  duration: string;
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

function mapContestToMetadata(contest: FacultyContestDetail): ContestMetadata {
  return {
    title: contest.title,
    startTime: contest.startAt.slice(0, 16),
    duration: String(contest.durationMinutes),
    type: contest.type,
    targetDepartment: contest.targetDepartment ?? "All",
    maxViolations: String(contest.maxViolations),
  };
}

function filterCompletedTestCases(testCases: TestCaseBuilder[]): TestCaseBuilder[] {
  return testCases
    .map((testCase) => ({ input: testCase.input.trim(), output: testCase.output.trim() }))
    .filter((testCase) => testCase.input.length > 0 || testCase.output.length > 0);
}

export default function CreateContest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = Boolean(id);
  const pathname = isEditMode ? `/faculty/contests/${id}/edit` : "/faculty/create-contest";
  const [metadata, setMetadata] = useState<ContestMetadata>({
    title: "",
    startTime: "",
    duration: "",
    type: "Rated",
    targetDepartment: "All",
    maxViolations: "3",
  });
  const [questions, setQuestions] = useState<BuilderQuestion[]>([]);

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
            options: question.options.map((option) => option.trim()),
            correctAnswers: question.correctAnswers,
          };
        }

        return {
          id: question.id,
          type: "MCQ",
          points: question.points,
          statement: question.statement.trim(),
          options: question.options.map((option) => option.trim()),
          correctAnswer: question.correctAnswer,
        };
      });

      const payload = {
        title: metadata.title.trim(),
        startTime: metadata.startTime,
        duration: Number(metadata.duration),
        type: metadata.type,
        targetDepartment: metadata.targetDepartment === "All" ? null : metadata.targetDepartment,
        maxViolations: Number(metadata.maxViolations),
        questions: normalizedQuestions,
      };

      return isEditMode ? contestsApi.update(id!, payload, pathname) : contestsApi.create(payload, pathname);
    },
    onSuccess: (response) => {
      toast.success(isEditMode ? "Contest updated successfully" : "Contest created successfully");
      navigate(`/faculty/contests/${response.contest.id}`);
    },
    onError: (error) => {
      toast.error((error as Error).message || `Failed to ${isEditMode ? "update" : "create"} contest`);
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

  const addQuestion = (type: BuilderQuestionType) => {
    setQuestions((current) => [...current, createQuestion(type)]);
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
            <Link to={`/faculty/contests/${id}`} className="text-sm text-muted-foreground hover:text-accent">
              Back to contest
            </Link>
          )}
          <h1 className="font-display text-3xl font-bold">{isEditMode ? "Edit Contest" : "Create Contest"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Configure contest metadata and build mixed question sets.</p>
        </div>

        <Card className="space-y-4 border border-border bg-background p-6 shadow-none">
          <h2 className="text-lg font-semibold">Contest Metadata</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Title</label>
              <Input value={metadata.title} onChange={(event) => setMetadata((current) => ({ ...current, title: event.target.value }))} placeholder="e.g. T&P Assessment Round 3" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Start Time</label>
              <Input type="datetime-local" value={metadata.startTime} onChange={(event) => setMetadata((current) => ({ ...current, startTime: event.target.value }))} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Duration (minutes)</label>
              <Input type="number" min={1} value={metadata.duration} onChange={(event) => setMetadata((current) => ({ ...current, duration: event.target.value }))} placeholder="120" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Contest Type</label>
              <Select value={metadata.type} onValueChange={(value: ContestType) => setMetadata((current) => ({ ...current, type: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Rated">Rated</SelectItem>
                  <SelectItem value="Practice">Practice</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Visibility</label>
              <Select value={metadata.targetDepartment} onValueChange={(value: Department | "All") => setMetadata((current) => ({ ...current, targetDepartment: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Departments</SelectItem>
                  {DEPARTMENTS.map((department) => (
                    <SelectItem key={department} value={department}>
                      {department}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Max Violations</label>
              <Input type="number" min={1} value={metadata.maxViolations} onChange={(event) => setMetadata((current) => ({ ...current, maxViolations: event.target.value }))} />
            </div>
          </div>
        </Card>

        <Card className="space-y-5 border border-border bg-background p-6 shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Question Builder</h2>
            <p className="text-sm text-muted-foreground">
              {questions.length} question{questions.length === 1 ? "" : "s"} • {totalPoints} pts total
            </p>
          </div>

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
                      <Select value={question.difficulty} onValueChange={(value: CodingDifficulty) => updateQuestion(question.id, (current) => current.type === "Coding" ? { ...current, difficulty: value } : current)}>
                        <SelectTrigger><SelectValue placeholder="Select difficulty" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Easy">Easy</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="Hard">Hard</SelectItem>
                        </SelectContent>
                      </Select>
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
                          <Select value={question.correctAnswer} onValueChange={(value) => updateQuestion(question.id, (current) => current.type === "MCQ" ? { ...current, correctAnswer: value } : current)}>
                            <SelectTrigger><SelectValue placeholder="Select correct option" /></SelectTrigger>
                            <SelectContent>
                              {OPTION_KEYS.map((key) => (
                                <SelectItem key={key} value={key}>{key}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
            <Button variant="outline" onClick={() => addQuestion("MCQ")}>Add MCQ</Button>
            <Button variant="outline" onClick={() => addQuestion("MSQ")}>Add MSQ</Button>
            <Button variant="outline" onClick={() => addQuestion("Coding")}>Add Coding Problem</Button>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (isEditMode ? "Saving..." : "Creating...") : isEditMode ? "Save Changes" : "Create Contest"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
