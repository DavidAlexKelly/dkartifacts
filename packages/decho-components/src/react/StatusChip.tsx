/**
 * A RAG state, as a chip.
 *
 * `Tag` answers "how should this look" — a tone, a closed set of six. This
 * answers "what state is this item in", and the answer has to be the same
 * colour in every widget in the estate, which is why it takes a `status` and
 * not a colour.
 *
 * It replaces five implementations: the migration widgets' `Pill`, the
 * `badge()` helper with its nine-entry map, the data-readiness `dr-badge`, the
 * semantic-pill tone map, and a `<span>` with three inline styles that appears
 * in every table that has neither.
 *
 * The label is rendered from the status unless you override it, because "AT
 * RISK" written seven different ways is the other half of the same problem.
 */

import React from "react";
import { STATUS_LABEL } from "../core/labels.js";
import {
  resolveTokens,
  type DechoStatus,
  type DechoTokenSet,
} from "../core/vars.js";

export interface StatusChipProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  status: DechoStatus;
  /** Overrides the default wording. The colour is not overridable. */
  children?: React.ReactNode;
  /** Filled rather than washed — for a chip on a coloured row. */
  solid?: boolean;
  /** A dot before the label. Useful when several chips sit in a column. */
  dot?: boolean;
  size?: "sm" | "md";
  tokens?: DechoTokenSet;
}

export function StatusChip({
  status,
  children,
  solid = false,
  dot = false,
  size = "md",
  tokens,
  style,
  ...rest
}: StatusChipProps): React.ReactElement {
  const t = resolveTokens(tokens);
  const colour = t.status[status];
  const small = size === "sm";

  return (
    <span
      {...rest}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: small ? 4 : 5,
        padding: small ? "1px 7px" : "2px 9px",
        borderRadius: t.radius.pill,
        // A washed chip needs a border to hold its shape on a surface that is
        // nearly the same colour; a solid one would only muddy its edge.
        border: solid ? "1px solid transparent" : `1px solid ${colour}`,
        backgroundColor: solid ? colour : "transparent",
        color: solid ? t.color.onAccent : colour,
        fontFamily: t.fontFamily.sans,
        fontSize: small ? t.fontSize.xs : t.fontSize.sm,
        fontWeight: 600,
        lineHeight: 1.5,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {dot && (
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: solid ? t.color.onAccent : colour,
            flex: "0 0 auto",
          }}
        />
      )}
      {children ?? STATUS_LABEL[status]}
    </span>
  );
}
