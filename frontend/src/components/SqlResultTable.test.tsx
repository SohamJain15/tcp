import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The module pulls in the Monaco editor via SqlWorkspace; stub it so the import is jsdom-safe.
vi.mock("@monaco-editor/react", () => ({ default: () => null }));

import { SqlResultTable } from "./SqlWorkspace";

describe("SqlResultTable", () => {
  it("renders columns and cell values", () => {
    render(<SqlResultTable result={{ columns: ["id", "name"], rows: [[1, "amy"], [2, "bob"]], truncated: false }} />);
    expect(screen.getByText("id")).toBeInTheDocument();
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("amy")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("renders NULL cells distinctly", () => {
    render(<SqlResultTable result={{ columns: ["v"], rows: [[null]], truncated: false }} />);
    expect(screen.getByText("NULL")).toBeInTheDocument();
  });

  it("notes when the result was truncated", () => {
    render(<SqlResultTable result={{ columns: ["v"], rows: [[1]], truncated: true }} />);
    expect(screen.getByText(/Showing the first/)).toBeInTheDocument();
  });
});
