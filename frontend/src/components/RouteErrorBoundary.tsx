import React, { type ReactNode } from "react";
import { reportClientError } from "@/lib/client-error-reporter";
import { GENERIC_PRODUCTION_ERROR_MESSAGE } from "@/lib/public-errors";

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

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    reportClientError("react", error, info.componentStack ?? undefined);
    this.setState({
      errorMessage: import.meta.env.PROD
        ? GENERIC_PRODUCTION_ERROR_MESSAGE
        : error.message || "Unknown runtime error",
    });
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="container py-8">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
            <div className="font-semibold">Something went wrong</div>
            <div className="mt-2">
              {this.state.errorMessage || GENERIC_PRODUCTION_ERROR_MESSAGE}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
