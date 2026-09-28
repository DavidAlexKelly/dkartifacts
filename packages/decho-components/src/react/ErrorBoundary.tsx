/**
 * The last line of defence: a render error shows a banner instead of a blank
 * widget.
 *
 * In a Foundry widget an uncaught render error unmounts the whole tree, and
 * what the user sees is an empty rectangle where their tool used to be — no
 * message, no clue, and nothing in the module to suggest which widget failed.
 * The Trinity frontend has one of these already, per application; this is the
 * same idea as a library component, so a widget set gets it by wrapping rather
 * than by writing a class component in every repository.
 *
 * WHY A CLASS
 * -----------
 * `componentDidCatch` has no hook equivalent. That is the whole reason, and it
 * is the only class in the package.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It does not retry by itself, and it does not clear its own error when props
 * change. An error boundary that resets on every re-render loops between
 * broken and broken-again, burning CPU and flickering. Recovery is the
 * caller's decision, taken with `resetKeys` or the button in `fallback`.
 */

import React from "react";
import { Banner } from "./Banner.js";
import type { DechoTokenSet } from "../core/vars.js";

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** What to show instead. Gets the error and a reset function. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
  /** Reported to the application: logging, a Foundry metric, an issue. */
  onError?: (error: Error, info: React.ErrorInfo) => void;
  /**
   * Values that, when they change, clear the error.
   *
   * A widget whose object set changed should get a fresh attempt; the same
   * widget re-rendering for an unrelated reason should not.
   */
  resetKeys?: readonly unknown[];
  /** Named in the message, so a module with six widgets says which one. */
  label?: string;
  tokens?: DechoTokenSet;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.props.onError?.(error, info);
    if (process.env["NODE_ENV"] !== "production") {
      // Logged as well as reported: in development the console is where a
      // developer is looking, and `onError` is usually unset there.
      console.error("[decho] ErrorBoundary caught:", error, info.componentStack);
    }
  }

  override componentDidUpdate(previous: ErrorBoundaryProps): void {
    const before = previous.resetKeys;
    const now = this.props.resetKeys;
    if (this.state.error == null || before == null || now == null) {
      return;
    }
    const changed =
      before.length !== now.length || now.some((key, index) => key !== before[index]);
    if (changed) {
      this.setState({ error: null });
    }
  }

  private reset = (): void => this.setState({ error: null });

  override render(): React.ReactNode {
    const { error } = this.state;
    if (error == null) {
      return this.props.children;
    }
    if (this.props.fallback != null) {
      return this.props.fallback(error, this.reset);
    }

    const what = this.props.label != null ? `${this.props.label} could not be displayed` : "This view could not be displayed";

    return (
      <Banner
        tone="danger"
        title={what}
        assertive
        // The message and the stack, because the person who sees this is the
        // person who has to report it.
        diagnostic={[error.message, error.stack].filter(Boolean).join("\n\n")}
        tokens={this.props.tokens}
      >
        The error has been reported. Nothing was saved by the action that failed.
      </Banner>
    );
  }
}
