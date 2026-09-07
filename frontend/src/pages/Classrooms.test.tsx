import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { classroomApi, type ClassroomDetail } from "@/api/classrooms";
import { ClassroomList, ClassroomPage } from "./Classrooms";
import CreateLab from "./faculty/CreateLab";
import { toast } from "sonner";
vi.mock("@/components/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock("@/components/SqlWorkspace", () => ({
  SqlResultTable: () => <div>SQL result table</div>,
}));
// Monaco needs a real layout engine, so the workspace's editor stands in as a textarea carrying
// the same accessible name the component gives the editor wrapper.
vi.mock("@monaco-editor/react", () => ({
  default: ({
    value,
    onChange,
    wrapperProps,
  }: {
    value: string;
    onChange: (next: string) => void;
    wrapperProps?: Record<string, string>;
  }) => (
    <textarea
      aria-label={wrapperProps?.["aria-label"]}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
vi.mock("@/api/classrooms", async (original) => ({
  ...(await original<typeof import("@/api/classrooms")>()),
  classroomApi: {
    list: vi.fn(),
    get: vi.fn(),
    join: vi.fn(),
    grade: vi.fn(),
    work: vi.fn(),
    experimentSchema: vi.fn(),
    sessionAction: vi.fn(),
    pdfUrl: () => "/history.pdf",
    csvUrl: () => "/gradebook.csv",
  },
}));
const detail: ClassroomDetail = {
  classroom: {
    id: "room",
    title: "Database Lab",
    subject: "DBMS",
    batch: "A1",
    kind: "DBMS",
    department: "B.E. Computer Engineering",
    semester: 4,
    description: null,
    lifecycleState: "Published",
    joinCode: "ABC123",
    experiments: [
      {
        id: "e1",
        kind: "sql",
        title: "Select students",
        number: 1,
        aim: "Read all rows",
        points: 100,
      },
    ],
    members: [
      {
        email: "student@example.com",
        name: "Ada Student",
        rollNumber: "35",
        batch: "A1",
        year: 2,
      },
    ],
    grades: [],
    average: null,
    sessions: [
      {
        id: "s1",
        title: "Practical one",
        startAt: "2026-09-08T04:30:00Z",
        durationMinutes: 60,
        language: "sql",
        activatedAt: "2026-09-08T04:30:00Z",
        closedAt: null,
        computedStatus: "Active",
        experiments: [
          {
            id: "e1",
            kind: "sql",
            title: "Select students",
            number: 1,
            aim: "Read all rows",
            points: 100,
          },
        ],
        roster: [
          {
            email: "student@example.com",
            name: "Ada Student",
            rollNumber: "35",
            batch: "A1",
            year: 2,
          },
        ],
        attendance: [],
      },
    ],
  },
  work: [],
  drafts: [],
};
function mount(faculty: boolean, list = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/labs/room"]}>
        <Routes>
          <Route
            path="/labs/:id"
            element={
              list ? (
                <ClassroomList faculty={faculty} />
              ) : (
                <ClassroomPage faculty={faculty} />
              )
            }
          />
          <Route
            path="/student/labs/joined"
            element={<div>Joined classroom</div>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(classroomApi.get).mockResolvedValue(structuredClone(detail));
  vi.mocked(classroomApi.grade).mockResolvedValue({});
});
describe("classroom screens", () => {
  it("only offers SQL experiments in a SQL classroom and rejects a coding JSON import", () => {
    const error = vi.spyOn(toast, "error");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/faculty/labs/create"]}><Routes><Route path="/faculty/labs/create" element={<CreateLab />} /></Routes></MemoryRouter></QueryClientProvider>);
    expect(screen.getByRole("button", { name: "+ SQL experiment" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Coding experiment" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Import from JSON" }));
    fireEvent.change(screen.getByPlaceholderText(/Paste an array/), { target: { value: JSON.stringify([{ kind: "coding", title: "Wrong kind", aim: "Coding" }]) } });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(error).toHaveBeenCalledWith("Every experiment must match the classroom kind");
    expect(screen.queryByDisplayValue("Wrong kind")).not.toBeInTheDocument();
  });
  it("joins using a classroom code", async () => {
    vi.mocked(classroomApi.list).mockResolvedValue({ items: [] });
    vi.mocked(classroomApi.join).mockResolvedValue({ id: "joined" });
    mount(false, true);
    fireEvent.change(screen.getByLabelText("Classroom code"), {
      target: { value: "ABC123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join classroom" }));
    expect(await screen.findByText("Joined classroom")).toBeInTheDocument();
    expect(classroomApi.join).toHaveBeenCalledWith("ABC123");
  });
  it("shows the teacher's marks grid and saves marks against the correct student and experiment", async () => {
    mount(true);
    await screen.findByText("Database Lab");
    fireEvent.click(screen.getByRole("button", { name: "Marks / 100" }));
    expect(screen.getByText("Ada Student")).toBeInTheDocument();
    expect(screen.getByText("35")).toBeInTheDocument();
    const mark = screen.getByLabelText("Mark out of 100");
    fireEvent.change(mark, { target: { value: "0" } });
    fireEvent.blur(mark);
    await waitFor(() =>
      expect(classroomApi.grade).toHaveBeenCalledWith(
        "room",
        "student@example.com",
        "e1",
        0,
      ),
    );
    expect(
      screen.getByRole("link", { name: /Download spreadsheet/ }),
    ).toHaveAttribute("href", "/gradebook.csv");
  });
  it("requires session entry and then sends official SQL work in the teacher's language", async () => {
    const entered = structuredClone(detail);
    entered.classroom.sessions[0].attendance = [
      { ...entered.classroom.members![0], enteredAt: "2026-09-08T04:31:00Z" },
    ];
    vi.mocked(classroomApi.get).mockResolvedValue(entered);
    vi.mocked(classroomApi.work).mockResolvedValue({ saved: true });
    mount(false);
    fireEvent.click(
      await screen.findByRole("button", { name: "Open experiment" }),
    );
    fireEvent.change(screen.getByLabelText("Your SQL"), {
      target: { value: "SELECT 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit experiment" }));
    await waitFor(() =>
      expect(classroomApi.work).toHaveBeenCalledWith(
        "room",
        "s1",
        expect.objectContaining({
          action: "submit",
          mode: "official",
          language: "sql",
          code: "SELECT 1",
          experimentId: "e1",
        }),
      ),
    );
  });
  it("renders the seeded schema as tables rather than as raw DDL", async () => {
    const entered = structuredClone(detail);
    entered.classroom.sessions[0].attendance = [
      { ...entered.classroom.members![0], enteredAt: "2026-09-08T04:31:00Z" },
    ];
    entered.classroom.sessions[0].experiments[0].schemaSql =
      "CREATE TABLE students (id INT, name VARCHAR(50));";
    vi.mocked(classroomApi.get).mockResolvedValue(entered);
    vi.mocked(classroomApi.experimentSchema).mockResolvedValue({
      tables: [
        {
          name: "students",
          columns: [
            { name: "id", dataType: "int", nullable: false, key: "PRI", extra: "" },
            { name: "name", dataType: "varchar(50)", nullable: true, key: "", extra: "" },
          ],
          rows: [[1, "Ada"]],
          rowCount: 1,
          truncated: false,
        },
      ],
    });
    mount(false);
    fireEvent.click(await screen.findByRole("button", { name: "Open experiment" }));
    // The table name and its columns are what a student needs to write the query against.
    expect(await screen.findByText("students")).toBeInTheDocument();
    expect(screen.getByText("varchar(50)")).toBeInTheDocument();
    expect(classroomApi.experimentSchema).toHaveBeenCalledWith("room", "s1", "e1");
    // The DDL is still reachable, just no longer the primary presentation.
    expect(screen.getByText("Show the SQL that creates this")).toBeInTheDocument();
  });
  it("uses the preview stored on the experiment without asking the server for one", async () => {
    const entered = structuredClone(detail);
    entered.classroom.sessions[0].attendance = [
      { ...entered.classroom.members![0], enteredAt: "2026-09-08T04:31:00Z" },
    ];
    const experiment = entered.classroom.sessions[0].experiments[0];
    experiment.schemaSql = "CREATE TABLE students (id INT);";
    experiment.schemaPreview = [
      {
        name: "students",
        columns: [{ name: "id", dataType: "int", nullable: false, key: "PRI", extra: "" }],
        rows: [[1]],
        rowCount: 1,
        truncated: false,
      },
    ];
    vi.mocked(classroomApi.get).mockResolvedValue(entered);
    mount(false);
    fireEvent.click(await screen.findByRole("button", { name: "Open experiment" }));
    expect(await screen.findByText("students")).toBeInTheDocument();
    // The whole point of precomputing: a batch opening this experiment costs no sandbox runs.
    expect(classroomApi.experimentSchema).not.toHaveBeenCalled();
  });
  it("falls back to the raw schema SQL when the table preview cannot be produced", async () => {
    const entered = structuredClone(detail);
    entered.classroom.sessions[0].attendance = [
      { ...entered.classroom.members![0], enteredAt: "2026-09-08T04:31:00Z" },
    ];
    entered.classroom.sessions[0].experiments[0].schemaSql = "CREATE TABLE students (id INT);";
    vi.mocked(classroomApi.get).mockResolvedValue(entered);
    vi.mocked(classroomApi.experimentSchema).mockRejectedValue(new Error("sandbox down"));
    mount(false);
    fireEvent.click(await screen.findByRole("button", { name: "Open experiment" }));
    expect(await screen.findByText(/table preview is unavailable/)).toBeInTheDocument();
    expect(screen.getByText("CREATE TABLE students (id INT);")).toBeInTheDocument();
  });
  it("shows a script experiment's rubric, its statements, and the tables it created", async () => {
    const scripted = structuredClone(detail);
    scripted.classroom.sessions[0].attendance = [
      { ...scripted.classroom.members![0], enteredAt: "2026-09-08T04:31:00Z" },
    ];
    const experiment = scripted.classroom.sessions[0].experiments[0];
    experiment.sqlMode = "script";
    experiment.title = "Design a schema";
    experiment.checkLabels = ["A primary key is defined"];
    vi.mocked(classroomApi.get).mockResolvedValue(scripted);
    vi.mocked(classroomApi.work).mockResolvedValue({
      work: {
        id: "w1",
        sessionId: "s1",
        experimentId: "e1",
        email: "student@example.com",
        mode: "official",
        action: "run",
        code: "CREATE TABLE dept (id INT PRIMARY KEY);",
        language: "sql",
        createdAt: "2026-09-08T04:32:00Z",
        output: {
          status: "EXECUTED",
          stdout: "",
          stderr: "",
          truncated: false,
          runtimeMs: 4,
          script: {
            ok: true,
            statements: [{ sql: "CREATE TABLE dept (id INT PRIMARY KEY)", kind: "ddl", affectedRows: 0 }],
            snapshot: [
              {
                name: "dept",
                columns: [{ name: "id", dataType: "int", nullable: false, key: "PRI", extra: "" }],
                rows: [],
                rowCount: 0,
                truncated: false,
              },
            ],
            checks: [{ label: "A primary key is defined", passed: true }],
            snapshotTruncated: false,
            timedOut: false,
            runtimeMs: 4,
          },
        },
      },
    });
    mount(false);
    fireEvent.click(await screen.findByRole("button", { name: "Open experiment" }));
    // The rubric is visible before the student writes anything — it is the task, not a reveal.
    expect(screen.getByText("A primary key is defined")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Your SQL"), {
      target: { value: "CREATE TABLE dept (id INT PRIMARY KEY);" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    // A CREATE TABLE has no result grid, so the tables it built are what the student needs back.
    const tables = await screen.findByRole("button", { name: /^Tables/ });
    expect(tables).toBeInTheDocument();
    expect(await screen.findByText("dept")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Result" }));
    expect(screen.getByText("CREATE TABLE dept (id INT PRIMARY KEY)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Checks" }));
    expect(screen.getAllByText("A primary key is defined").length).toBeGreaterThan(1);
  });
  it("shows absence separately from not-performed work and prevents starting an unentered session", async () => {
    mount(false);
    await screen.findByText("Database Lab");
    expect(
      screen.getByRole("button", { name: "Enter lab · Mark attendance" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open experiment" }),
    ).not.toBeInTheDocument();
  });
  it("uses practice mode after closing without changing official work", async () => {
    const ended = structuredClone(detail);
    ended.classroom.sessions[0].computedStatus = "Ended";
    vi.mocked(classroomApi.get).mockResolvedValue(ended);
    vi.mocked(classroomApi.work).mockResolvedValue({ saved: true });
    mount(false);
    fireEvent.click(await screen.findByRole("button", { name: "Practice" }));
    fireEvent.change(screen.getByLabelText("Your SQL"), {
      target: { value: "SELECT 2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save practice" }));
    await waitFor(() =>
      expect(classroomApi.work).toHaveBeenCalledWith(
        "room",
        "s1",
        expect.objectContaining({
          action: "submit",
          mode: "practice",
          language: "sql",
        }),
      ),
    );
  });
});
