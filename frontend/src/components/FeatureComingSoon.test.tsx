import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { FeatureComingSoon } from "./FeatureComingSoon";
import { CLASS_TESTS_ENABLED } from "@/lib/feature-flags";

vi.mock("@/api/services", () => ({
  userApi: { me: vi.fn().mockResolvedValue({ user: null }) },
  classTestApi: { listAssigned: vi.fn() },
}));

function renderPlaceholder() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FeatureComingSoon title="Class Tests" description="Rolling out soon." />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("feature flags", () => {
  it("keeps Class Tests hidden until the flag is flipped", () => {
    // This is the switch, and the only thing that needs changing to ship the feature — the pages,
    // routes, API client and backend all stay in place behind it.
    expect(CLASS_TESTS_ENABLED).toBe(false);
  });
});

describe("FeatureComingSoon", () => {
  it("says the feature is under development", () => {
    renderPlaceholder();
    expect(screen.getByText("Class Tests")).toBeInTheDocument();
    expect(screen.getByText("Under development")).toBeInTheDocument();
    expect(screen.getByText("Rolling out soon.")).toBeInTheDocument();
  });

  it("falls back to a default message", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FeatureComingSoon title="Something" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText(/under development and will be rolled out soon/i)).toBeInTheDocument();
  });
});
