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
  it("has Class Tests switched on", () => {
    // The single switch behind the whole feature: the real pages and the navbar badge render
    // instead of the placeholder. Flipping it back to `false` restores the placeholder.
    expect(CLASS_TESTS_ENABLED).toBe(true);
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
