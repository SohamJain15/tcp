import React, { type ReactNode } from "react";

type RouteErrorBoundaryProps = {
  children: ReactNode;
};

type RouteErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string;
};

export class RouteErrorBoundary extends React.Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(): RouteErrorBoundaryState {
    return { hasError: true, errorMessage: "" };
  }

  override componentDidCatch(error: Error): void {
    console.error("Faculty problem route crashed:", error);
    this.setState({ errorMessage: error.message || "Unknown runtime error" });
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="container py-8">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
            <div className="font-semibold">Faculty problem page crashed</div>
            <div className="mt-2">
              {this.state.errorMessage || "Something went wrong while loading this faculty problem page."}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
