/**
 * Harness route for @acc/app6d — the whole built-in catalog,
 * rendered.
 *
 * This is deliberately the dullest possible consumer: it imports the package
 * by its PUBLISHED subpath specifiers, calls two public functions, and draws
 * the result. That is the point. The aliases in vite.config.ts and the paths
 * in tsconfig.json resolve those specifiers to package SOURCE, so this page
 * both proves the packaging is wired correctly and gives the library a live
 * editing loop — change a symbol definition, see it here immediately.
 *
 * Everything here is offline and Foundry-free: the package has no network
 * calls and no platform dependencies, unlike its neighbour in packages/.
 *
 * WHY getParts() AND NOT renderSVG()
 * ----------------------------------
 * renderSVG() hands back SVG markup as a string, which in React means
 * dangerouslySetInnerHTML — and Foundry's CI code scan blocks that call
 * outright, whatever the provenance of the string. getParts() is the same
 * engine one level lower: it returns the geometry as data, which maps
 * straight onto real <path>/<text> elements. No raw markup, no scanner
 * exception to argue for, and it exercises the API a Canvas2D or WebGL
 * consumer would use.
 */
import React, { useMemo, useState } from "react";
import { DEFAULT_SVG_BOX, getHandles, getParts } from "@acc/app6d/engine";
import type { Part } from "@acc/app6d/engine";
import { resolveUnitAnchorHandle } from "@acc/app6d/core";
import { APP6D_CATALOG } from "@acc/app6d/symbols";

/** Mirrors the engine's own defaults; see DEFAULT_STYLE in engine/render.ts. */
const STROKE = "rgb(66,160,255)";
const STROKE_WIDTH = 40;
const DASH = `${STROKE_WIDTH * 2},${STROKE_WIDTH * 2}`;

/** Anchors and handles, in the same parameter space as the geometry. */
const ANCHOR = "rgb(255,196,84)";
const SCALAR = "rgb(125,135,158)";
/** The unit's attachment point — red, because it is the one that means "here". */
const UNIT_ANCHOR = "rgb(255,86,86)";

function PartShape({ part }: { part: Part }): React.ReactElement | null {
  if (part.kind === "stroke") {
    return (
      <path d={part.d} strokeDasharray={part.dashed ? DASH : undefined} />
    );
  }
  if (part.kind === "fill") {
    return <path d={part.d} fill={STROKE} stroke="none" />;
  }
  return (
    <text
      x={part.pos.x}
      y={part.pos.y}
      dy="0.35em"
      fontFamily="Arial"
      fontWeight="bold"
      fontSize={part.size}
      textAnchor="middle"
      fill={STROKE}
      stroke="none"
      transform={
        part.rotate
          ? `rotate(${part.rotate} ${part.pos.x} ${part.pos.y})`
          : undefined
      }
    >
      {part.text}
    </text>
  );
}

/**
 * Where the symbol's anchors are — which is the part of a control measure the
 * publication is most specific about, and the part a picture of the geometry
 * alone does not show.
 *
 * Three marks, because there are three different things:
 *
 *  - A filled dot per point handle: a position the symbol is built from. The
 *    draw rules count these ("this graphic requires one anchor point"), so this
 *    is how you check an authored symbol against its rules by eye.
 *  - A hollow square per scalar handle: not a position but a magnitude —
 *    a size, a rotation, an amplitude — drawn where its grip sits.
 *  - A ring around the handle a unit attaches to, from the same
 *    resolveUnitAnchorHandle the mil map uses. On the cone markers that ring
 *    is on the tip, not the box, which is the whole point of the family; where
 *    the anchor is derived rather than a handle (a midline, a centroid) there
 *    is no handle to ring, so it is a cross instead.
 */
function AnchorMarks({ name }: { name: string }): React.ReactElement {
  const { handles, anchor } = useMemo(
    () => ({
      handles: getHandles(APP6D_CATALOG, name),
      anchor: resolveUnitAnchorHandle(APP6D_CATALOG, name),
    }),
    [name],
  );

  return (
    <g>
      {handles.map((handle) =>
        handle.kind === "point" ? (
          <circle
            key={handle.id}
            cx={handle.pos.x}
            cy={handle.pos.y}
            r={62}
            fill={ANCHOR}
            stroke="none"
          />
        ) : (
          <rect
            key={handle.id}
            x={handle.pos.x - 50}
            y={handle.pos.y - 50}
            width={100}
            height={100}
            fill="none"
            stroke={SCALAR}
            strokeWidth={24}
          />
        ),
      )}
      {anchor !== undefined &&
        (anchor.id === undefined ? (
          <g stroke={UNIT_ANCHOR} strokeWidth={26}>
            <line
              x1={anchor.pos.x - 95}
              y1={anchor.pos.y}
              x2={anchor.pos.x + 95}
              y2={anchor.pos.y}
            />
            <line
              x1={anchor.pos.x}
              y1={anchor.pos.y - 95}
              x2={anchor.pos.x}
              y2={anchor.pos.y + 95}
            />
          </g>
        ) : (
          <>
            <circle
              cx={anchor.pos.x}
              cy={anchor.pos.y}
              r={62}
              fill={UNIT_ANCHOR}
              stroke="none"
            />
            <circle
              cx={anchor.pos.x}
              cy={anchor.pos.y}
              r={130}
              fill="none"
              stroke={UNIT_ANCHOR}
              strokeWidth={26}
            />
          </>
        ))}
    </g>
  );
}

function SymbolTile({
  name,
  showAnchors,
}: {
  name: string;
  showAnchors: boolean;
}): React.ReactElement {
  // Symbol definitions are immutable data, so the parts only depend on `name`.
  const parts = useMemo(() => getParts(APP6D_CATALOG, name), [name]);

  return (
    <figure style={cell}>
      <svg
        viewBox={DEFAULT_SVG_BOX.viewBox}
        width={140}
        height={128}
        role="img"
        aria-label={name}
      >
        <g
          fill="none"
          stroke={STROKE}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {parts.map((part, i) => (
            <PartShape key={i} part={part} />
          ))}
        </g>
        {showAnchors && <AnchorMarks name={name} />}
      </svg>
      <figcaption style={caption}>{name}</figcaption>
    </figure>
  );
}

function Legend(): React.ReactElement {
  return (
    <div style={legend}>
      <span style={legendItem}>
        <span style={{ ...swatch, background: ANCHOR, borderRadius: "50%" }} />
        anchor point
      </span>
      <span style={legendItem}>
        <span style={{ ...swatch, border: `2px solid ${SCALAR}` }} />
        size / rotate
      </span>
      <span style={legendItem}>
        <span
          style={{ ...swatch, background: UNIT_ANCHOR, borderRadius: "50%" }}
        />
        unit attaches here — a plain anchor until an order is assigned
      </span>
    </div>
  );
}

function SymbolsPage(): React.ReactElement {
  const [filter, setFilter] = useState("");
  const [showAnchors, setShowAnchors] = useState(true);

  const names = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return APP6D_CATALOG.list().filter((name) =>
      name.toLowerCase().includes(needle),
    );
  }, [filter]);

  return (
    <div style={page}>
      <header style={header}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18 }}>@acc/app6d</h1>
          <p style={{ margin: "4px 0 0", color: "#5a6178", fontSize: 12 }}>
            {APP6D_CATALOG.list().length} built-in APP-6D graphics, rendered
            from package source through the published subpath specifiers.
            Anchors and handles are drawn over the geometry — see
            SYMBOLS.md beside this file for the inventory.
          </p>
          {showAnchors && <Legend />}
        </div>
        <div style={controls}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter…"
            aria-label="Filter symbols by name"
            style={input}
          />
          <label style={toggle}>
            <input
              type="checkbox"
              checked={showAnchors}
              onChange={(e) => setShowAnchors(e.target.checked)}
            />
            show anchors
          </label>
        </div>
      </header>

      <div style={grid}>
        {names.map((name) => (
          <SymbolTile key={name} name={name} showAnchors={showAnchors} />
        ))}
        {names.length === 0 && (
          <p style={{ color: "#5a6178", fontSize: 13 }}>
            No symbol matches “{filter}”.
          </p>
        )}
      </div>
    </div>
  );
}

const page: React.CSSProperties = {
  padding: 24,
  font: "13px/1.5 system-ui, sans-serif",
  color: "#e8ecf4",
  background: "#0a0c0f",
  // The shell's content pane is a fixed-height flex child, so this scrolls
  // within it rather than growing the document and pushing the header away.
  height: "100%",
  width: "100%",
  boxSizing: "border-box",
  overflowY: "auto",
};

const header: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  marginBottom: 20,
};

const controls: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexShrink: 0,
};

const toggle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  color: "#8b93a7",
  font: "12px/1.4 system-ui, sans-serif",
  whiteSpace: "nowrap",
  cursor: "pointer",
};

const legend: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 14,
  margin: "8px 0 0",
  color: "#5a6178",
  font: "11px/1.4 system-ui, sans-serif",
};

const legendItem: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
};

const swatch: React.CSSProperties = {
  display: "inline-block",
  width: 9,
  height: 9,
  boxSizing: "border-box",
};

const input: React.CSSProperties = {
  background: "#111318",
  border: "1px solid #374057",
  borderRadius: 4,
  color: "#e8ecf4",
  padding: "6px 10px",
  font: "12px/1.4 monospace",
  minWidth: 200,
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
  gap: 12,
};

const cell: React.CSSProperties = {
  margin: 0,
  padding: 8,
  background: "#111318",
  border: "1px solid #23293a",
  borderRadius: 4,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
};

const caption: React.CSSProperties = {
  font: "11px/1.3 monospace",
  color: "#8b93a7",
  textAlign: "center",
  wordBreak: "break-all",
};

export default SymbolsPage;
