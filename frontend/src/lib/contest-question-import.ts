import { z } from "zod";

import type { JsonImportFieldError } from "@/lib/problem-import-schema";

/**
 * Client-side mirror of the backend `codingQuestionSchema`
 * (backend/src/modules/contest/contest.validator.ts). Only coding questions can be imported —
 * MCQ and MSQ stay in the form builder where the option/answer pairing is easier to get right.
 */

export interface ImportedCodingQuestion {
  problemTitle: string;
  difficulty: "Easy" | "Medium" | "Hard";
  problemStatement: string;
  constraints: string;
  inputFormat: string;
  outputFormat: string;
  points: number;
  sampleTestCases: { input: string; output: string }[];
  hiddenTestCases: { input: string; output: string }[];
}

const testCaseSchema = z.object({
  // Empty input is legitimate — many problems read no stdin (print a table, output a fixed
  // answer), and MCQ/MSQ/short-answer questions authored through this format carry no input.
  input: z.string(),
  output: z.string(),
});

const codingQuestionJsonSchema = z.object({
  problemTitle: z.string().min(1, "Problem title is required"),
  difficulty: z.enum(["Easy", "Medium", "Hard"]),
  problemStatement: z.string().min(1, "Problem statement is required"),
  constraints: z.string().min(1, "Constraints are required"),
  inputFormat: z.string().optional(),
  outputFormat: z.string().optional(),
  points: z.number().positive().optional(),
  sampleTestCases: z.array(testCaseSchema).min(1, "At least one sample test case is required"),
  hiddenTestCases: z.array(testCaseSchema).min(1, "At least one hidden test case is required"),
});

export const CONTEST_CODING_EXAMPLE_JSON = `[
  {
    "problemTitle": "Replace with the coding question title",
    "difficulty": "Easy",
    "problemStatement": "Replace with the full problem statement.",
    "constraints": "Replace with the constraints, e.g. 1 <= N <= 10^5",
    "inputFormat": "Replace with the input format.",
    "outputFormat": "Replace with the output format.",
    "points": 100,
    "sampleTestCases": [
      {
        "input": "Replace with sample input",
        "output": "Replace with sample output"
      }
    ],
    "hiddenTestCases": [
      {
        "input": "Replace with hidden input",
        "output": "Replace with hidden output"
      }
    ]
  }
]`;

export interface ContestQuestionImportResult {
  questions: ImportedCodingQuestion[];
  errors: JsonImportFieldError[];
}

function toFieldErrors(error: z.ZodError, indexPrefix: string): JsonImportFieldError[] {
  return error.issues.map((issue) => ({
    path: [indexPrefix, ...issue.path.map(String)].filter(Boolean).join("."),
    message: issue.message,
  }));
}

/**
 * Accepts a single question object or an array of them. Returns every problem it finds rather
 * than stopping at the first, so faculty can fix a whole paste in one pass.
 */
export function parseContestCodingQuestionsJson(source: string): ContestQuestionImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    return {
      questions: [],
      errors: [{ path: "json", message: error instanceof Error ? error.message : "Invalid JSON" }],
    };
  }

  const entries = Array.isArray(parsed) ? parsed : [parsed];
  if (entries.length === 0) {
    return { questions: [], errors: [{ path: "json", message: "Provide at least one coding question" }] };
  }

  const questions: ImportedCodingQuestion[] = [];
  const errors: JsonImportFieldError[] = [];

  entries.forEach((entry, index) => {
    const result = codingQuestionJsonSchema.safeParse(entry);
    if (!result.success) {
      errors.push(...toFieldErrors(result.error, `question[${index}]`));
      return;
    }

    const value = result.data;
    questions.push({
      problemTitle: value.problemTitle.trim(),
      difficulty: value.difficulty,
      problemStatement: value.problemStatement.trim(),
      constraints: value.constraints.trim(),
      inputFormat: value.inputFormat?.trim() || "Read input from standard input.",
      outputFormat: value.outputFormat?.trim() || "Print output to standard output.",
      points: value.points ?? 100,
      sampleTestCases: value.sampleTestCases.map((testCase) => ({
        input: testCase.input,
        output: testCase.output,
      })),
      hiddenTestCases: value.hiddenTestCases.map((testCase) => ({
        input: testCase.input,
        output: testCase.output,
      })),
    });
  });

  return { questions: errors.length > 0 ? [] : questions, errors };
}

// ---------------------------------------------------------------------------
// Class-test import — all four question types, not just coding.
//
// Class tests mix MCQ, MSQ, short answer and coding, so their JSON import
// discriminates on a `type` field. A coding entry with no `type` is still
// accepted as Coding, so a file written for the contest importer keeps working.
// ---------------------------------------------------------------------------

export type ImportedClassTestQuestion =
  | { type: "MCQ"; statement: string; options: string[]; correctAnswer: string; points: number }
  | { type: "MSQ"; statement: string; options: string[]; correctAnswers: string[]; points: number }
  | { type: "ShortAnswer"; statement: string; expectedSentences: number; modelAnswer: string; points: number }
  | { type: "Crossword"; statement: string; entries: { answer: string; clue: string }[]; points: number }
  | ({ type: "Coding" } & ImportedCodingQuestion);

const optionsSchema = z.array(z.string().trim().min(1, "Option text is required")).min(2, "Give at least two options");

const mcqImportSchema = z.object({
  type: z.literal("MCQ"),
  statement: z.string().trim().min(1, "Question text is required"),
  options: optionsSchema,
  correctAnswer: z.string().trim().min(1, "Provide the correct option"),
  points: z.number().positive().optional(),
});

const msqImportSchema = z.object({
  type: z.literal("MSQ"),
  statement: z.string().trim().min(1, "Question text is required"),
  options: optionsSchema,
  correctAnswers: z.array(z.string().trim().min(1)).min(1, "Provide at least one correct option"),
  points: z.number().positive().optional(),
});

const shortAnswerImportSchema = z.object({
  type: z.literal("ShortAnswer"),
  statement: z.string().trim().min(1, "Question text is required"),
  expectedSentences: z.coerce.number().int().min(1).max(20).optional(),
  modelAnswer: z.string().trim().optional(),
  points: z.number().positive().optional(),
});

const crosswordImportSchema = z.object({
  type: z.literal("Crossword"),
  statement: z.string().trim().min(1, "Question text is required").optional(),
  entries: z
    .array(
      z.object({
        answer: z.string().trim().regex(/^[A-Za-z]{2,15}$/, "Each word must be 2–15 letters"),
        clue: z.string().trim().min(1, "Every word needs a clue"),
      }),
    )
    .min(2, "Add at least two words")
    .max(30, "At most 30 words"),
  points: z.number().positive().optional(),
});

export const CLASS_TEST_EXAMPLE_JSON = `[
  {
    "type": "MCQ",
    "statement": "What is the size of an int on a 32-bit system?",
    "options": ["1 byte", "2 bytes", "4 bytes", "8 bytes"],
    "correctAnswer": "4 bytes",
    "points": 5
  },
  {
    "type": "MSQ",
    "statement": "Which of these are bitwise operators in C?",
    "options": ["&", "|", "^", "&&"],
    "correctAnswers": ["&", "|", "^"],
    "points": 10
  },
  {
    "type": "ShortAnswer",
    "statement": "In one line, what is a pointer in C?",
    "expectedSentences": 1,
    "modelAnswer": "A variable that stores the memory address of another variable.",
    "points": 10
  },
  {
    "type": "Crossword",
    "statement": "Solve the crossword.",
    "points": 10,
    "entries": [
      { "answer": "PYTHON", "clue": "A popular scripting language" },
      { "answer": "LOOP", "clue": "A construct that repeats" },
      { "answer": "ARRAY", "clue": "An indexed list of values" }
    ]
  },
  {
    "type": "Coding",
    "problemTitle": "Add Two Numbers",
    "difficulty": "Easy",
    "problemStatement": "Read two integers and print their sum.",
    "constraints": "-10^4 <= A, B <= 10^4",
    "inputFormat": "Two space-separated integers.",
    "outputFormat": "Their sum.",
    "points": 100,
    "sampleTestCases": [{ "input": "5 7", "output": "12" }],
    "hiddenTestCases": [{ "input": "-5 15", "output": "10" }]
  }
]`;

export interface ClassTestQuestionImportResult {
  questions: ImportedClassTestQuestion[];
  errors: JsonImportFieldError[];
}

/**
 * Parses a class-test question file of mixed types. Like the coding parser it reports every
 * problem it finds rather than stopping at the first, so a whole paste can be fixed in one pass.
 * MCQ/MSQ correct answers are checked against the option list, because grading matches by the
 * option's text — an answer that is not one of the options could never be marked correct.
 */
export function parseClassTestQuestionsJson(source: string): ClassTestQuestionImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    return {
      questions: [],
      errors: [{ path: "json", message: error instanceof Error ? error.message : "Invalid JSON" }],
    };
  }

  const entries = Array.isArray(parsed) ? parsed : [parsed];
  if (entries.length === 0) {
    return { questions: [], errors: [{ path: "json", message: "Provide at least one question" }] };
  }

  const questions: ImportedClassTestQuestion[] = [];
  const errors: JsonImportFieldError[] = [];

  entries.forEach((entry, index) => {
    const prefix = `question[${index}]`;
    // A missing type means the contest-style coding shape, so old files still import.
    const type = (entry && typeof entry === "object" && "type" in entry ? (entry as { type?: unknown }).type : undefined) ?? "Coding";

    if (type === "MCQ") {
      const result = mcqImportSchema.safeParse(entry);
      if (!result.success) {
        errors.push(...toFieldErrors(result.error, prefix));
        return;
      }
      if (!result.data.options.includes(result.data.correctAnswer)) {
        errors.push({ path: `${prefix}.correctAnswer`, message: "correctAnswer must be one of the options (matched by text)" });
        return;
      }
      questions.push({
        type: "MCQ",
        statement: result.data.statement,
        options: result.data.options,
        correctAnswer: result.data.correctAnswer,
        points: result.data.points ?? 5,
      });
      return;
    }

    if (type === "MSQ") {
      const result = msqImportSchema.safeParse(entry);
      if (!result.success) {
        errors.push(...toFieldErrors(result.error, prefix));
        return;
      }
      const stray = result.data.correctAnswers.filter((answer) => !result.data.options.includes(answer));
      if (stray.length > 0) {
        errors.push({ path: `${prefix}.correctAnswers`, message: `every correct answer must be one of the options — not: ${stray.join(", ")}` });
        return;
      }
      questions.push({
        type: "MSQ",
        statement: result.data.statement,
        options: result.data.options,
        correctAnswers: result.data.correctAnswers,
        points: result.data.points ?? 5,
      });
      return;
    }

    if (type === "ShortAnswer") {
      const result = shortAnswerImportSchema.safeParse(entry);
      if (!result.success) {
        errors.push(...toFieldErrors(result.error, prefix));
        return;
      }
      questions.push({
        type: "ShortAnswer",
        statement: result.data.statement,
        expectedSentences: result.data.expectedSentences ?? 3,
        modelAnswer: result.data.modelAnswer ?? "",
        points: result.data.points ?? 5,
      });
      return;
    }

    if (type === "Crossword") {
      const result = crosswordImportSchema.safeParse(entry);
      if (!result.success) {
        errors.push(...toFieldErrors(result.error, prefix));
        return;
      }
      const answers = result.data.entries.map((item) => item.answer.toUpperCase());
      const duplicate = answers.find((answer, position) => answers.indexOf(answer) !== position);
      if (duplicate) {
        errors.push({ path: `${prefix}.entries`, message: `Duplicate word "${duplicate}"` });
        return;
      }
      questions.push({
        type: "Crossword",
        statement: result.data.statement ?? "Solve the crossword.",
        entries: result.data.entries.map((item) => ({ answer: item.answer.toUpperCase(), clue: item.clue })),
        points: result.data.points ?? 10,
      });
      return;
    }

    if (type === "Coding") {
      const result = codingQuestionJsonSchema.safeParse(entry);
      if (!result.success) {
        errors.push(...toFieldErrors(result.error, prefix));
        return;
      }
      const value = result.data;
      questions.push({
        type: "Coding",
        problemTitle: value.problemTitle.trim(),
        difficulty: value.difficulty,
        problemStatement: value.problemStatement.trim(),
        constraints: value.constraints.trim(),
        inputFormat: value.inputFormat?.trim() || "Read input from standard input.",
        outputFormat: value.outputFormat?.trim() || "Print output to standard output.",
        points: value.points ?? 100,
        sampleTestCases: value.sampleTestCases.map((testCase) => ({ input: testCase.input, output: testCase.output })),
        hiddenTestCases: value.hiddenTestCases.map((testCase) => ({ input: testCase.input, output: testCase.output })),
      });
      return;
    }

    errors.push({ path: `${prefix}.type`, message: `Unknown type "${String(type)}" — use MCQ, MSQ, ShortAnswer, Coding or Crossword` });
  });

  return { questions: errors.length > 0 ? [] : questions, errors };
}
