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
vi.mock("@/api/classrooms", async (original) => ({
  ...(await original<typeof import("@/api/classrooms")>()),
  classroomApi: {
    list: vi.fn(),
    get: vi.fn(),
    join: vi.fn(),
    grade: vi.fn(),
    work: vi.fn(),
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
