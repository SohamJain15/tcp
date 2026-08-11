import { describe, expect, it } from "vitest";

import { parseClassTestQuestionsJson } from "./contest-question-import";

describe("parseClassTestQuestionsJson", () => {
  it("imports all four question types from one file", () => {
    const { questions, errors } = parseClassTestQuestionsJson(
      JSON.stringify([
        { type: "MCQ", statement: "Size of int?", options: ["2", "4", "8"], correctAnswer: "4", points: 5 },
        { type: "MSQ", statement: "Bitwise?", options: ["&", "|", "&&"], correctAnswers: ["&", "|"], points: 10 },
        { type: "ShortAnswer", statement: "What is a pointer?", modelAnswer: "An address.", points: 8 },
        {
          type: "Coding",
          problemTitle: "Sum",
          difficulty: "Easy",
          problemStatement: "Add two numbers.",
          constraints: "small",
          points: 100,
          sampleTestCases: [{ input: "1 2", output: "3" }],
          hiddenTestCases: [{ input: "4 5", output: "9" }],
        },
      ]),
    );

    expect(errors).toEqual([]);
    expect(questions.map((question) => question.type)).toEqual(["MCQ", "MSQ", "ShortAnswer", "Coding"]);
  });

  it("still imports a typeless coding entry, so old contest files keep working", () => {
    const { questions, errors } = parseClassTestQuestionsJson(
      JSON.stringify([
        {
          problemTitle: "Sum",
          difficulty: "Easy",
          problemStatement: "Add.",
          constraints: "small",
          sampleTestCases: [{ input: "1 2", output: "3" }],
          hiddenTestCases: [{ input: "4 5", output: "9" }],
        },
      ]),
    );

    expect(errors).toEqual([]);
    expect(questions[0].type).toBe("Coding");
  });

  it("accepts an empty test-case input — no-stdin problems are valid", () => {
    const { errors } = parseClassTestQuestionsJson(
      JSON.stringify([
        {
          type: "Coding",
          problemTitle: "Fixed",
          difficulty: "Easy",
          problemStatement: "Print C.",
          constraints: "n/a",
          sampleTestCases: [{ input: "", output: "C" }],
          hiddenTestCases: [{ input: "", output: "C" }],
        },
      ]),
    );

    expect(errors).toEqual([]);
  });

  it("rejects an MCQ whose correct answer is not one of the options", () => {
    // Grading matches by option text, so an answer outside the options could never be marked right.
    const { errors } = parseClassTestQuestionsJson(
      JSON.stringify([{ type: "MCQ", statement: "Pick", options: ["A", "B"], correctAnswer: "C" }]),
    );

    expect(errors.some((error) => error.path.endsWith("correctAnswer"))).toBe(true);
  });

  it("rejects an MSQ correct answer that is not among the options", () => {
    const { errors } = parseClassTestQuestionsJson(
      JSON.stringify([{ type: "MSQ", statement: "Pick", options: ["A", "B"], correctAnswers: ["A", "Z"] }]),
    );

    expect(errors.some((error) => error.path.endsWith("correctAnswers"))).toBe(true);
  });

  it("flags an unknown type rather than silently dropping it", () => {
    const { errors } = parseClassTestQuestionsJson(JSON.stringify([{ type: "Essay", statement: "..." }]));
    expect(errors.some((error) => error.message.includes("Unknown type"))).toBe(true);
  });

  it("defaults points per type when omitted", () => {
    const { questions } = parseClassTestQuestionsJson(
      JSON.stringify([{ type: "MCQ", statement: "Q", options: ["A", "B"], correctAnswer: "A" }]),
    );
    expect(questions[0].points).toBe(5);
  });

  it("imports a crossword and uppercases the answers", () => {
    const { questions, errors } = parseClassTestQuestionsJson(
      JSON.stringify([
        {
          type: "Crossword",
          entries: [
            { answer: "python", clue: "A language" },
            { answer: "loop", clue: "Repeat" },
          ],
        },
      ]),
    );
    expect(errors).toHaveLength(0);
    expect(questions[0].type).toBe("Crossword");
    if (questions[0].type === "Crossword") {
      expect(questions[0].entries.map((entry) => entry.answer)).toEqual(["PYTHON", "LOOP"]);
      expect(questions[0].points).toBe(10);
    }
  });

  it("rejects a crossword with a duplicate or non-letter word", () => {
    const duplicate = parseClassTestQuestionsJson(
      JSON.stringify([{ type: "Crossword", entries: [{ answer: "cat", clue: "a" }, { answer: "CAT", clue: "b" }] }]),
    );
    expect(duplicate.errors.length).toBeGreaterThan(0);

    const nonLetter = parseClassTestQuestionsJson(
      JSON.stringify([{ type: "Crossword", entries: [{ answer: "A1", clue: "a" }, { answer: "GOOD", clue: "b" }] }]),
    );
    expect(nonLetter.errors.length).toBeGreaterThan(0);
  });
});
