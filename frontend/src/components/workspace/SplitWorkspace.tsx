import { useRef, useState, type ReactNode } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { ChevronDown } from "lucide-react";

import { Card } from "@/components/ui/card";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ResizableStackGroup, ResizableStackHandle, ResizableStackPane } from "@/components/ResizableStack";
import { useIsNarrow } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * The layout every coding-style workspace on the platform shares: a statement beside a work pane,
 * the work pane split vertically into an editor and a collapsible console.
 *
 * Layout only — it owns no editor, no API and no mutation state. That is what lets a SQL
 * experiment, a contest question, a lab experiment and a class-test question all render the same
 * frame while keeping their own very different innards.
 *
 * Responsive rules, in one place so no caller re-derives them:
 * - Below 1024px (`useIsNarrow`) the horizontal split collapses to a single column: description on
 *   top, work pane below, no drag handles. This is the LeetCode-on-mobile shape.
 * - Stacked, the description flows at its natural height while the work pane takes a fixed
 *   `stackedWorkHeight`, because the inner vertical split needs a box to lay out inside.
 * - On desktop the description pane is `relative` with an absolutely-positioned scroll area, so a
 *   long statement scrolls on its own instead of stretching the group.
 * - Run / Submit live in the console header at both breakpoints, always one reach from the editor.
 * - A shell that fills the viewport should use `h-[100dvh]`, never `h-screen`: under a mobile URL
 *   bar `100vh` overflows and pushes the actions off-screen.
 */
export interface SplitWorkspaceProps {
  /** Left on desktop, top on mobile. Scrolls independently of the editor. */
  description: ReactNode;
  /** Right-top: the editor and its own toolbar (language picker, filename, Format). */
  editor: ReactNode;
  /** Right-bottom: output, results grid, verdict. Collapsible via the chevron. */
  console?: ReactNode;
  /** Right-aligned in the console header: Run / Submit. */
  actions?: ReactNode;
  /** One line beside the collapse chevron, e.g. "Accepted · 12/12 test cases passed". */
  statusLine?: ReactNode;
  /** Persists the pane split for this workspace in sessionStorage. */
  autoSaveId?: string;
  descriptionDefaultSize?: number;
  descriptionMinSize?: number;
  editorDefaultSize?: number;
  /** Height the work pane gets when stacked. Overlays and full-screen routes pass "100%". */
  stackedWorkHeight?: string;
  className?: string;
}

export function SplitWorkspace({
  description,
  editor,
  console: consoleContent,
  actions,
  statusLine,
  autoSaveId,
  descriptionDefaultSize = 40,
  descriptionMinSize = 28,
  editorDefaultSize = 68,
  stackedWorkHeight = "70vh",
  className,
}: SplitWorkspaceProps) {
  const isNarrow = useIsNarrow();
  const consolePanelRef = useRef<ImperativePanelHandle | null>(null);
  const [isConsoleCollapsed, setIsConsoleCollapsed] = useState(false);

  const toggleConsole = () => {
    const panel = consolePanelRef.current;
    if (!panel) {
      return;
    }
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  };

  return (
    <ResizableStackGroup
      stack={isNarrow}
      className={cn("h-full min-w-0 overflow-hidden", className)}
      autoSaveId={autoSaveId}
    >
      <ResizableStackPane
        stack={isNarrow}
        defaultSize={descriptionDefaultSize}
        minSize={descriptionMinSize}
        className="h-full"
      >
        <div className="relative w-full lg:h-full">
          <div className="p-4 lg:absolute lg:inset-0 lg:overflow-y-auto lg:p-6">{description}</div>
        </div>
      </ResizableStackPane>

      <ResizableStackHandle stack={isNarrow} className="bg-border" />

      {/* Stacked, the work pane gets a fixed height so the inner editor/console split has a box. */}
      <ResizableStackPane
        stack={isNarrow}
        stackClassName="w-full"
        stackStyle={{ height: stackedWorkHeight }}
        defaultSize={100 - descriptionDefaultSize}
        minSize={30}
        className="flex h-full flex-col overflow-hidden"
      >
        {/* Vertical split so a huge error log can be dragged smaller or collapsed instead of
            burying the editor. */}
        <ResizablePanelGroup direction="vertical" className="h-full min-h-0 p-3">
          <ResizablePanel defaultSize={editorDefaultSize} minSize={30}>
            {editor}
          </ResizablePanel>

          <ResizableHandle withHandle className="my-2 bg-border" />

          <ResizablePanel
            ref={consolePanelRef}
            defaultSize={100 - editorDefaultSize}
            minSize={12}
            collapsible
            collapsedSize={8}
            onCollapse={() => setIsConsoleCollapsed(true)}
            onExpand={() => setIsConsoleCollapsed(false)}
          >
            <Card className="flex h-full flex-col overflow-hidden shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleConsole}
                    aria-label={isConsoleCollapsed ? "Expand console" : "Collapse console"}
                    className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ChevronDown
                      className={cn("h-4 w-4 transition-transform duration-200", isConsoleCollapsed && "rotate-180")}
                    />
                  </button>
                  <div className="truncate text-sm text-muted-foreground">{statusLine}</div>
                </div>
                {actions && <div className="flex gap-2">{actions}</div>}
              </div>

              {/* Scrolls inside its own panel so a long compiler error can never push the editor away. */}
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 font-mono-code text-xs">
                {consoleContent}
              </div>
            </Card>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizableStackPane>
    </ResizableStackGroup>
  );
}
