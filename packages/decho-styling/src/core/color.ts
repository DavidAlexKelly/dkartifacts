/**
 * Just enough colour maths to re-tint a theme.
 *
 * No dependency: the package has none, and what is needed here is parsing two
 * notations, mixing towards black or white, and picking readable text. A colour
 * library would be tens of kilobytes in every consumer to do that.
 *
 * Everything works in sRGB. Not because sRGB is the right space for mixing —
 * OKLCH is — but because the values produced here sit directly beside ones a
 * designer picked by eye in sRGB, and a perceptually-even ramp next to a
 * hand-tuned one reads as inconsistent rather than as better. The one place
 * perception genuinely matters is choosing black or white text on an accent,
 * and that uses relative luminance, which is the correct measure for it.
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parses `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb(...)` and `rgba(...)`. */
export function parseColor(input: string): Rgba | null {
  const value = input.trim();

  const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (hex != null) {
    const digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      const [r, g, b, a] = digits.split("").map((d) => parseInt(d + d, 16));
      return { r, g, b, a: digits.length === 4 ? a / 255 : 1 };
    }
    if (digits.length === 6 || digits.length === 8) {
      const n = parseInt(digits.slice(0, 6), 16);
      return {
        r: (n >> 16) & 255,
        g: (n >> 8) & 255,
        b: n & 255,
        a: digits.length === 8 ? parseInt(digits.slice(6), 16) / 255 : 1,
      };
    }
    return null;
  }

  const fn = /^rgba?\(([^)]+)\)$/i.exec(value);
  if (fn != null) {
    const parts = fn[1].split(",").map((p) => p.trim());
    if (parts.length < 3) {return null;}
    const [r, g, b] = parts.map(Number);
    const a = parts.length > 3 ? Number(parts[3]) : 1;
    if ([r, g, b, a].some((n) => Number.isNaN(n))) {return null;}
    return { r, g, b, a };
  }

  return null;
}

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

export function toHex({ r, g, b }: Rgba): string {
  return `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * `r, g, b` — the channel triple, spaced exactly as the tokens write it.
 *
 * The re-tinting works by substitution inside values like
 * `rgba(108, 92, 231, 0.2)`, so the formatting has to match what is already
 * there or the replacement silently misses.
 */
export function toRgbTriple({ r, g, b }: Rgba): string {
  return `${clamp(r)}, ${clamp(g)}, ${clamp(b)}`;
}

/** Mixes towards white (`amount` > 0) or black (`amount` < 0), in -1 … 1. */
export function shade(color: Rgba, amount: number): Rgba {
  const target = amount >= 0 ? 255 : 0;
  const t = Math.min(1, Math.abs(amount));
  return {
    r: color.r + (target - color.r) * t,
    g: color.g + (target - color.g) * t,
    b: color.b + (target - color.b) * t,
    a: color.a,
  };
}

/**
 * Hue in degrees, 0 … 360. Grey returns null: it has no hue to compare.
 *
 * Used to decide which colours in a theme belong to the accent family. A theme
 * mixes several hues on purpose — modern's hairline runs indigo into teal —
 * and re-tinting "everything" would flatten that into one colour.
 */
export function hue({ r, g, b }: Rgba): number | null {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta < 8) {return null;} // effectively grey
  let h: number;
  if (max === r) {h = ((g - b) / delta) % 6;}
  else if (max === g) {h = (b - r) / delta + 2;}
  else {h = (r - g) / delta + 4;}
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** The smaller angle between two hues, 0 … 180. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Relative luminance, WCAG definition. */
export function luminance({ r, g, b }: Rgba): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Black or white, whichever is readable on this colour.
 *
 * A theme re-tinted to lime or amber needs dark text on its primary buttons;
 * one re-tinted to navy needs white. Leaving that to the caller is leaving the
 * single most common mistake in a brand swap to the person least likely to
 * check it.
 */
export function readableOn(color: Rgba, dark = "#12100c", light = "#ffffff"): string {
  const onDark = contrastRatio(color, parseColor(dark)!);
  const onLight = contrastRatio(color, parseColor(light)!);
  return onDark >= onLight ? dark : light;
}

/**
 * Composite a translucent colour over an opaque one.
 *
 * Source-over alpha compositing — what the browser does when it paints one on
 * the other, so the result is the colour you would have seen had the backdrop
 * been there.
 *
 * Lives here rather than beside the tints because `tokens.ts` needs it to
 * derive the `*Tint` tokens, and `tints.ts` imports `tokens.ts`. One direction
 * only: this module imports nothing.
 */
export function over(wash: string, backdrop: string): string {
  const top = parseColor(wash);
  const bottom = parseColor(backdrop);
  if (top == null || bottom == null) {
    return wash;
  }
  const alpha = top.a ?? 1;
  if (alpha >= 1) {
    return wash;
  }
  const mix = (t: number, b: number) => Math.round(t * alpha + b * (1 - alpha));
  return `rgb(${mix(top.r, bottom.r)}, ${mix(top.g, bottom.g)}, ${mix(top.b, bottom.b)})`;
}
