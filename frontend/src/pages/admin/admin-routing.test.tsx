import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEPARTMENTS, type UserProfile } from "@/api/types";
import { RoleRoute } from "@/components/RoleRoute";
import { DEPARTMENT_ICONS } from "@/lib/department-icons";
import { getHomePathForRole } from "@/lib/role-routing";
import AdminDashboard from "./Dashboard";

vi.mock("@/api/services", () => ({
  userApi: { me: vi.fn() },
  classTestApi: { listAssigned: vi.fn().mockResolvedValue({ items: [] }) },
}));

const { userApi } = await import("@/api/services");

function buildUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    email: "principal@tcetmumbai.in",
    role: "ADMIN",
    name: "Principal",
    uid: null,
    isProfileComplete: true,
    designation: null,
    isHod: false,
    rollNumber: null,
    department: null,
    semester: null,
    linkedInUrl: null,
    githubUrl: null,
    skills: [],
    rating: 0,
    score: 0,
    problemsSolved: 0,
    submissionCount: 0,
    acceptedSubmissionCount: 0,
    accuracy: 0,
    rank: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    lastLoginAt: null,
    lastAcceptedAt: null,
    ...overrides,
  };
}

function renderGuarded(user: UserProfile, initialPath: string) {
  vi.mocked(userApi.me).mockResolvedValue({ user });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="/admin/dashboard"
            element={
              <RoleRoute allowedRole="ADMIN">
                <div>Administration area</div>
              </RoleRoute>
            }
          />
          <Route
            path="/faculty/dashboard"
            element={
              <RoleRoute allowedRole="FACULTY">
                <div>Faculty area</div>
              </RoleRoute>
            }
          />
          <Route path="/student/dashboard" element={<div>Student area</div>} />
          <Route path="/complete-profile" element={<div>Complete your profile</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("admin role routing", () => {
  it("sends each role to its own home", () => {
    expect(getHomePathForRole("ADMIN")).toBe("/admin/dashboard");
    expect(getHomePathForRole("FACULTY")).toBe("/faculty/dashboard");
    expect(getHomePathForRole("STUDENT")).toBe("/student/dashboard");
  });

  it("lets an admin into the admin area", async () => {
    renderGuarded(buildUser(), "/admin/dashboard");
    expect(await screen.findByText("Administration area")).toBeInTheDocument();
  });

  it("keeps faculty out of the admin area", async () => {
    renderGuarded(buildUser({ role: "FACULTY", isProfileComplete: true }), "/admin/dashboard");
    expect(await screen.findByText("Faculty area")).toBeInTheDocument();
    expect(screen.queryByText("Administration area")).not.toBeInTheDocument();
  });

  it("keeps students out of the admin area", async () => {
    renderGuarded(
      buildUser({ role: "STUDENT", uid: "TCET-REAL-001", isProfileComplete: true }),
      "/admin/dashboard",
    );
    expect(await screen.findByText("Student area")).toBeInTheDocument();
  });

  it("never sends an admin to complete a profile", async () => {
    // An admin has no department, UID or designation. Treating them like faculty would trap them on
    // a form they can neither fill in nor submit.
    renderGuarded(buildUser({ isProfileComplete: false }), "/admin/dashboard");
    expect(await screen.findByText("Administration area")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Complete your profile")).not.toBeInTheDocument();
    });
  });
});

describe("admin dashboard", () => {
  it("renders a card for every canonical department", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(userApi.me).mockResolvedValue({ user: buildUser() });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminDashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Assert on hrefs rather than accessible names: several departments share a "B.Tech" prefix, so
    // a name query would match four cards at once. Scoped to department routes because AppLayout's
    // navbar contributes links of its own.
    const departmentLinks = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href") ?? "")
      .filter((href) => href.startsWith("/admin/departments/"));

    expect(departmentLinks).toHaveLength(DEPARTMENTS.length);
    for (const department of DEPARTMENTS) {
      expect(departmentLinks).toContain(`/admin/departments/${encodeURIComponent(department)}`);
    }
  });

  it("has an icon for every department", () => {
    // DEPARTMENT_ICONS is a total Record, so a missing entry is a compile error — this asserts the
    // runtime shape too, in case the canonical list is ever widened from an untyped source.
    // Lucide icons are forwardRef components, i.e. objects rather than plain functions.
    for (const department of DEPARTMENTS) {
      expect(DEPARTMENT_ICONS[department]).toBeTruthy();
    }
    expect(new Set(Object.values(DEPARTMENT_ICONS)).size).toBe(DEPARTMENTS.length);
  });
});
