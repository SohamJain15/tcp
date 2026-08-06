import { describe, expect, it } from "vitest";

import {
  drawOptionOrder,
  drawQuestionsForAttempt,
  scoreObjectiveAnswer,
  toStudentQuestion,
  type ClassTestMcqQuestion,
  type ClassTestQuestion,
  type ClassTestQuestionType,
} from "../modules/classtest/classtest.model";

/**
 * The draw is a pure function, so these test it directly rather than through HTTP — an
 * integration test would bury *which* property of the distribution actually held.
 */

function mcq(id: string, points = 5): ClassTestMcqQuestion {
  return {
    id,
    type: "MCQ",
    points,
    statement: `Question ${id}`,
    options: ["A", "B", "C", "D"],
    correctAnswer: "A",
  };
}

function coding(id: string, points = 20): ClassTestQuestion {
  return {
    id,
    type: "Coding",
    points,
    problemTitle: `Problem ${id}`,
    difficulty: "Easy",
    problemStatement: "Do a thing",
    constraints: "",
    inputFormat: "",
    outputFormat: "",
    timeLimitSeconds: 2,
    memoryLimitMb: 256,
    sampleTestCases: [],
    hiddenTestCases: [{ input: "1", output: "1" }],
    supportedLanguages: ["java"],
  };
}

function pool(mcqCount: number, codingCount = 0): ClassTestQuestion[] {
  return [
    ...Array.from({ length: mcqCount }, (_, index) => mcq(`mcq_${index}`)),
    ...Array.from({ length: codingCount }, (_, index) => coding(`code_${index}`)),
  ];
}

/**
 * Deals papers to `students` in sequence, feeding each draw the usage produced by the previous
 * ones — exactly how `startAttempt` accumulates usage across a class.
 */
function dealClass(
  questions: ClassTestQuestion[],
  perType: Partial<Record<ClassTestQuestionType, number>>,
  students: number,
): { papers: string[][]; usage: Map<string, number> } {
  const usage = new Map<string, number>();
  const papers: string[][] = [];

  for (let student = 0; student < students; student += 1) {
    const paper = drawQuestionsForAttempt(questions, perType, usage);
    papers.push(paper.map((question) => question.id));
    for (const question of paper) {
      usage.set(question.id, (usage.get(question.id) ?? 0) + 1);
    }
  }

  return { papers, usage };
}

describe("drawQuestionsForAttempt", () => {
  it("gives every student exactly the requested number of each type", () => {
    const { papers } = dealClass(pool(40, 10), { MCQ: 5, Coding: 2 }, 8);

    for (const paper of papers) {
      expect(paper.filter((id) => id.startsWith("mcq_"))).toHaveLength(5);
      expect(paper.filter((id) => id.startsWith("code_"))).toHaveLength(2);
    }
  });

  it("hands out no repeats at all when the pool is ample", () => {
    // 100 questions, 5 students, 10 each — 50 slots into 100 questions, so nothing need repeat.
    const { usage } = dealClass(pool(100), { MCQ: 10 }, 5);

    expect(Math.max(...usage.values())).toBe(1);
  });

  it("spreads repeats evenly when the pool is too small to avoid them", () => {
    // The case described: 20 questions, 30 students, 5 each = 150 slots from 20 questions.
    // Repetition is arithmetic, but no question may be dealt while another sits unused.
    const { usage } = dealClass(pool(20), { MCQ: 5 }, 30);

    expect(usage.size).toBe(20);
    const counts = [...usage.values()];
    // 150 / 20 = 7.5, so every question lands on 7 or 8 — never 2 while another is on 15.
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("varies the paper between students rather than dealing the same set repeatedly", () => {
    const { papers } = dealClass(pool(20), { MCQ: 5 }, 30);
    const distinct = new Set(papers.map((paper) => [...paper].sort().join(",")));

    // With repetition forced, papers cannot all be unique — but they must not collapse to a
    // handful of identical sets either.
    expect(distinct.size).toBeGreaterThan(10);
  });

  it("shuffles the order even when two students draw the same questions", () => {
    const questions = pool(5);
    const orders = new Set(
      Array.from({ length: 30 }, () =>
        drawQuestionsForAttempt(questions, { MCQ: 5 }, new Map())
          .map((question) => question.id)
          .join(","),
      ),
    );

    // Same five questions every time — but not in the same sequence.
    expect(orders.size).toBeGreaterThan(1);
  });

  it("takes the whole bucket rather than throwing when a type is short", () => {
    // The validator refuses this at authoring time; a live attempt is the worst moment to fail.
    const paper = drawQuestionsForAttempt(pool(3), { MCQ: 10 }, new Map());
    expect(paper).toHaveLength(3);
  });

  it("ignores types the faculty asked zero of", () => {
    const paper = drawQuestionsForAttempt(pool(10, 10), { MCQ: 3, Coding: 0 }, new Map());

    expect(paper).toHaveLength(3);
    expect(paper.every((question) => question.type === "MCQ")).toBe(true);
  });

  it("is deterministic when handed a fixed random source", () => {
    const questions = pool(10);
    const fixed = () => 0.42;

    const first = drawQuestionsForAttempt(questions, { MCQ: 4 }, new Map(), fixed);
    const second = drawQuestionsForAttempt(questions, { MCQ: 4 }, new Map(), fixed);

    expect(first.map((q) => q.id)).toEqual(second.map((q) => q.id));
  });
});

describe("option shuffling", () => {
  it("reorders the options without adding or dropping any", () => {
    const question = mcq("q1");
    const order = drawOptionOrder(question);

    expect(order).toHaveLength(4);
    expect([...order!].sort()).toEqual(["A", "B", "C", "D"]);
  });

  it("produces no option order for questions that have none", () => {
    expect(drawOptionOrder(coding("c1"))).toBeUndefined();
  });

  it("shows the student their own order", () => {
    const question = mcq("q1");
    const projected = toStudentQuestion(question, ["D", "C", "B", "A"]);

    expect(projected.options).toEqual(["D", "C", "B", "A"]);
  });

  it("falls back to the authored order if the stored order no longer matches the question", () => {
    // Defensive: an edited option list must not drop or invent choices for a mid-flight attempt.
    const question = mcq("q1");
    expect(toStudentQuestion(question, ["A", "B"]).options).toEqual(["A", "B", "C", "D"]);
    expect(toStudentQuestion(question, ["A", "B", "C", "Z"]).options).toEqual(["A", "B", "C", "D"]);
  });

  it("does not affect grading, because answers are matched by text", () => {
    const question = mcq("q1");

    // The student saw D, C, B, A and picked "A" — still the correct answer.
    expect(scoreObjectiveAnswer(question, "A")).toBe(5);
    expect(scoreObjectiveAnswer(question, "B")).toBe(0);
  });
});
