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
  input: z.string().min(1, "Test case input is required"),
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
