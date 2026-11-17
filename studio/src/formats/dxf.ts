/**
 * ASCII DXF (the ENTITIES section) to features. CAD drawings carry no CRS,
 * so the caller names one; without it, projected-looking coordinates are
 * flagged with `needsCrs` and left as they are.
 */
import type { Geometry, Position } from "geojson";
import { newId, type StudioFeature } from "../project/types";
import { guessCrsFromCoords, reprojectFeatures, type ImportedWithCrs } from "./crs";

type Pair = [number, string];

interface Entity {
  type: string;
  pairs: Pair[];
}

function pairs(text: string): Pair[] {
  const lines = text.split(/\r\n|\r|\n/);
  const out: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (!Number.isInteger(code)) {throw new Error(`Not an ASCII DXF (bad group code on line ${i + 1})`);}
    out.push([code, lines[i + 1].replace(/\s+$/, "")]);
  }
  return out;
}

function entities(all: Pair[]): Entity[] {
  const out: Entity[] = [];
  let inEntities = false;
  let cur: Entity | null = null;
  for (let i = 0; i < all.length; i++) {
    const [code, value] = all[i];
    if (code === 0 && value === "SECTION" && all[i + 1]?.[0] === 2) {
      inEntities = all[i + 1][1].trim() === "ENTITIES";
      cur = null;
      i++;
      continue;
    }
    if (!inEntities) {continue;}
    if (code === 0) {
      if (value === "ENDSEC") {
        inEntities = false;
        cur = null;
        continue;
      }
      cur = { type: value.trim(), pairs: [] };
      out.push(cur);
    } else if (cur) {
      cur.pairs.push([code, value]);
    }
  }
  return out;
}

const num = (e: Entity, code: number, def = 0): number => {
  const p = e.pairs.find((x) => x[0] === code);
  const v = p ? Number(p[1]) : NaN;
  return Number.isFinite(v) ? v : def;
};
const str = (e: Entity, code: number): string | undefined => e.pairs.find((x) => x[0] === code)?.[1];

function xy(e: Entity, xCode = 10): Position {
  return [num(e, xCode), num(e, xCode + 10)];
}

function arcPoints(cx: number, cy: number, r: number, startDeg: number, endDeg: number, fullSegments = 64): Position[] {
  let sweep = endDeg - startDeg;
  while (sweep <= 0) {sweep += 360;}
  const n = Math.max(2, Math.ceil((fullSegments * sweep) / 360));
  const out: Position[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((startDeg + (sweep * i) / n) * Math.PI) / 180;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

function mtext(raw: string): string {
  return raw
    .replace(/\\P/g, "\n")
    .replace(/\\[ACFHQTWfch][^;]*;/g, "")
    .replace(/\\[LlOoKk]/g, "")
    .replace(/\\S([^;]*);/g, (_, s: string) => s.replace(/[#^]/, "/"))
    .replace(/\\~/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\\\\/g, "\\")
    .trim();
}

/** Parse ASCII DXF. `crsDef` (any proj4 definition, e.g. "EPSG:27700") reprojects to WGS84. */
export function readDxf(text: string, crsDef?: string, title = "drawing"): ImportedWithCrs {
  const ents = entities(pairs(text));
  const features: StudioFeature[] = [];
  let skipped = 0;
  let hasText = false;
  const push = (e: Entity, geometry: Geometry, extra: Record<string, unknown> = {}) => {
    features.push({
      type: "Feature",
      id: newId("f"),
      geometry,
      properties: { layer: str(e, 8)?.trim() ?? "0", entity: e.type, ...extra },
    });
  };
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    switch (e.type) {
      case "POINT": push(e, { type: "Point", coordinates: xy(e) }); break;
      case "LINE": push(e, { type: "LineString", coordinates: [xy(e), xy(e, 11)] }); break;
      case "LWPOLYLINE": {
        const pts: Position[] = [];
        let x: number | null = null;
        for (const [c, v] of e.pairs) {
          if (c === 10) {x = Number(v);}
          else if (c === 20 && x !== null) {
            pts.push([x, Number(v)]);
            x = null;
          }
        }
        addPolyline(e, pts, (num(e, 70) & 1) === 1);
        break;
      }
      case "POLYLINE": {
        const pts: Position[] = [];
        let j = i + 1;
        for (; j < ents.length && ents[j].type === "VERTEX"; j++) {
          const flags = num(ents[j], 70);
          if (flags & 128 && !(flags & 64)) {continue;} // polyface face records
          pts.push(xy(ents[j]));
        }
        if (ents[j]?.type === "SEQEND") {j++;}
        i = j - 1;
        const flags = num(e, 70);
        if (flags & (16 | 64)) {
          skipped++; // meshes
          break;
        }
        addPolyline(e, pts, (flags & 1) === 1);
        break;
      }
      case "CIRCLE": {
        const [cx, cy] = xy(e);
        const ring = arcPoints(cx, cy, num(e, 40), 0, 360);
        ring[ring.length - 1] = ring[0];
        push(e, { type: "Polygon", coordinates: [ring] }, { radius: num(e, 40) });
        break;
      }
      case "ARC": {
        const [cx, cy] = xy(e);
        push(e, { type: "LineString", coordinates: arcPoints(cx, cy, num(e, 40), num(e, 50), num(e, 51, 360)) }, { radius: num(e, 40) });
        break;
      }
      case "TEXT":
      case "MTEXT": {
        const body = e.type === "MTEXT"
          ? mtext(e.pairs.filter((p) => p[0] === 3).map((p) => p[1]).join("") + (str(e, 1) ?? ""))
          : (str(e, 1) ?? "").trim();
        hasText = true;
        push(e, { type: "Point", coordinates: xy(e) }, { text: body, height: num(e, 40) });
        break;
      }
      case "VERTEX":
      case "SEQEND":
        break;
      default:
        skipped++;
    }
  }

  function addPolyline(e: Entity, pts: Position[], closed: boolean) {
    if (pts.length < 2) {
      skipped++;
      return;
    }
    if (closed && pts.length >= 3) {
      const ring = [...pts];
      const a = ring[0];
      const b = ring[ring.length - 1];
      if (a[0] !== b[0] || a[1] !== b[1]) {ring.push(a);}
      push(e, { type: "Polygon", coordinates: [ring] });
    } else {
      push(e, { type: "LineString", coordinates: pts });
    }
  }

  const fields = ["layer", "entity", ...(hasText ? ["text", "height"] : []), ...(features.some((f) => "radius" in f.properties) ? ["radius"] : [])];
  const result: ImportedWithCrs = { title, features, fields, skipped };
  if (crsDef && crsDef !== "EPSG:4326") {return { ...result, features: reprojectFeatures(features, crsDef), sourceCrs: crsDef };}
  if (!crsDef && guessCrsFromCoords(features) === null) {return { ...result, needsCrs: true };}
  return result;
}
