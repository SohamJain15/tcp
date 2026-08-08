import type { ReactNode } from "react";

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
  children,
}: {
  stack: boolean;
  direction?: "horizontal" | "vertical";
  className?: string;
  children: ReactNode;
}) {
  if (stack) {
    return <div className="flex w-full flex-col gap-3">{children}</div>;
  }
  return (
    <ResizablePanelGroup direction={direction} className={className}>
      {children}
    </ResizablePanelGroup>
  );
}

export function ResizableStackPane({
  stack,
  stackClassName,
  defaultSize,
  minSize,
  className,
  children,
}: {
  stack: boolean;
  stackClassName?: string;
  defaultSize?: number;
  minSize?: number;
  className?: string;
  children: ReactNode;
}) {
  if (stack) {
    return <div className={stackClassName}>{children}</div>;
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
