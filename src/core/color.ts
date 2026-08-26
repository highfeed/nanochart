export type RGBA = readonly [number, number, number, number];

const TRANSPARENT: RGBA = [0, 0, 0, 0];
const cache = new Map<string, RGBA>();
const CACHE_LIMIT = 512;

/**
 * Parses any CSS color the host understands.
 *
 * Hex, `rgb()` and `hsl()` are read directly, along with the basic colour
 * keywords, so the common cases work anywhere — including in a worker or on a
 * server, where there is no canvas to ask. Anything more exotic is handed to a
 * canvas: most of it (`rebeccapurple`, `hwb()`) normalizes into a form the fast
 * path can read, and what has no sRGB spelling at all (`oklch()`, `lab()`,
 * `color()`) is painted and read back off the pixel. Without a canvas those
 * resolve to transparent.
 */
export function parseColor(input: string): RGBA {
  const cached = cache.get(input);
  if (cached) return cached;
  const parsed = parse(input.trim());
  if (cache.size > CACHE_LIMIT) cache.clear();
  cache.set(input, parsed);
  return parsed;
}

/** The CSS level-1 keywords, plus the greys people actually type. */
const NAMED: Record<string, number> = {
  black: 0x000000, silver: 0xc0c0c0, gray: 0x808080, grey: 0x808080,
  white: 0xffffff, maroon: 0x800000, red: 0xff0000, purple: 0x800080,
  fuchsia: 0xff00ff, magenta: 0xff00ff, green: 0x008000, lime: 0x00ff00,
  olive: 0x808000, yellow: 0xffff00, navy: 0x000080, blue: 0x0000ff,
  teal: 0x008080, aqua: 0x00ffff, cyan: 0x00ffff, orange: 0xffa500,
};

function parse(value: string): RGBA {
  return parseDirect(value) ?? viaCanvas(value);
}

/** The notations that can be read without a canvas. Null when this is not one. */
function parseDirect(value: string): RGBA | null {
  if (value === 'transparent' || value === 'none') return TRANSPARENT;
  if (value.charCodeAt(0) === 35) return parseHex(value.slice(1));

  const open = value.indexOf('(');
  if (open > 0) {
    const fn = value.slice(0, open).toLowerCase();
    const parts = value.slice(open + 1, value.lastIndexOf(')')).split(/[\s,/]+/).filter(Boolean);
    const alpha = parts.length > 3 ? channelAlpha(parts[3]) : 1;
    // Only rgb() carries channel values directly. hsl() used to fall through
    // here and be read as if it were rgb, which is how blues came out brown.
    if (fn === 'rgb' || fn === 'rgba') {
      return [byte(parts[0]), byte(parts[1]), byte(parts[2]), alpha];
    }
    if (fn === 'hsl' || fn === 'hsla') {
      return hslToRgb(
        Number.parseFloat(parts[0]) || 0,
        (Number.parseFloat(parts[1]) || 0) / 100,
        (Number.parseFloat(parts[2]) || 0) / 100,
        alpha,
      );
    }
    return null;
  }

  const named = NAMED[value.toLowerCase()];
  if (named !== undefined) return [(named >> 16) & 255, (named >> 8) & 255, named & 255, 1];
  return null;
}

function hslToRgb(hue: number, s: number, l: number, alpha: number): RGBA {
  const saturation = s < 0 ? 0 : s > 1 ? 1 : s;
  const lightness = l < 0 ? 0 : l > 1 ? 1 : l;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const h = (((hue % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = lightness - c / 2;
  const [r, g, b] =
    h < 1 ? [c, x, 0] :
    h < 2 ? [x, c, 0] :
    h < 3 ? [0, c, x] :
    h < 4 ? [0, x, c] :
    h < 5 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255, alpha];
}

function parseHex(hex: string): RGBA {
  if (hex.length === 3 || hex.length === 4) {
    const a = hex.length === 4 ? expand(hex.charCodeAt(3)) / 255 : 1;
    return [expand(hex.charCodeAt(0)), expand(hex.charCodeAt(1)), expand(hex.charCodeAt(2)), a];
  }
  if (hex.length === 6 || hex.length === 8) {
    const int = Number.parseInt(hex.slice(0, 6), 16);
    const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255, a];
  }
  return TRANSPARENT;
}

/** `50%` -> 127.5, `200` -> 200. */
function byte(part: string | undefined): number {
  if (!part) return 0;
  const n = Number.parseFloat(part);
  if (!Number.isFinite(n)) return 0;
  return part.endsWith('%') ? (n / 100) * 255 : n;
}

function channelAlpha(part: string): number {
  const n = Number.parseFloat(part);
  if (!Number.isFinite(n)) return 1;
  return part.endsWith('%') ? n / 100 : n;
}

function expand(charCode: number): number {
  const digit = Number.parseInt(String.fromCharCode(charCode), 16);
  return Number.isNaN(digit) ? 0 : digit * 17;
}

let probe: CanvasRenderingContext2D | null | undefined;

/** One pixel, kept for the life of the module and read from rarely. */
function probeContext(): CanvasRenderingContext2D | null {
  if (probe === undefined) {
    if (typeof document === 'undefined') {
      probe = null;
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      probe = canvas.getContext('2d', { willReadFrequently: true });
    }
  }
  return probe;
}

/** Normalizes an exotic color by letting the canvas resolve it. */
function viaCanvas(value: string): RGBA {
  const ctx = probeContext();
  if (!ctx) return TRANSPARENT;

  // An unparseable value leaves fillStyle untouched, so a known sentinel tells
  // "the host rejected this" apart from "the host resolved it to black".
  ctx.fillStyle = '#000000';
  ctx.fillStyle = value;
  const first = ctx.fillStyle;
  ctx.fillStyle = '#ffffff';
  ctx.fillStyle = value;
  if (first !== ctx.fillStyle) return TRANSPARENT;

  // Anything with an sRGB spelling comes back as hex or rgb(), which is the
  // whole point of the round trip. A wide-gamut color has no such spelling, so
  // it serializes unchanged — `oklch()`, `lab()` and `color()` are handed back
  // verbatim — and reading that with `parse` would land straight back here and
  // recurse until the stack gave out. Painting it is the way out.
  return parseDirect(String(first)) ?? readPixel(ctx, value);
}

/** Paints the color and reads the pixel, for colors that have no sRGB name. */
function readPixel(ctx: CanvasRenderingContext2D, value: string): RGBA {
  // A partial canvas — a stub, a server-side shim — has a fillStyle but no
  // pixels behind it.
  if (typeof ctx.getImageData !== 'function') return TRANSPARENT;
  try {
    // `copy` writes the source straight through, so a translucent color keeps
    // its alpha instead of being composited onto whatever the pixel held.
    ctx.globalCompositeOperation = 'copy';
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return a === 0 ? TRANSPARENT : [r, g, b, a / 255];
  } catch {
    // Reading pixels back is blocked outright by some privacy settings.
    return TRANSPARENT;
  } finally {
    ctx.globalCompositeOperation = 'source-over';
  }
}

export function rgbaToString(color: RGBA): string {
  const r = Math.round(color[0]);
  const g = Math.round(color[1]);
  const b = Math.round(color[2]);
  return color[3] >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${round3(color[3])})`;
}

/** Interpolates in premultiplied-ish space, good enough for theme cross-fades. */
export function mixColors(a: RGBA, b: RGBA, t: number): RGBA {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t,
  ];
}

export function mixColorStrings(a: string, b: string, t: number): string {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return rgbaToString(mixColors(parseColor(a), parseColor(b), t));
}

export function withAlpha(color: string, alpha: number): string {
  if (alpha >= 1) return color;
  if (alpha <= 0) return 'rgba(0,0,0,0)';
  const [r, g, b, a] = parseColor(color);
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${round3(a * alpha)})`;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
