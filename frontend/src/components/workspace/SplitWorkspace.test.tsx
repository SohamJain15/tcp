import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SplitWorkspace } from "./SplitWorkspace";

/** Answers `true` only for the queries listed, mirroring how a real browser evaluates them. */
function mockMatchMedia(matching: string[]) {
  const value = (query: string) => ({
    matches: matching.includes(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
  vi.spyOn(window, "matchMedia").mockImplementation(value as unknown as typeof window.matchMedia);
}

const NARROW = "(max-width: 1023px)";

function renderWorkspace() {
  return render(
    <SplitWorkspace
      description={<p>the statement</p>}
      editor={<p>the editor</p>}
      console={<p>the output</p>}
      actions={<button type="button">Run</button>}
      statusLine="ready"
    />,
  );
}

describe("SplitWorkspace", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders every slot on a wide screen", () => {
    mockMatchMedia([]);
    renderWorkspace();
    expect(screen.getByText("the statement")).toBeTruthy();
    expect(screen.getByText("the editor")).toBeTruthy();
    expect(screen.getByText("the output")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run" })).toBeTruthy();
    expect(screen.getByText("ready")).toBeTruthy();
  });

  it("keeps a drag handle between the statement and the work pane on a wide screen", () => {
    mockMatchMedia([]);
    const { container } = renderWorkspace();
    // Horizontal handle (between the panes) plus the vertical one (editor/console).
    expect(container.querySelectorAll('[data-panel-resize-handle-id]').length).toBeGreaterThan(1);
  });

  it("stacks into one column with no outer handle on a narrow screen", () => {
    mockMatchMedia([NARROW]);
    const { container } = renderWorkspace();
    // Every slot still renders — stacking is a layout switch, not a different page.
    expect(screen.getByText("the statement")).toBeTruthy();
    expect(screen.getByText("the editor")).toBeTruthy();
    // Only the inner editor/console handle survives; the outer split is gone.
    expect(container.querySelectorAll('[data-panel-resize-handle-id]').length).toBe(1);
  });

  it("gives the work pane the requested height when stacked", () => {
    mockMatchMedia([NARROW]);
    const { container } = render(
      <SplitWorkspace description={<p>d</p>} editor={<p>e</p>} stackedWorkHeight="100%" />,
    );
    expect(container.querySelector('[style*="height: 100%"]')).not.toBeNull();
  });

  it("omits the actions row when a workspace has no actions", () => {
    mockMatchMedia([]);
    render(<SplitWorkspace description={<p>d</p>} editor={<p>e</p>} statusLine="idle" />);
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
  });
});
