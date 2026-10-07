import { Component, type ReactNode } from "react";
import { Link } from "react-router-dom";

export class PageErrorBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(previous: { resetKey: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed)
      this.setState({ failed: false });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section role="alert" className="px-4 py-8">
        <h2 className="text-lg">This page could not load</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A connection or app update may have interrupted loading. Your
          navigation remains available.
        </p>
        <button
          className="pill-tab mt-4"
          onClick={() => window.location.reload()}
        >
          Reload this page
        </button>
        <Link className="inline-block ml-4 text-sm text-primary" to="/">Return Home</Link>
      </section>
    );
  }
}
