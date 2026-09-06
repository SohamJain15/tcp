import type { CSSProperties, ReactNode } from "react";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

/**
 * Coding workspaces are horizontal resizable split panes that are unusable below ~1024px (a
 * ~150px statement column beside a ~150px editor). These three wrappers collapse the split into
 * a single stacked, scrollable column when `stack` is true, leaving the children untouched — so
 * the mobile layout is a thin switch, not a second copy of the page.
 */
export function ResizableStackGroup({
  stack,
  direction = "horizontal",
  className,
  autoSaveId,
  stackClassName = "flex w-full flex-col gap-3",
  children,
}: {
  stack: boolean;
  direction?: "horizontal" | "vertical";
  className?: string;
  /** Remembers the pane split for this workspace, per tab. Omit to leave sizes unsaved. */
  autoSaveId?: string;
  stackClassName?: string;
  children: ReactNode;
}) {
  if (stack) {
    return <div className={stackClassName}>{children}</div>;
  }
  return (
    <ResizablePanelGroup
      direction={direction}
      className={className}
      autoSaveId={autoSaveId}
      // sessionStorage, not localStorage: a split a student dragged for one paper should not
      // follow them into the next one on a shared lab machine.
      storage={typeof window === "undefined" ? undefined : window.sessionStorage}
    >
      {children}
    </ResizablePanelGroup>
  );
}

export function ResizableStackPane({
  stack,
  stackClassName,
  stackStyle,
  defaultSize,
  minSize,
  className,
  children,
}: {
  stack: boolean;
  stackClassName?: string;
  /** Stacked-only inline style, for a height the caller computes (Tailwind cannot). */
  stackStyle?: CSSProperties;
  defaultSize?: number;
  minSize?: number;
  className?: string;
  children: ReactNode;
}) {
  if (stack) {
    return (
      <div className={stackClassName} style={stackStyle}>
        {children}
      </div>
    );
  }
  return (
    <ResizablePanel defaultSize={defaultSize} minSize={minSize} className={className}>
      {children}
    </ResizablePanel>
  );
}

export function ResizableStackHandle({ stack, className }: { stack: boolean; className?: string }) {
  if (stack) {
    return null;
  }
  return <ResizableHandle withHandle className={className} />;
}
