import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Trash2, Users } from "lucide-react";
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

const PATHNAME = "/faculty/class-tests/create";
const DIVISIONS = ["A", "B", "C", "D", "E"];
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
}

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
        difficulty: "Easy",
        problemStatement: question.statement,
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Questions</h2>
            <div className="flex flex-wrap gap-2">
              {(["MCQ", "MSQ", "ShortAnswer", "Coding"] as ClassTestQuestionType[]).map((type) => (
                <Button
                  key={type}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setQuestions((current) => [...current, blankQuestion(type)])}
                >
                  + {type === "ShortAnswer" ? "Short answer" : type}
                </Button>
              ))}
            </div>
          </div>

          {questions.map((question, index) => (
            <div key={question.key} className="space-y-3 border border-border p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  Q{index + 1} · {question.type === "ShortAnswer" ? "Short answer" : question.type}
                </span>
                <div className="flex items-center gap-2">
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
                <Input
                  placeholder="Problem title"
                  value={question.problemTitle}
                  onChange={(e) => updateQuestion(question.key, { problemTitle: e.target.value })}
                />
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
                  </p>
                </div>
              )}
            </div>
          ))}
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
