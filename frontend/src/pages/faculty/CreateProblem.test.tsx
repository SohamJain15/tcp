import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { problemsApi } from "@/api/services";
import CreateProblem from "./CreateProblem";

vi.mock("@/components/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/api/services", () => ({
  problemsApi: { create: vi.fn(), importDraft: vi.fn() },
}));

const SEED = "CREATE TABLE students (id INT, name VARCHAR(50));";
const SOLUTION = "SELECT id, name FROM students ORDER BY id;";

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/faculty/create-problem"]}>
        <Routes>
          <Route path="/faculty/create-problem" element={<CreateProblem />} />
          <Route path="/faculty/problems/:id" element={<div>Saved</div>} />
          <Route path="/faculty/problems" element={<div>Problem list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Radix tabs activate on pointer-down, not on a synthetic click. */
function openFormBuilder() {
  const tab = screen.getByRole("tab", { name: "Form Builder" });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

/** The shared fields a problem of either kind needs before it can be published. */
function fillSharedFields() {
  // The form's labels are not associated with their controls, so select by placeholder.
  fireEvent.change(screen.getByPlaceholderText(/Maximum Subarray Sum/), {
    target: { value: "List all students" },
  });
  fireEvent.change(screen.getByPlaceholderText("Describe the problem..."), {
    target: { value: "Select every student ordered by id." },
  });
}

const selectType = (label: string) => fireEvent.click(screen.getByRole("button", { name: label }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(problemsApi.create).mockResolvedValue({ problem: { id: "p1" } } as never);
});

describe("Create Problems", () => {
  it("swaps the test-case editor for schema fields when SQL is selected", () => {
    mount();
    openFormBuilder();
    expect(screen.getByText("Test Cases")).toBeInTheDocument();

    selectType("SQL problem");
    expect(screen.queryByText("Test Cases")).not.toBeInTheDocument();
    expect(screen.getByText("Schema and reference query")).toBeInTheDocument();
    // Time and memory limits are Judge0 concepts; the SQL path ignores them entirely.
    expect(screen.queryByText("Limits")).not.toBeInTheDocument();
  });

  it("publishes a SQL problem with its schema and no test cases", async () => {
    mount();
    selectType("SQL problem");
    openFormBuilder();
    fillSharedFields();
    fireEvent.change(screen.getByLabelText("Schema + seed SQL (shown to students)"), {
      target: { value: SEED },
    });
    fireEvent.change(screen.getByLabelText("Reference (solution) query — hidden from students"), {
      target: { value: SOLUTION },
    });
    fireEvent.click(screen.getByRole("button", { name: /Publish/ }));

    await waitFor(() =>
      expect(problemsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "sql",
          sql: { schemaSql: SEED, solutionSql: SOLUTION, ordered: false },
          sampleTestCases: [],
          hiddenTestCases: [],
        }),
        expect.anything(),
      ),
    );
  });

  it("refuses to publish a SQL problem with no reference query", async () => {
    mount();
    selectType("SQL problem");
    openFormBuilder();
    fillSharedFields();
    fireEvent.change(screen.getByLabelText("Reference (solution) query — hidden from students"), {
      target: { value: "  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Publish/ }));
    await waitFor(() => expect(problemsApi.create).not.toHaveBeenCalled());
  });

  it("carries kind and sql through the import review, not just through validation", async () => {
    // Regression guard: the draft whitelist used to drop these, so an imported SQL problem was
    // saved as a coding one and rejected by the server for having no test cases.
    vi.mocked(problemsApi.importDraft).mockResolvedValue({
      drafts: [
        {
          kind: "sql",
          sql: { schemaSql: SEED, solutionSql: SOLUTION, ordered: true },
          title: "List all students",
          slug: "list-all-students",
          statement: "Select every student ordered by id.",
          difficulty: "Easy",
          topic: "SQL",
          tags: ["SQL"],
          constraints: ["At least one row"],
          inputFormat: "students",
          outputFormat: "id, name",
          explanation: "",
          timeLimitSeconds: 1,
          memoryLimitMb: 256,
          // Deliberately absent, exactly as the server returns them: the SQL draft schema declares
          // no test-case fields at all. Defaulting them in the mock hid a crash on `.length`.
        },
      ],
    } as never);

    mount();
    selectType("SQL problem");
    fireEvent.change(screen.getByPlaceholderText(/Paste|paste/), { target: { value: "[]" } });
    fireEvent.click(screen.getByRole("button", { name: /Validate JSON/ }));

    const approve = await screen.findByRole("checkbox");
    fireEvent.click(approve);
    fireEvent.click(screen.getByRole("button", { name: /Save Approved Problems/ }));

    await waitFor(() =>
      expect(problemsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "sql",
          sql: { schemaSql: SEED, solutionSql: SOLUTION, ordered: true },
        }),
        expect.anything(),
      ),
    );
  });

  it("rejects a batch whose problems do not match the selected type", async () => {
    vi.mocked(problemsApi.importDraft).mockResolvedValue({
      drafts: [
        {
          title: "Echo a number",
          slug: "echo-a-number",
          statement: "Read an integer and print it.",
          difficulty: "Easy",
          topic: "Basics",
          tags: ["Basics"],
          constraints: ["n fits in an int"],
          inputFormat: "n",
          outputFormat: "n",
          explanation: "",
          timeLimitSeconds: 1,
          memoryLimitMb: 256,
          sampleTestCases: [{ input: "5", output: "5" }],
          hiddenTestCases: [{ input: "9", output: "9" }],
        },
      ],
    } as never);

    mount();
    selectType("SQL problem");
    fireEvent.change(screen.getByPlaceholderText(/Paste|paste/), { target: { value: "[]" } });
    fireEvent.click(screen.getByRole("button", { name: /Validate JSON/ }));

    expect(await screen.findByText(/must match the selected problem type/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
