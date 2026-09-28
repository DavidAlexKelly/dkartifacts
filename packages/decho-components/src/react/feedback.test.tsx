/**
 * The queue reducer, the banner and the boundary.
 *
 * The reducer gets the exhaustive treatment: it holds the three behaviours
 * that hand-rolled toast code gets wrong, and they are all decisions about
 * dropping information, which is the thing worth being sure about.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import React from "react";
import { Banner } from "./Banner.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { ToastCard } from "./Toast.js";
import { MAX_TOASTS, defaultDuration, toastReducer, type ToastState } from "./toastQueue.js";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const empty: ToastState = { toasts: [] };

const push = (state: ToastState, id: string, extra: Record<string, unknown> = {}): ToastState =>
  toastReducer(state, { type: "push", toast: { id, message: id, ...extra } });

describe("toastReducer", () => {
  it("keeps several at once, rather than replacing the last", () => {
    // The real failure: a batch of five writes showed the fifth result and
    // silently dropped the other four, including a failure.
    let state = empty;
    state = push(state, "a");
    state = push(state, "b");
    expect(state.toasts.map((toast) => toast.id)).toEqual(["a", "b"]);
  });

  it("caps the stack and drops the oldest, not the newest", () => {
    let state = empty;
    for (let index = 0; index < MAX_TOASTS + 2; index += 1) {
      state = push(state, `t${index}`);
    }
    expect(state.toasts).toHaveLength(MAX_TOASTS);
    expect(state.toasts[0]?.id).toBe("t2");
    expect(state.toasts[state.toasts.length - 1]?.id).toBe(`t${MAX_TOASTS + 1}`);
  });

  it("collapses repeats by key into one with a count", () => {
    // "Save failed" eleven times is noisier and less informative than once
    // with ×11.
    let state = empty;
    state = push(state, "a", { key: "save-failed" });
    state = push(state, "b", { key: "save-failed" });
    state = push(state, "c", { key: "save-failed" });
    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0]?.count).toBe(3);
  });

  it("keeps the original id when collapsing, so a pending timer still matches", () => {
    let state = push(empty, "first", { key: "k" });
    state = push(state, "second", { key: "k" });
    expect(state.toasts[0]?.id).toBe("first");
  });

  it("does not collapse toasts without a key", () => {
    let state = push(empty, "a", { message: "Saved" });
    state = push(state, "b", { message: "Saved" });
    expect(state.toasts).toHaveLength(2);
  });

  it("dismisses by id and clears everything", () => {
    let state = push(push(empty, "a"), "b");
    state = toastReducer(state, { type: "dismiss", id: "a" });
    expect(state.toasts.map((toast) => toast.id)).toEqual(["b"]);
    expect(toastReducer(state, { type: "clear" }).toasts).toEqual([]);
  });
});

describe("defaultDuration", () => {
  it("never auto-dismisses a failure", () => {
    // An error that vanishes before it is read is indistinguishable from no
    // feedback at all.
    expect(defaultDuration("danger")).toBeNull();
  });

  it("gives a warning longer than a success", () => {
    const warning = defaultDuration("warning");
    const success = defaultDuration("success");
    expect(warning).not.toBeNull();
    expect(success).not.toBeNull();
    expect(warning as number).toBeGreaterThan(success as number);
  });
});

describe("ToastCard", () => {
  it("shows the repeat count when there is one", () => {
    const markup = html(
      <ToastCard
        toast={{ id: "1", message: "Save failed", tone: "danger", count: 11 }}
        onDismiss={() => {}}
      />,
    );
    expect(markup).toContain("Save failed");
    expect(markup).toContain("×11");
  });

  it("labels its dismiss button", () => {
    const markup = html(
      <ToastCard toast={{ id: "1", message: "Saved" }} onDismiss={() => {}} />,
    );
    expect(markup).toContain('aria-label="Dismiss"');
  });
});

describe("Banner", () => {
  it("is polite by default and assertive on request", () => {
    expect(html(<Banner title="Heads up">Body</Banner>)).toContain('role="status"');
    expect(html(<Banner tone="danger" title="Failed" assertive />)).toContain('role="alert"');
  });

  it("puts the diagnostic behind a disclosure, not in the message", () => {
    const markup = html(
      <Banner tone="danger" title="Save failed" diagnostic="request-id: abc-123" />,
    );
    expect(markup).toContain("<details");
    expect(markup).toContain("request-id: abc-123");
    // The summary is the boring words; the id is inside.
    expect(markup).toContain("Technical detail");
  });

  it("wraps the diagnostic rather than scrolling it", () => {
    // A request id that needs horizontal scrolling is one nobody copies.
    const markup = html(<Banner diagnostic={"x".repeat(200)} />);
    expect(markup).toContain("pre-wrap");
  });

  it("has no dismiss button unless it can actually be dismissed", () => {
    expect(html(<Banner title="Note" />)).not.toContain('aria-label="Dismiss"');
    expect(html(<Banner title="Note" onDismiss={() => {}} />)).toContain('aria-label="Dismiss"');
  });

  it("paints an opaque tint, never a translucent wash", () => {
    // A wash over an unpainted host page takes the host's colour: the bug
    // that rendered five widget sets' cards black.
    const markup = html(<Banner tone="warning" title="Careful" />);
    expect(markup).toContain("--decho-color-warning-tint");
    expect(markup).not.toContain("--decho-color-warning-soft");
  });
});

describe("ErrorBoundary", () => {
  const Boom = (): React.ReactElement => {
    throw new Error("kaboom");
  };

  it("renders its children when nothing is wrong", () => {
    expect(html(<ErrorBoundary><span>fine</span></ErrorBoundary>)).toContain("fine");
  });

  it("names the view in the message, so a six-widget module says which", () => {
    // Rendered directly rather than through a throwing child: server
    // rendering does not run error boundaries, so the state is set by hand.
    const boundary = new ErrorBoundary({ children: null, label: "Readiness table" });
    boundary.state = { error: new Error("kaboom") };
    const markup = renderToStaticMarkup(boundary.render() as React.ReactElement);
    expect(markup).toContain("Readiness table could not be displayed");
    expect(markup).toContain("kaboom");
    expect(Boom).toBeTypeOf("function");
  });
});
