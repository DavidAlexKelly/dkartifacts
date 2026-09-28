/**
 * A slider, and a two-handled one, sharing everything but the handles.
 *
 * WHY NOT `<input type="range">`
 * -----------------------------
 * The single-handle case could be. The reasons not to: its track and thumb are
 * only styleable through vendor pseudo-elements that inline styles cannot
 * reach (so this package, which has no stylesheet, cannot theme it at all);
 * it has no two-handle form, so a range filter would be a different component
 * with different keyboard behaviour; and it cannot show the value on the
 * handle, which is what makes a slider usable without a separate readout.
 *
 * So: a div with `role="slider"`, which is the same accessibility contract,
 * driven by `sliderMath`. Keyboard support is the full native set — arrows,
 * Page keys, Home and End — because that is the part hand-rolled sliders
 * always skip, and a slider without a keyboard is an input some people simply
 * cannot use.
 *
 * DRAGGING
 * --------
 * Pointer events with `setPointerCapture`, so a drag that leaves the track
 * keeps working — the estate's opacity slider stops the moment the pointer
 * goes above the toolbar, which reads as the slider sticking.
 */

import React from "react";
import { resolveTokens, toneColors, type DechoTokenSet, type DechoTone } from "../core/vars.js";
import { focusRingStyle } from "../core/recipes.js";
import { Field } from "./Field.js";
import {
  fraction,
  keyStep,
  moveRangeEnd,
  nearestEnd,
  snap,
  valueAt,
  type Scale,
} from "./sliderMath.js";

interface Common {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  labelVariant?: "label" | "plain";
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** The six tones. `accent` by default. */
  tone?: DechoTone;
  /** Show the value beside the label. */
  showValue?: boolean;
  /** Turn a number into what the user should read: "42%", "1.2 km". */
  format?: (value: number) => string;
  /** Labelled stops under the track. */
  marks?: { value: number; label?: string }[];
  size?: "sm" | "md";
  id?: string;
  tokens?: DechoTokenSet;
}

export interface SliderProps extends Common {
  value: number;
  onValueChange: (value: number) => void;
}

export interface RangeSliderProps extends Common {
  value: [number, number];
  onValueChange: (value: [number, number]) => void;
  /** Keep the handles this far apart. */
  minSpan?: number;
}

const DEFAULTS = { min: 0, max: 100, step: 1 };

export function Slider(props: SliderProps): React.ReactElement {
  const { value, onValueChange, ...common } = props;
  return (
    <SliderBase
      {...common}
      range={[props.min ?? DEFAULTS.min, value]}
      ends={[1]}
      onEndChange={(_, next) => onValueChange(next)}
    />
  );
}

export function RangeSlider(props: RangeSliderProps): React.ReactElement {
  const { value, onValueChange, minSpan, ...common } = props;
  return (
    <SliderBase
      {...common}
      range={value}
      ends={[0, 1]}
      minSpan={minSpan}
      onEndChange={(end, next) =>
        onValueChange(
          moveRangeEnd(
            value,
            end,
            next,
            {
              min: common.min ?? DEFAULTS.min,
              max: common.max ?? DEFAULTS.max,
              step: common.step ?? DEFAULTS.step,
            },
            minSpan != null ? { minSpan } : {},
          ),
        )
      }
    />
  );
}

interface BaseProps extends Common {
  range: [number, number];
  /** Which handles to draw: `[1]` for a single slider, `[0, 1]` for a range. */
  ends: (0 | 1)[];
  minSpan?: number;
  onEndChange: (end: 0 | 1, value: number) => void;
}

function SliderBase({
  label,
  hint,
  error,
  labelVariant = "plain",
  min = DEFAULTS.min,
  max = DEFAULTS.max,
  step = DEFAULTS.step,
  disabled = false,
  tone = "accent",
  showValue = true,
  format,
  marks,
  size = "md",
  id,
  tokens,
  range,
  ends,
  onEndChange,
}: BaseProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const scale: Scale = { min, max, step };
  const track = React.useRef<HTMLDivElement>(null);
  const [focusedEnd, setFocusedEnd] = React.useState<0 | 1 | null>(null);
  const [dragging, setDragging] = React.useState<0 | 1 | null>(null);

  const show = (value: number): string => (format != null ? format(value) : `${value}`);
  const readout = ends.length === 1 ? show(range[1]) : `${show(range[0])} – ${show(range[1])}`;

  const height = size === "sm" ? 3 : 4;
  const handle = size === "sm" ? 12 : 14;
  // `toneColors` rather than `t.color[tone]`, because "neutral" is not a
  // colour token — it resolves to `textMuted` — and indexing the palette by
  // tone name only looks right for the five that happen to share a name.
  const fill = toneColors(tone, t.color).fg;

  /** The value under a pointer, from its position along the track. */
  const valueFromPointer = (clientX: number): number | null => {
    const box = track.current?.getBoundingClientRect();
    if (box == null || box.width === 0) {
      return null;
    }
    return valueAt((clientX - box.left) / box.width, scale);
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (disabled) {
      return;
    }
    const next = valueFromPointer(event.clientX);
    if (next == null) {
      return;
    }
    const end = ends.length === 1 ? 1 : nearestEnd(range, next);
    // Capture on the track, so a drag that wanders off it — above a toolbar,
    // outside the widget — keeps feeding this handler.
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(end);
    onEndChange(end, next);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (dragging == null) {
      return;
    }
    const next = valueFromPointer(event.clientX);
    if (next != null) {
      onEndChange(dragging, next);
    }
  };

  const endDrag = (): void => setDragging(null);

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      labelVariant={labelVariant}
      id={id}
      tokens={tokens}
      action={
        showValue ? (
          <span
            style={{
              fontSize: t.fontSize.sm,
              color: t.color.textMuted,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {readout}
          </span>
        ) : undefined
      }
    >
      {() => (
        <div style={{ padding: `${handle / 2}px 0` }}>
          <div
            ref={track}
            onPointerDown={startDrag}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{
              position: "relative",
              height,
              borderRadius: t.radius.pill,
              // An opaque tint, not the translucent `*Soft` wash: a track is a
              // background, and over an unpainted host page a wash takes the
              // host's colour. That is the bug the tint tokens exist for.
              background: t.color.neutralTint,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.55 : 1,
              touchAction: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${(ends.length === 1 ? 0 : fraction(range[0], scale)) * 100}%`,
                right: `${(1 - fraction(range[1], scale)) * 100}%`,
                background: fill,
                borderRadius: t.radius.pill,
              }}
            />

            {ends.map((end) => {
              const value = range[end];
              return (
                <div
                  key={end}
                  role="slider"
                  tabIndex={disabled ? -1 : 0}
                  aria-valuenow={value}
                  aria-valuemin={end === 1 && ends.length === 2 ? range[0] : min}
                  aria-valuemax={end === 0 ? range[1] : max}
                  aria-valuetext={format != null ? format(value) : undefined}
                  aria-label={
                    ends.length === 2 ? (end === 0 ? "Minimum" : "Maximum") : undefined
                  }
                  aria-disabled={disabled ? true : undefined}
                  onFocus={() => setFocusedEnd(end)}
                  onBlur={() => setFocusedEnd(null)}
                  onKeyDown={(event) => {
                    const next = keyStep(event.key, value, scale);
                    if (next != null) {
                      event.preventDefault();
                      onEndChange(end, next);
                    }
                  }}
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: `${fraction(value, scale) * 100}%`,
                    width: handle,
                    height: handle,
                    marginLeft: -handle / 2,
                    marginTop: -handle / 2,
                    borderRadius: "50%",
                    background: t.color.surface,
                    border: `2px solid ${fill}`,
                    boxShadow: t.shadow.sm,
                    cursor: disabled ? "not-allowed" : "grab",
                    outline: "none",
                    ...(focusedEnd === end ? focusRingStyle({ tokens }) : {}),
                  }}
                />
              );
            })}
          </div>

          {marks != null && marks.length > 0 && (
            <div style={{ position: "relative", height: 16, marginTop: t.space[2] }}>
              {marks.map((mark) => (
                <span
                  key={mark.value}
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: `${fraction(snap(mark.value, scale), scale) * 100}%`,
                    transform: "translateX(-50%)",
                    fontSize: t.fontSize.xs,
                    color: t.color.textFaint,
                    whiteSpace: "nowrap",
                  }}
                >
                  {mark.label ?? show(mark.value)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </Field>
  );
}
