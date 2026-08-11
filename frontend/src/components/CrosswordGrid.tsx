import { useMemo, useRef } from "react";

import type { StudentCrossword, StudentCrosswordSlot } from "@/api/types";
import { cn } from "@/lib/utils";

/**
 * An interactive (or read-only) crossword grid.
 *
 * Fully controlled: the letters shown are derived from `value`, the JSON string the answer
 * channel carries — `{ "<number>-<direction>": "WORD" }` — and every keystroke re-serializes and
 * calls `onChange`. A cell shared by an across and a down word has one letter that feeds both,
 * because the state lives per cell, not per word, so a crossing can never disagree with itself.
 *
 * Real single-character `<input>`s are used so a phone's on-screen keyboard works unchanged.
 */
export interface CrosswordGridProps {
  crossword: StudentCrossword;
  /** JSON of the filled words, keyed `<number>-<direction>`. */
  value?: string;
  onChange?: (serialized: string) => void;
  readOnly?: boolean;
}

const cellKey = (row: number, col: number): string => `${row},${col}`;

function cellOfSlot(slot: StudentCrosswordSlot, index: number): [number, number] {
  return slot.direction === "down" ? [slot.row + index, slot.col] : [slot.row, slot.col + index];
}

function parseValue(value?: string): Record<string, string> {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function CrosswordGrid({ crossword, value, onChange, readOnly = false }: CrosswordGridProps) {
  const inputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());

  const { fillable, numberAt } = useMemo(() => {
    const fillableCells = new Set<string>();
    const numbers = new Map<string, number>();
    for (const slot of crossword.slots) {
      for (let i = 0; i < slot.length; i += 1) {
        const [r, c] = cellOfSlot(slot, i);
        fillableCells.add(cellKey(r, c));
      }
      const startKey = cellKey(slot.row, slot.col);
      const existing = numbers.get(startKey);
      numbers.set(startKey, existing === undefined ? slot.number : Math.min(existing, slot.number));
    }
    return { fillable: fillableCells, numberAt: numbers };
  }, [crossword.slots]);

  // Per-cell letters, derived from the serialized answer so the component stays controlled.
  const letters = useMemo(() => {
    const filled = parseValue(value);
    const map = new Map<string, string>();
    for (const slot of crossword.slots) {
      const word = (filled[`${slot.number}-${slot.direction}`] ?? "").toUpperCase();
      for (let i = 0; i < slot.length; i += 1) {
        const [r, c] = cellOfSlot(slot, i);
        const char = word[i] && word[i] !== " " ? word[i] : map.get(cellKey(r, c)) ?? "";
        map.set(cellKey(r, c), char);
      }
    }
    return map;
  }, [value, crossword.slots]);

  const emit = (nextLetters: Map<string, string>): void => {
    const filled: Record<string, string> = {};
    for (const slot of crossword.slots) {
      let word = "";
      for (let i = 0; i < slot.length; i += 1) {
        const [r, c] = cellOfSlot(slot, i);
        word += nextLetters.get(cellKey(r, c)) || " ";
      }
      const trimmed = word.replace(/\s+$/, "");
      if (trimmed.length > 0) {
        filled[`${slot.number}-${slot.direction}`] = trimmed;
      }
    }
    onChange?.(JSON.stringify(filled));
  };

  const setCell = (row: number, col: number, char: string): void => {
    const next = new Map(letters);
    next.set(cellKey(row, col), char.toUpperCase());
    emit(next);
  };

  const focusCell = (row: number, col: number): void => {
    const input = inputRefs.current.get(cellKey(row, col));
    input?.focus();
    input?.select();
  };

  /** The next fillable cell along a direction, or null at the grid edge / a block. */
  const step = (row: number, col: number, direction: "across" | "down", back = false): [number, number] | null => {
    const delta = back ? -1 : 1;
    const r = direction === "down" ? row + delta : row;
    const c = direction === "across" ? col + delta : col;
    return fillable.has(cellKey(r, c)) ? [r, c] : null;
  };

  /** Which direction a cell belongs to, preferring across when it is part of both. */
  const directionAt = (row: number, col: number): "across" | "down" => {
    const hasAcross = crossword.slots.some(
      (slot) =>
        slot.direction === "across" && slot.row === row && col >= slot.col && col < slot.col + slot.length,
    );
    return hasAcross ? "across" : "down";
  };

  const handleChange = (row: number, col: number, raw: string): void => {
    const char = raw.slice(-1).toUpperCase();
    if (char && /[A-Z]/.test(char)) {
      setCell(row, col, char);
      const next = step(row, col, directionAt(row, col));
      if (next) {
        focusCell(next[0], next[1]);
      }
    } else if (raw === "") {
      setCell(row, col, "");
    }
  };

  const handleKeyDown = (row: number, col: number, event: React.KeyboardEvent<HTMLInputElement>): void => {
    const direction = directionAt(row, col);
    if (event.key === "Backspace") {
      event.preventDefault();
      if (letters.get(cellKey(row, col))) {
        setCell(row, col, "");
      } else {
        const prev = step(row, col, direction, true);
        if (prev) {
          setCell(prev[0], prev[1], "");
          focusCell(prev[0], prev[1]);
        }
      }
      return;
    }

    const arrows: Record<string, [number, number]> = {
      ArrowRight: [0, 1],
      ArrowLeft: [0, -1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
    };
    const move = arrows[event.key];
    if (move) {
      event.preventDefault();
      const r = row + move[0];
      const c = col + move[1];
      if (fillable.has(cellKey(r, c))) {
        focusCell(r, c);
      }
    }
  };

  const across = crossword.slots.filter((slot) => slot.direction === "across").sort((a, b) => a.number - b.number);
  const down = crossword.slots.filter((slot) => slot.direction === "down").sort((a, b) => a.number - b.number);

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <div className="overflow-x-auto">
        <div
          className="grid w-max gap-px rounded border border-border bg-border p-px"
          style={{ gridTemplateColumns: `repeat(${crossword.cols}, minmax(0, 1fr))` }}
          role="grid"
          aria-label="Crossword grid"
        >
          {Array.from({ length: crossword.rows * crossword.cols }, (_, cellIndex) => {
            const row = Math.floor(cellIndex / crossword.cols);
            const col = cellIndex % crossword.cols;
            const key = cellKey(row, col);
            if (!fillable.has(key)) {
              return <div key={key} className="h-8 w-8 bg-muted/40 sm:h-9 sm:w-9" aria-hidden />;
            }
            const number = numberAt.get(key);
            return (
              <div key={key} className="relative h-8 w-8 bg-background sm:h-9 sm:w-9">
                {number !== undefined && (
                  <span className="pointer-events-none absolute left-0.5 top-0 text-[9px] leading-none text-muted-foreground">
                    {number}
                  </span>
                )}
                <input
                  ref={(element) => {
                    inputRefs.current.set(key, element);
                  }}
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  maxLength={1}
                  disabled={readOnly}
                  value={letters.get(key) ?? ""}
                  onChange={(event) => handleChange(row, col, event.target.value)}
                  onKeyDown={(event) => handleKeyDown(row, col, event)}
                  className="h-full w-full bg-transparent text-center text-sm font-semibold uppercase outline-none focus:bg-primary/10 disabled:cursor-default"
                  aria-label={number !== undefined ? `Cell ${number}` : "Cell"}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <ClueList title="Across" slots={across} />
        <ClueList title="Down" slots={down} />
      </div>
    </div>
  );
}

function ClueList({ title, slots }: { title: string; slots: StudentCrosswordSlot[] }) {
  if (slots.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ol className="space-y-1 text-sm">
        {slots.map((slot) => (
          <li key={`${slot.number}-${slot.direction}`} className="flex gap-2">
            <span className="min-w-[1.5rem] font-semibold tabular-nums">{slot.number}.</span>
            <span>{slot.clue}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
