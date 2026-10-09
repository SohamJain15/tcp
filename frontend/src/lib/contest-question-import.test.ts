import { describe, expect, it } from "vitest";

import {
  CONTEST_CODING_EXAMPLE_JSON,
  parseClassTestQuestionsJson,
  parseContestCodingQuestionsJson,
} from "./contest-question-import";

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

describe("parseContestCodingQuestionsJson", () => {
  const database = {
    type: "Database",
    problemTitle: "High earners",
    difficulty: "Easy",
    problemStatement: "List employees earning more than 75000.",
    schemaSql: "CREATE TABLE employees (id INT, name VARCHAR(50), salary INT);",
    solutionSql: "SELECT name FROM employees WHERE salary > 75000;",
    ordered: true,
    points: 50,
  };

  it("imports a Database question alongside a Coding one", () => {
    const { questions, errors } = parseContestCodingQuestionsJson(
      JSON.stringify([
        {
          type: "Coding",
          problemTitle: "Add two numbers",
          difficulty: "Easy",
          problemStatement: "Print the sum.",
          constraints: "1 <= n <= 10",
          sampleTestCases: [{ input: "1 2", output: "3" }],
          hiddenTestCases: [{ input: "4 5", output: "9" }],
        },
        database,
      ]),
    );
    expect(errors).toEqual([]);
    expect(questions.map((question) => question.type)).toEqual(["Coding", "Database"]);
    expect(questions[1]).toMatchObject({
      type: "Database",
      schemaSql: expect.stringContaining("CREATE TABLE employees"),
      solutionSql: expect.stringContaining("SELECT name"),
      ordered: true,
      points: 50,
    });
  });

  it("still imports a typeless entry as Coding, so older contest files keep working", () => {
    const { questions, errors } = parseContestCodingQuestionsJson(
      JSON.stringify([
        {
          problemTitle: "Add two numbers",
          difficulty: "Easy",
          problemStatement: "Print the sum.",
          constraints: "1 <= n <= 10",
          sampleTestCases: [{ input: "1 2", output: "3" }],
          hiddenTestCases: [{ input: "4 5", output: "9" }],
        },
      ]),
    );
    expect(errors).toEqual([]);
    expect(questions[0].type).toBe("Coding");
  });

  it("defaults ordered and points, and supplies constraints when omitted", () => {
    // `database` carries no `constraints`, and JSON.stringify drops the undefined keys — so this
    // is the minimal Database entry a faculty member could paste.
    const { questions, errors } = parseContestCodingQuestionsJson(
      JSON.stringify([{ ...database, ordered: undefined, points: undefined }]),
    );
    expect(errors).toEqual([]);
    expect(questions[0]).toMatchObject({ ordered: false, points: 100 });
    expect((questions[0] as { constraints: string }).constraints).not.toBe("");
  });

  it("requires the schema and the reference query", () => {
    const { questions, errors } = parseContestCodingQuestionsJson(
      JSON.stringify([{ ...database, schemaSql: "", solutionSql: "" }]),
    );
    expect(questions).toEqual([]);
    expect(errors.map((error) => error.path)).toEqual([
      "question[0].schemaSql",
      "question[0].solutionSql",
    ]);
  });

  it("flags an unknown type rather than importing it as Coding", () => {
    const { questions, errors } = parseContestCodingQuestionsJson(JSON.stringify([{ type: "MCQ", statement: "x" }]));
    expect(questions).toEqual([]);
    expect(errors[0].message).toContain("Coding or Database");
  });

  it("parses the example structure the Copy button hands out", () => {
    // The template is pasted verbatim by faculty, so it has to survive its own importer.
    const { questions, errors } = parseContestCodingQuestionsJson(CONTEST_CODING_EXAMPLE_JSON);
    expect(errors).toEqual([]);
    expect(questions.map((question) => question.type)).toEqual(["Coding", "Database"]);
  });
});
