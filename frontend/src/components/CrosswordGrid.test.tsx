import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CrosswordGrid } from "./CrosswordGrid";
import type { StudentCrossword } from "@/api/types";

/**
 * A 3x3 grid where CAT (1 across) and CAR (1 down) share the top-left "C". The shared cell is
 * exactly what makes a crossword a crossword, so it is the interesting thing to test: one letter
 * feeding both words, and a saved answer round-tripping back onto the grid.
 *
 * Fillable cells in DOM (row-major) order: (0,0), (0,1), (0,2), (1,0), (2,0).
 */
const crossword: StudentCrossword = {
  rows: 3,
  cols: 3,
  slots: [
    { number: 1, direction: "across", row: 0, col: 0, length: 3, clue: "Feline pet" },
    { number: 1, direction: "down", row: 0, col: 0, length: 3, clue: "A vehicle" },
  ],
};

/** Wrapper so the controlled grid can hold its own value the way the real page does. */
function Harness() {
  const [value, setValue] = useState<string | undefined>(undefined);
  return (
    <>
      <CrosswordGrid crossword={crossword} value={value} onChange={setValue} />
      <output data-testid="value">{value ?? ""}</output>
    </>
  );
}

const parseValue = (): Record<string, string> => {
  const raw = screen.getByTestId("value").textContent ?? "";
  return raw ? (JSON.parse(raw) as Record<string, string>) : {};
};

describe("CrosswordGrid", () => {
  it("renders the clues and the start number", () => {
    render(<CrosswordGrid crossword={crossword} value="" onChange={() => undefined} />);
    expect(screen.getByText("Feline pet")).toBeInTheDocument();
    expect(screen.getByText("A vehicle")).toBeInTheDocument();
    expect(screen.getAllByText("1.").length).toBeGreaterThan(0);
  });

  it("serializes a typed word into the answer JSON", () => {
    render(<Harness />);
    "CAT".split("").forEach((letter, index) => {
      const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
      fireEvent.change(inputs[index], { target: { value: letter } });
    });
    expect(parseValue()["1-across"]).toBe("CAT");
  });

  it("lets a shared cell feed both the across and the down word", () => {
    render(<Harness />);
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: "C" } });
    const value = parseValue();
    // The one "C" typed into the corner is the first letter of both words.
    expect(value["1-across"]).toBe("C");
    expect(value["1-down"]).toBe("C");
  });

  it("hydrates a saved answer back onto the grid", () => {
    render(<CrosswordGrid crossword={crossword} value='{"1-across":"CAT","1-down":"CAR"}' onChange={() => undefined} />);
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    // Across CAT across the top row, and the down word continues C-A-R down the first column.
    expect(inputs[0].value).toBe("C");
    expect(inputs[1].value).toBe("A");
    expect(inputs[2].value).toBe("T");
    expect(inputs[3].value).toBe("A");
    expect(inputs[4].value).toBe("R");
  });

  it("does not accept input when read-only", () => {
    render(<CrosswordGrid crossword={crossword} value="" onChange={() => undefined} readOnly />);
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    expect(inputs[0]).toBeDisabled();
  });
});
