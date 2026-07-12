import React, { type ReactNode } from "react";

type RouteErrorBoundaryProps = {
  children: ReactNode;
};

type RouteErrorBoundaryState = {
  hasError: boolean;
};

export class RouteErrorBoundary extends React.Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): RouteErrorBoundaryState {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="container py-8">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
            Something went wrong while loading this faculty problem page. Please refresh the page. If it keeps happening, the page data or a UI component is still throwing at runtime.
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
