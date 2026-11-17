/**
 * A small QGIS-like expression language: what select-by-expression, the field
 * calculator and rule-based styling are written in.
 *
 *   "population" > 1000 AND name ILIKE 'oslo%'
 *   round($area / 1e6, 2) || ' km²'
 *
 * Source is compiled once into closures and evaluated per feature. Nulls
 * behave as in SQL: comparisons and arithmetic with null give null (falsy),
 * `IS NULL` is true, `false AND null` is false and `true OR null` is true.
 */
import * as turf from "@turf/turf";
import type { Feature, Geometry } from "geojson";
import type { StudioFeature } from "../project/types";

export class ExpressionError extends Error {
  /** Zero-based character offset in the source where the problem is. */
  readonly position: number;
  constructor(message: string, position: number) {
    super(`${message} (at ${position + 1})`);
    this.name = "ExpressionError";
    this.position = position;
  }
}

export interface CompiledExpression {
  evaluate(f: StudioFeature): unknown;
  /** Field names the expression reads, in first-use order. */
  fields: string[];
  source: string;
}

export type TryCompileResult = { ok: true; expr: CompiledExpression } | { ok: false; error: ExpressionError };

// ── Tokens ─────────────────────────────────────────────────────────────────

type TokenType = "num" | "str" | "field" | "ident" | "var" | "op" | "eof";
interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const OPERATORS = ["<=", ">=", "<>", "!=", "||", "=", "<", ">", "+", "-", "*", "/", "%", "(", ")", ","];

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const start = i;
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/.exec(src.slice(i));
      const text = m ? m[0] : c;
      out.push({ type: "num", value: text, pos: start });
      i += text.length;
      continue;
    }
    if (c === "'") {
      let s = "";
      i++;
      for (;;) {
        if (i >= src.length) {throw new ExpressionError("Unterminated string", start);}
        if (src[i] === "'") {
          if (src[i + 1] === "'") {
            s += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        s += src[i++];
      }
      out.push({ type: "str", value: s, pos: start });
      continue;
    }
    if (c === '"') {
      let s = "";
      i++;
      for (;;) {
        if (i >= src.length) {throw new ExpressionError("Unterminated field name", start);}
        if (src[i] === '"') {
          if (src[i + 1] === '"') {
            s += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        s += src[i++];
      }
      out.push({ type: "field", value: s, pos: start });
      continue;
    }
    if (c === "$" || /[A-Za-z_À-￿]/.test(c)) {
      i++;
      while (i < src.length && /[A-Za-z0-9_À-￿]/.test(src[i])) {i++;}
      const text = src.slice(start, i);
      if (c === "$" && text.length === 1) {throw new ExpressionError("Expected a variable name after $", start);}
      out.push({ type: c === "$" ? "var" : "ident", value: text, pos: start });
      continue;
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (!op) {throw new ExpressionError(`Unexpected character '${c}'`, start);}
    out.push({ type: "op", value: op, pos: start });
    i += op.length;
  }
  out.push({ type: "eof", value: "", pos: src.length });
  return out;
}

// ── Values ─────────────────────────────────────────────────────────────────

type Fn = (f: StudioFeature) => unknown;

function isNull(v: unknown): v is null | undefined {
  return v === null || v === undefined;
}

/** Number for a value, or null when it is not one (strings are parsed). */
export function toNumber(v: unknown): number | null {
  if (typeof v === "number") {return Number.isFinite(v) ? v : null;}
  if (typeof v === "boolean") {return v ? 1 : 0;}
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStr(v: unknown): string {
  if (typeof v === "string") {return v;}
  if (typeof v === "object" && v !== null) {return JSON.stringify(v);}
  return String(v);
}

/** How a result reads as a condition: null, false, 0 and '' are false. */
export function truthy(v: unknown): boolean {
  if (isNull(v)) {return false;}
  if (typeof v === "boolean") {return v;}
  if (typeof v === "number") {return v !== 0 && !Number.isNaN(v);}
  if (typeof v === "string") {return v !== "";}
  return true;
}

/** -1/0/1, numerically when both sides are numbers, else as strings; null when either is null. */
function compare(a: unknown, b: unknown): number | null {
  if (isNull(a) || isNull(b)) {return null;}
  const na = toNumber(a);
  const nb = toNumber(b);
  // Two strings compare as text ('10' < '9'); a number against numeric text compares as numbers.
  if (na !== null && nb !== null && (typeof a !== "string" || typeof b !== "string")) {
    return na < nb ? -1 : na > nb ? 1 : 0;
  }
  const sa = toStr(a);
  const sb = toStr(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function likeRegex(pattern: string, insensitive: boolean): RegExp {
  let re = "";
  for (const ch of pattern) {
    if (ch === "%") {re += "[\\s\\S]*";}
    else if (ch === "_") {re += "[\\s\\S]";}
    else {re += ch.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");}
  }
  return new RegExp(`^${re}$`, insensitive ? "i" : "");
}

// ── Geometry variables ─────────────────────────────────────────────────────

function asFeature(g: Geometry): Feature<Geometry> {
  return { type: "Feature", geometry: g, properties: {} };
}

function geomArea(g: Geometry | null): number {
  if (!g) {return 0;}
  if (g.type === "Polygon" || g.type === "MultiPolygon" || g.type === "GeometryCollection") {return turf.area(asFeature(g));}
  return 0;
}

function geomLength(g: Geometry | null): number {
  if (!g) {return 0;}
  if (g.type === "LineString" || g.type === "MultiLineString") {return turf.length(asFeature(g), { units: "kilometers" }) * 1000;}
  if (g.type === "GeometryCollection") {return g.geometries.reduce((s, x) => s + geomLength(x), 0);}
  return 0;
}

function geomPerimeter(g: Geometry | null): number {
  if (!g) {return 0;}
  if (g.type === "Polygon" || g.type === "MultiPolygon") {
    const rings = g.type === "Polygon" ? g.coordinates : g.coordinates.flat();
    return rings.reduce((s, r) => s + (r.length > 1 ? turf.length(turf.lineString(r), { units: "kilometers" }) * 1000 : 0), 0);
  }
  if (g.type === "GeometryCollection") {return g.geometries.reduce((s, x) => s + geomPerimeter(x), 0);}
  return 0;
}

function geomCentroid(g: Geometry | null): [number, number] | null {
  if (!g) {return null;}
  if (g.type === "Point") {return [g.coordinates[0], g.coordinates[1]];}
  try {
    const c = turf.centroid(asFeature(g)).geometry.coordinates;
    return Number.isFinite(c[0]) ? [c[0], c[1]] : null;
  } catch {
    return null;
  }
}

const VARIABLES: Record<string, (f: StudioFeature) => unknown> = {
  $area: (f) => geomArea(f.geometry),
  $length: (f) => geomLength(f.geometry),
  $perimeter: (f) => geomPerimeter(f.geometry),
  $x: (f) => geomCentroid(f.geometry)?.[0] ?? null,
  $y: (f) => geomCentroid(f.geometry)?.[1] ?? null,
  $id: (f) => f.id,
  $geometry_type: (f) => f.geometry?.type ?? null,
};

// ── Functions ──────────────────────────────────────────────────────────────

interface FnDef {
  min: number;
  max: number;
  /** Receives argument thunks, so if() and coalesce() evaluate lazily. */
  call(args: Array<() => unknown>): unknown;
}

const strict = (min: number, max: number, fn: (...a: unknown[]) => unknown): FnDef => ({
  min,
  max,
  call: (args) => fn(...args.map((a) => a())),
});

const num1 = (fn: (x: number) => number): FnDef =>
  strict(1, 1, (x) => {
    const n = toNumber(x);
    if (n === null) {return null;}
    const r = fn(n);
    return Number.isFinite(r) ? r : null;
  });

const FUNCTIONS: Record<string, FnDef> = {
  length: strict(1, 1, (s) => (isNull(s) ? null : toStr(s).length)),
  upper: strict(1, 1, (s) => (isNull(s) ? null : toStr(s).toUpperCase())),
  lower: strict(1, 1, (s) => (isNull(s) ? null : toStr(s).toLowerCase())),
  trim: strict(1, 1, (s) => (isNull(s) ? null : toStr(s).trim())),
  substr: strict(2, 3, (s, start, len) => {
    if (isNull(s) || isNull(start)) {return null;}
    const str = toStr(s);
    const st = toNumber(start);
    if (st === null) {return null;}
    let from = st > 0 ? st - 1 : st < 0 ? Math.max(0, str.length + st) : 0;
    from = Math.floor(from);
    if (isNull(len)) {return str.slice(from);}
    const l = toNumber(len);
    if (l === null) {return null;}
    return l >= 0 ? str.slice(from, from + Math.floor(l)) : str.slice(from, Math.max(from, str.length + Math.floor(l)));
  }),
  concat: strict(0, Infinity, (...parts) => parts.map((p) => (isNull(p) ? "" : toStr(p))).join("")),
  coalesce: {
    min: 1,
    max: Infinity,
    call: (args) => {
      for (const a of args) {
        const v = a();
        if (!isNull(v)) {return v;}
      }
      return null;
    },
  },
  round: strict(1, 2, (x, d) => {
    const n = toNumber(x);
    if (n === null) {return null;}
    const digits = isNull(d) ? 0 : Math.trunc(toNumber(d) ?? 0);
    const f = Math.pow(10, digits);
    const r = Math.sign(n) * Math.round(Math.abs(n) * f) / f;
    return Object.is(r, -0) ? 0 : r;
  }),
  abs: num1(Math.abs),
  floor: num1(Math.floor),
  ceil: num1(Math.ceil),
  sqrt: num1(Math.sqrt),
  min: strict(1, Infinity, (...xs) => {
    const ns = xs.map(toNumber).filter((n): n is number => n !== null);
    return ns.length ? Math.min(...ns) : null;
  }),
  max: strict(1, Infinity, (...xs) => {
    const ns = xs.map(toNumber).filter((n): n is number => n !== null);
    return ns.length ? Math.max(...ns) : null;
  }),
  to_number: strict(1, 1, (x) => toNumber(x)),
  to_string: strict(1, 1, (x) => (isNull(x) ? null : toStr(x))),
  if: {
    min: 3,
    max: 3,
    call: ([c, a, b]) => (truthy(c()) ? a() : b()),
  },
  regexp_match: strict(2, 2, (s, p) => {
    if (isNull(s) || isNull(p)) {return null;}
    try {
      return new RegExp(toStr(p)).test(toStr(s));
    } catch {
      return null;
    }
  }),
};

export const FUNCTION_NAMES = Object.keys(FUNCTIONS);
export const VARIABLE_NAMES = Object.keys(VARIABLES);

// ── Parser ─────────────────────────────────────────────────────────────────

const KEYWORDS = new Set(["and", "or", "not", "is", "null", "in", "like", "ilike", "between", "true", "false"]);

class Parser {
  private i = 0;
  readonly fields: string[] = [];
  constructor(private readonly tokens: Token[]) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.i + offset, this.tokens.length - 1)];
  }
  private next(): Token {
    const t = this.tokens[this.i];
    if (t.type !== "eof") {this.i++;}
    return t;
  }
  private isKw(word: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t.type === "ident" && t.value.toLowerCase() === word;
  }
  private acceptKw(word: string): boolean {
    if (this.isKw(word)) {
      this.i++;
      return true;
    }
    return false;
  }
  private isOp(op: string): boolean {
    const t = this.peek();
    return t.type === "op" && t.value === op;
  }
  private expectOp(op: string): void {
    const t = this.peek();
    if (t.type !== "op" || t.value !== op) {throw new ExpressionError(`Expected '${op}' but found ${describe(t)}`, t.pos);}
    this.i++;
  }

  parse(): Fn {
    if (this.peek().type === "eof") {throw new ExpressionError("Empty expression", 0);}
    const e = this.or();
    const t = this.peek();
    if (t.type !== "eof") {throw new ExpressionError(`Unexpected ${describe(t)}`, t.pos);}
    return e;
  }

  private or(): Fn {
    let left = this.and();
    while (this.acceptKw("or")) {
      const l = left;
      const r = this.and();
      left = (f) => {
        const a = l(f);
        if (truthy(a)) {return true;}
        const b = r(f);
        if (truthy(b)) {return true;}
        return isNull(a) || isNull(b) ? null : false;
      };
    }
    return left;
  }

  private and(): Fn {
    let left = this.not();
    while (this.acceptKw("and")) {
      const l = left;
      const r = this.not();
      left = (f) => {
        const a = l(f);
        if (!isNull(a) && !truthy(a)) {return false;}
        const b = r(f);
        if (!isNull(b) && !truthy(b)) {return false;}
        return isNull(a) || isNull(b) ? null : true;
      };
    }
    return left;
  }

  private not(): Fn {
    if (this.acceptKw("not")) {
      const e = this.not();
      return (f) => {
        const v = e(f);
        return isNull(v) ? null : !truthy(v);
      };
    }
    return this.comparison();
  }

  private comparison(): Fn {
    const left = this.concat();
    const t = this.peek();
    if (t.type === "op" && ["=", "!=", "<>", "<", "<=", ">", ">="].includes(t.value)) {
      this.i++;
      const right = this.concat();
      const test: (c: number) => boolean = {
        "=": (c: number) => c === 0,
        "!=": (c: number) => c !== 0,
        "<>": (c: number) => c !== 0,
        "<": (c: number) => c < 0,
        "<=": (c: number) => c <= 0,
        ">": (c: number) => c > 0,
        ">=": (c: number) => c >= 0,
      }[t.value]!;
      return (f) => {
        const c = compare(left(f), right(f));
        return c === null ? null : test(c);
      };
    }
    if (this.acceptKw("is")) {
      const negate = this.acceptKw("not");
      const n = this.peek();
      if (!this.acceptKw("null")) {throw new ExpressionError(`Expected NULL after IS${negate ? " NOT" : ""} but found ${describe(n)}`, n.pos);}
      return (f) => isNull(left(f)) !== negate;
    }
    let negate = false;
    if (this.isKw("not") && (this.isKw("in", 1) || this.isKw("like", 1) || this.isKw("ilike", 1) || this.isKw("between", 1))) {
      this.i++;
      negate = true;
    }
    const neg = (v: boolean | null) => (v === null ? null : v !== negate);
    if (this.acceptKw("in")) {
      this.expectOp("(");
      const items: Fn[] = [];
      if (!this.isOp(")")) {
        do {items.push(this.or());} while (this.isOp(",") && this.next());
      }
      this.expectOp(")");
      return (f) => {
        const v = left(f);
        if (isNull(v)) {return null;}
        let sawNull = false;
        for (const it of items) {
          const c = compare(v, it(f));
          if (c === 0) {return !negate;}
          if (c === null) {sawNull = true;}
        }
        return sawNull ? null : negate;
      };
    }
    if (this.isKw("like") || this.isKw("ilike")) {
      const insensitive = this.next().value.toLowerCase() === "ilike";
      const pat = this.concat();
      const cache = new Map<string, RegExp>();
      return (f) => {
        const v = left(f);
        const p = pat(f);
        if (isNull(v) || isNull(p)) {return null;}
        const ps = toStr(p);
        let re = cache.get(ps);
        if (!re) {
          re = likeRegex(ps, insensitive);
          cache.set(ps, re);
        }
        return neg(re.test(toStr(v)));
      };
    }
    if (this.acceptKw("between")) {
      const lo = this.concat();
      const a = this.peek();
      if (!this.acceptKw("and")) {throw new ExpressionError(`Expected AND in BETWEEN but found ${describe(a)}`, a.pos);}
      const hi = this.concat();
      return (f) => {
        const v = left(f);
        const c1 = compare(v, lo(f));
        const c2 = compare(v, hi(f));
        if (c1 === null || c2 === null) {return null;}
        return neg(c1 >= 0 && c2 <= 0);
      };
    }
    return left;
  }

  private concat(): Fn {
    let left = this.additive();
    while (this.isOp("||")) {
      this.i++;
      const l = left;
      const r = this.additive();
      left = (f) => {
        const a = l(f);
        const b = r(f);
        return isNull(a) || isNull(b) ? null : toStr(a) + toStr(b);
      };
    }
    return left;
  }

  private additive(): Fn {
    let left = this.multiplicative();
    while (this.isOp("+") || this.isOp("-")) {
      const op = this.next().value;
      const l = left;
      const r = this.multiplicative();
      left = (f) => {
        const a = l(f);
        const b = r(f);
        if (isNull(a) || isNull(b)) {return null;}
        const na = toNumber(a);
        const nb = toNumber(b);
        if (na !== null && nb !== null) {return op === "+" ? na + nb : na - nb;}
        // '+' on text joins it, as QGIS does.
        return op === "+" && (typeof a === "string" || typeof b === "string") ? toStr(a) + toStr(b) : null;
      };
    }
    return left;
  }

  private multiplicative(): Fn {
    let left = this.unary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      const op = this.next().value;
      const l = left;
      const r = this.unary();
      left = (f) => {
        const a = toNumber(l(f));
        const b = toNumber(r(f));
        if (a === null || b === null) {return null;}
        if (op === "*") {return a * b;}
        if (b === 0) {return null;}
        return op === "/" ? a / b : a % b;
      };
    }
    return left;
  }

  private unary(): Fn {
    if (this.isOp("-") || this.isOp("+")) {
      const op = this.next().value;
      const e = this.unary();
      return (f) => {
        const n = toNumber(e(f));
        return n === null ? null : op === "-" ? -n : n;
      };
    }
    return this.primary();
  }

  private primary(): Fn {
    const t = this.next();
    switch (t.type) {
      case "num": {
        const n = Number(t.value);
        return () => n;
      }
      case "str": {
        const s = t.value;
        return () => s;
      }
      case "field":
        return this.field(t.value);
      case "var": {
        const fn = VARIABLES[t.value.toLowerCase()];
        if (!fn) {throw new ExpressionError(`Unknown variable ${t.value}`, t.pos);}
        return fn;
      }
      case "ident": {
        const lower = t.value.toLowerCase();
        if (this.isOp("(")) {
          const def = FUNCTIONS[lower];
          if (!def) {throw new ExpressionError(`Unknown function ${t.value}()`, t.pos);}
          this.i++;
          const args: Fn[] = [];
          if (!this.isOp(")")) {
            do {args.push(this.or());} while (this.isOp(",") && this.next());
          }
          this.expectOp(")");
          if (args.length < def.min || args.length > def.max) {
            const want = def.max === Infinity ? `at least ${def.min}` : def.min === def.max ? `${def.min}` : `${def.min} to ${def.max}`;
            throw new ExpressionError(`${lower}() takes ${want} argument${def.max === 1 && def.min === 1 ? "" : "s"}, got ${args.length}`, t.pos);
          }
          return (f) => def.call(args.map((a) => () => a(f)));
        }
        if (lower === "true") {return () => true;}
        if (lower === "false") {return () => false;}
        if (lower === "null") {return () => null;}
        if (KEYWORDS.has(lower)) {throw new ExpressionError(`Unexpected keyword ${t.value.toUpperCase()}`, t.pos);}
        return this.field(t.value);
      }
      case "op":
        if (t.value === "(") {
          const e = this.or();
          this.expectOp(")");
          return e;
        }
        throw new ExpressionError(`Unexpected '${t.value}'`, t.pos);
      case "eof":
        throw new ExpressionError("Unexpected end of expression", t.pos);
    }
  }

  private field(name: string): Fn {
    if (!this.fields.includes(name)) {this.fields.push(name);}
    return (f) => {
      const v = f.properties[name];
      return v === undefined ? null : v;
    };
  }
}

function describe(t: Token): string {
  if (t.type === "eof") {return "end of expression";}
  if (t.type === "str") {return `'${t.value}'`;}
  if (t.type === "field") {return `"${t.value}"`;}
  return `'${t.value}'`;
}

// ── API ────────────────────────────────────────────────────────────────────

export function compile(source: string): CompiledExpression {
  const parser = new Parser(tokenize(source));
  const fn = parser.parse();
  return { evaluate: fn, fields: parser.fields, source };
}

export function tryCompile(source: string): TryCompileResult {
  try {
    return { ok: true, expr: compile(source) };
  } catch (e) {
    if (e instanceof ExpressionError) {return { ok: false, error: e };}
    return { ok: false, error: new ExpressionError(e instanceof Error ? e.message : String(e), 0) };
  }
}
