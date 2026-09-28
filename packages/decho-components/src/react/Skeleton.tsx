/**
 * A loading placeholder.
 *
 * THE ONE PLACE THIS PACKAGE TOUCHES THE DOCUMENT
 * -----------------------------------------------
 * A shimmer is a `@keyframes` animation, and an inline style cannot declare
 * keyframes — there is no way to express one in a `style` attribute at all. So
 * this component injects a single rule, once per document, the first time an
 * animated skeleton renders:
 *
 *     @keyframes decho-skeleton-shimmer { … }
 *
 * That is a deliberate, documented exception to the rule that this package
 * writes nothing global. It is one prefixed keyframes name, it declares no
 * selector, it cannot affect an element that does not ask for it by name, and
 * it is guarded so a page with fifty skeletons still has one rule.
 *
 * `animated={false}` opts out and gets a flat tinted block, for a host whose
 * CSP forbids injected styles or a reviewer who would rather not have the
 * exception. Use `prefers-reduced-motion` and it opts itself out.
 */

import React, { useEffect } from "react";
import { resolveTokens, type DechoTokenSet } from "../core/vars.js";

const KEYFRAMES_ID = "decho-skeleton-keyframes";
const ANIMATION = "decho-skeleton-shimmer";

function ensureKeyframes(): void {
  if (typeof document === "undefined") {return;}
  if (document.getElementById(KEYFRAMES_ID) != null) {return;}
  const style = document.createElement("style");
  style.id = KEYFRAMES_ID;
  style.textContent = `@keyframes ${ANIMATION}{0%{background-position:200% 0}100%{background-position:-200% 0}}`;
  document.head.appendChild(style);
}

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `text` sizes itself to the current font; the others take `height`. */
  variant?: "text" | "block" | "circle";
  width?: number | string;
  height?: number | string;
  /** More than one line of `text`, with the last one short, as prose is. */
  lines?: number;
  animated?: boolean;
  tokens?: DechoTokenSet;
}

export function Skeleton({
  variant = "text",
  width,
  height,
  lines = 1,
  animated = true,
  tokens,
  style,
  ...rest
}: SkeletonProps): React.ReactElement {
  const t = resolveTokens(tokens);

  useEffect(() => {
    if (animated) {ensureKeyframes();}
  }, [animated]);

  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const moving = animated && !reduced;

  const block = (key: number, w?: number | string): React.ReactElement => (
    <div
      key={key}
      style={{
        width: w ?? width ?? "100%",
        height:
          height ?? (variant === "text" ? "1em" : variant === "circle" ? 32 : 64),
        borderRadius:
          variant === "circle"
            ? "50%"
            : variant === "text"
              ? t.radius.sm
              : t.radius.md,
        backgroundColor: t.color.surfaceRaised,
        backgroundImage: moving
          ? `linear-gradient(90deg, ${t.color.surfaceRaised} 25%, ${t.color.borderSubtle} 50%, ${t.color.surfaceRaised} 75%)`
          : undefined,
        backgroundSize: moving ? "200% 100%" : undefined,
        animation: moving ? `${ANIMATION} 1.5s ease-in-out infinite` : undefined,
      }}
    />
  );

  return (
    <div
      {...rest}
      // One status per placeholder group, not per line: the point is "this is
      // loading", and a screen reader repeating it four times is noise.
      role="status"
      aria-busy="true"
      aria-live="polite"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: t.space[2],
        ...style,
      }}
    >
      {Array.from({ length: Math.max(lines, 1) }, (_, i) =>
        block(i, i === lines - 1 && lines > 1 ? "60%" : undefined),
      )}
      <span
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          margin: -1,
          padding: 0,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        Loading
      </span>
    </div>
  );
}
