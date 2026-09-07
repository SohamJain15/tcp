import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { classTestApi } from "@/api/services";
import { ClassroomStudentPicker } from "./ClassroomStudentPicker";

vi.mock("@/api/services", () => ({
  classTestApi: { previewAudience: vi.fn() },
}));

function Harness() {
  const [selected, setSelected] = useState<string[] | null>([]);
  return (
    <>
      <ClassroomStudentPicker
        department="B.E. Computer Engineering"
        semester={4}
        selectedEmails={selected}
        onChange={setSelected}
      />
      <output data-testid="selection">{JSON.stringify(selected)}</output>
    </>
  );
}

describe("ClassroomStudentPicker", () => {
  it("filters candidates without enrolling them and requires explicit selection", async () => {
    vi.mocked(classTestApi.previewAudience).mockResolvedValue({
      students: [
        {
          email: "ada@example.com",
          name: "Ada",
          uid: null,
          rollNumber: "10",
          division: "A",
          semester: 4,
        },
        {
          email: "sam@example.com",
          name: "Sam",
          uid: null,
          rollNumber: "11",
          division: "A",
          semester: 4,
        },
      ],
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <Harness />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText("Roll number from"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText("Roll number to"), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Find students" }));
    await screen.findByText("Ada");
    expect(classTestApi.previewAudience).toHaveBeenCalledWith(
      expect.objectContaining({
        department: "B.E. Computer Engineering",
        semester: 4,
        rollFrom: 10,
        rollTo: 20,
      }),
    );
    expect(screen.getByTestId("selection")).toHaveTextContent("[]");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Ada" }));
    expect(screen.getByTestId("selection")).toHaveTextContent(
      '["ada@example.com"]',
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Select displayed students" }),
    );
    expect(screen.getByTestId("selection")).toHaveTextContent(
      '["ada@example.com","sam@example.com"]',
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getByTestId("selection")).toHaveTextContent("[]");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Restrict this lab workspace to selected students",
      }),
    );
    expect(screen.getByTestId("selection")).toHaveTextContent("null");
  });
});
