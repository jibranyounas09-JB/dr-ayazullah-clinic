import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  public handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      let displayMessage = this.state.error?.message || "An unexpected error occurred.";
      try {
        const parsed = JSON.parse(displayMessage);
        if (parsed.error) {
          displayMessage = `Database Operation Failed: ${parsed.error}`;
        }
      } catch {
        // Not a JSON error string
      }

      return (
        <div className="p-6 my-4 rounded-2xl bg-surface-container-low border border-error/20 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-error/10 text-error flex items-center justify-center">
            <span className="material-symbols-outlined text-[24px]">warning</span>
          </div>
          <h3 className="font-headline-sm font-bold text-on-surface">
            {this.props.fallbackTitle || "Something went wrong"}
          </h3>
          <p className="font-body-sm text-on-surface-variant max-w-md text-sm">
            {displayMessage}
          </p>
          <div className="flex gap-3 mt-2">
            <button
              onClick={this.handleRetry}
              className="px-5 py-2 rounded-full bg-primary hover:bg-primary-container text-on-primary font-label-md font-bold transition-colors cursor-pointer text-sm"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md font-medium transition-colors cursor-pointer text-sm"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
