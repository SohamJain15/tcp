import { describe, expect, it } from "vitest";

import {
  generateCrosswordLayout,
  scoreCrosswordAnswer,
  toStudentQuestion,
  type ClassTestCrosswordQuestion,
  type CrosswordEntry,
  type CrosswordLayout,
} from "../modules/classtest/classtest.model";
import { parseClueResponse } from "../modules/classtest/ai/crossword-clue-generator";
import { createClassTestSchema } from "../modules/classtest/classtest.validator";

/**
 * The layout and scoring are pure functions, so these test them directly. A seeded RNG makes the
 * "grid varies between students" and "always succeeds" properties assertable without flakiness.
 */

function crossword(entries: CrosswordEntry[], points = 10): ClassTestCrosswordQuestion {
  return { id: "cw_1", type: "Crossword", points, statement: "Solve it", entries };
}

/** A tiny deterministic PRNG so a test can reproduce a specific grid. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Reads a placed word straight off the grid, so we can prove the geometry spells the answer. */
function readSlot(
  layout: CrosswordLayout,
  cells: Map<string, string>,
  slotNumber: number,
  direction: "across" | "down",
): string {
  const slot = layout.slots.find((item) => item.number === slotNumber && item.direction === direction);
  if (!slot) {
    return "";
  }
  let word = "";
  for (let i = 0; i < slot.length; i += 1) {
    const r = slot.row + (direction === "down" ? i : 0);
    const c = slot.col + (direction === "across" ? i : 0);
    word += cells.get(`${r},${c}`) ?? "?";
  }
  return word;
}

/** Rebuilds the letter grid from a layout + the question's answers. */
function fillCells(layout: CrosswordLayout, entries: CrosswordEntry[]): Map<string, string> {
  const cells = new Map<string, string>();
  for (const slot of layout.slots) {
    const word = entries[slot.entryIndex].answer.toUpperCase();
    for (let i = 0; i < word.length; i += 1) {
      const r = slot.row + (slot.direction === "down" ? i : 0);
      const c = slot.col + (slot.direction === "across" ? i : 0);
      cells.set(`${r},${c}`, word[i]);
    }
  }
  return cells;
}

describe("generateCrosswordLayout", () => {
  const interlocking: CrosswordEntry[] = [
    { answer: "PYTHON", clue: "A language" },
    { answer: "TYPE", clue: "Kind" },
    { answer: "LOOP", clue: "Repeat" },
    { answer: "NODE", clue: "Graph vertex" },
  ];

  it("places every word and spells each answer along its slot", () => {
    const layout = generateCrosswordLayout(interlocking, seededRandom(7));
    expect(layout.slots).toHaveLength(interlocking.length);

    const cells = fillCells(layout, interlocking);
    for (const slot of layout.slots) {
      expect(readSlot(layout, cells, slot.number, slot.direction)).toBe(
        interlocking[slot.entryIndex].answer,
      );
    }
  });

  it("interlocks at least one word rather than laying them all in parallel", () => {
    const layout = generateCrosswordLayout(interlocking, seededRandom(3));
    const across = layout.slots.filter((slot) => slot.direction === "across").length;
    const down = layout.slots.filter((slot) => slot.direction === "down").length;
    // A real crossing forces both orientations to appear.
    expect(across).toBeGreaterThan(0);
    expect(down).toBeGreaterThan(0);
  });

  it("never throws for words that share no letters — each still gets placed", () => {
    const disjoint: CrosswordEntry[] = [
      { answer: "ABC", clue: "one" },
      { answer: "XYZ", clue: "two" },
    ];
    const layout = generateCrosswordLayout(disjoint, seededRandom(1));
    expect(layout.slots).toHaveLength(2);
    const cells = fillCells(layout, disjoint);
    expect(readSlot(layout, cells, layout.slots[0].number, layout.slots[0].direction)).toHaveLength(3);
  });

  it("normalizes to a tight, origin-anchored bounding box", () => {
    const layout = generateCrosswordLayout(interlocking, seededRandom(5));
    const minRow = Math.min(...layout.slots.map((slot) => slot.row));
    const minCol = Math.min(...layout.slots.map((slot) => slot.col));
    expect(minRow).toBe(0);
    expect(minCol).toBe(0);
    expect(layout.rows).toBeGreaterThan(0);
    expect(layout.cols).toBeGreaterThan(0);
  });

  it("numbers start cells in scan order and shares a number across+down at one cell", () => {
    const layout = generateCrosswordLayout(interlocking, seededRandom(9));
    const byCell = new Map<string, Set<number>>();
    for (const slot of layout.slots) {
      const key = `${slot.row},${slot.col}`;
      byCell.set(key, (byCell.get(key) ?? new Set()).add(slot.number));
    }
    // Every distinct start cell carries exactly one number.
    for (const numbers of byCell.values()) {
      expect(numbers.size).toBe(1);
    }
    // Numbers are unique per start cell and cover 1..N with no gaps.
    const numbers = [...new Set(layout.slots.map((slot) => slot.number))].sort((a, b) => a - b);
    expect(numbers[0]).toBe(1);
    expect(numbers[numbers.length - 1]).toBe(numbers.length);
  });

  it("gives different students different grids", () => {
    const a = generateCrosswordLayout(interlocking, seededRandom(11));
    const b = generateCrosswordLayout(interlocking, seededRandom(999));
    // Two seeds should not produce an identical arrangement of the same words.
    expect(JSON.stringify(a.slots)).not.toBe(JSON.stringify(b.slots));
  });
});

describe("toStudentQuestion (crossword)", () => {
  it("sends clues and geometry but never the answer letters", () => {
    const entries: CrosswordEntry[] = [
      { answer: "PYTHON", clue: "A language" },
      { answer: "TYPE", clue: "Kind" },
    ];
    const layout = generateCrosswordLayout(entries, seededRandom(2));
    const projected = toStudentQuestion(crossword(entries), undefined, layout);

    expect(projected.crossword).toBeDefined();
    expect(projected.crossword?.slots).toHaveLength(layout.slots.length);
    const serialized = JSON.stringify(projected.crossword);
    // No slot carries an "answer" field, and the clues are present.
    expect(serialized).not.toContain("PYTHON");
    expect(serialized).toContain("A language");
    for (const slot of projected.crossword!.slots) {
      expect(slot).not.toHaveProperty("answer");
      expect(slot.clue.length).toBeGreaterThan(0);
    }
  });
});

describe("scoreCrosswordAnswer", () => {
  const entries: CrosswordEntry[] = [
    { answer: "CAT", clue: "pet" },
    { answer: "TREE", clue: "plant" },
    { answer: "EAR", clue: "hears" },
  ];
  const question = crossword(entries, 9);
  const layout = generateCrosswordLayout(entries, seededRandom(4));

  const answerFor = (correct: number): string => {
    const filled: Record<string, string> = {};
    layout.slots.forEach((slot, index) => {
      const key = `${slot.number}-${slot.direction}`;
      filled[key] = index < correct ? entries[slot.entryIndex].answer : "WRONG";
    });
    return JSON.stringify(filled);
  };

  it("awards full points when every word is correct", () => {
    expect(scoreCrosswordAnswer(question, layout, answerFor(layout.slots.length))).toBe(9);
  });

  it("gives per-word partial credit", () => {
    const half = Math.floor(layout.slots.length / 2);
    const expected = Math.round((9 * half) / layout.slots.length);
    expect(scoreCrosswordAnswer(question, layout, answerFor(half))).toBe(expected);
  });

  it("is case-insensitive and trims", () => {
    const key = `${layout.slots[0].number}-${layout.slots[0].direction}`;
    const filled = { [key]: `  ${entries[layout.slots[0].entryIndex].answer.toLowerCase()} ` };
    expect(scoreCrosswordAnswer(question, layout, JSON.stringify(filled))).toBeGreaterThan(0);
  });

  it("scores 0 for empty, non-string or malformed JSON answers", () => {
    expect(scoreCrosswordAnswer(question, layout, null)).toBe(0);
    expect(scoreCrosswordAnswer(question, layout, "not json")).toBe(0);
    expect(scoreCrosswordAnswer(question, layout, ["a"])).toBe(0);
    expect(scoreCrosswordAnswer(question, undefined, "{}")).toBe(0);
  });
});

describe("crossword validation", () => {
  const body = (entries: unknown) => ({
    title: "Weekly crossword",
    subject: "General",
    startAt: "2026-05-07T10:00:00.000Z",
    durationMinutes: 30,
    audience: { department: "B.E. Computer Engineering", division: null, semester: null, rollFrom: null, rollTo: null },
    questions: [{ type: "Crossword", points: 10, statement: "Solve it", entries }],
  });

  it("accepts a valid set and uppercases the answers", () => {
    const result = createClassTestSchema.safeParse(
      body([
        { answer: "python", clue: "A language" },
        { answer: "loop", clue: "Repeat" },
      ]),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      const question = result.data.questions[0];
      expect(question.type).toBe("Crossword");
      if (question.type === "Crossword") {
        expect(question.entries.map((entry) => entry.answer)).toEqual(["PYTHON", "LOOP"]);
      }
    }
  });

  it("rejects fewer than two words", () => {
    expect(createClassTestSchema.safeParse(body([{ answer: "SOLO", clue: "one" }])).success).toBe(false);
  });

  it("rejects a non-letter answer", () => {
    const result = createClassTestSchema.safeParse(
      body([
        { answer: "A1", clue: "bad" },
        { answer: "GOOD", clue: "fine" },
      ]),
    );
    expect(result.success).toBe(false);
  });

  it("rejects duplicate words", () => {
    const result = createClassTestSchema.safeParse(
      body([
        { answer: "CAT", clue: "pet" },
        { answer: "cat", clue: "same word" },
      ]),
    );
    expect(result.success).toBe(false);
  });
});

describe("parseClueResponse", () => {
  const words = ["PYTHON", "LOOP"];

  it("accepts one usable clue per word, in order", () => {
    const raw = JSON.stringify({
      clues: [
        { word: "PYTHON", clue: "A popular scripting language" },
        { word: "LOOP", clue: "It repeats" },
      ],
    });
    expect(parseClueResponse(raw, words)).toEqual([
      { word: "PYTHON", clue: "A popular scripting language" },
      { word: "LOOP", clue: "It repeats" },
    ]);
  });

  it("rejects a clue that leaks its own word", () => {
    const raw = JSON.stringify({
      clues: [
        { word: "PYTHON", clue: "The python language" },
        { word: "LOOP", clue: "It repeats" },
      ],
    });
    expect(parseClueResponse(raw, words)).toBeNull();
  });

  it("rejects a reply whose count does not match the words", () => {
    const raw = JSON.stringify({ clues: [{ word: "PYTHON", clue: "A language" }] });
    expect(parseClueResponse(raw, words)).toBeNull();
  });

  it("rejects non-JSON", () => {
    expect(parseClueResponse("nonsense", words)).toBeNull();
  });
});
