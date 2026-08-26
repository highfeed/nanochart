export type RGBA = readonly [number, number, number, number];

const TRANSPARENT: RGBA = [0, 0, 0, 0];
const cache = new Map<string, RGBA>();

/** Supports #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(), rgba() and `transparent`. */
export function parseColor(input: string): RGBA {
  const cached = cache.get(input);
  if (cached) return cached;
  const parsed = parse(input.trim());
  cache.set(input, parsed);
  return parsed;
}

function parse(value: string): RGBA {
  if (value === 'transparent' || value === 'none') return TRANSPARENT;
  if (value.charCodeAt(0) === 35) {
    const hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = expand(hex.charCodeAt(0));
      const g = expand(hex.charCodeAt(1));
      const b = expand(hex.charCodeAt(2));
      const a = hex.length === 4 ? expand(hex.charCodeAt(3)) / 255 : 1;
      return [r, g, b, a];
    }
    if (hex.length === 6 || hex.length === 8) {
      const int = Number.parseInt(hex.slice(0, 6), 16);
      const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return [(int >> 16) & 255, (int >> 8) & 255, int & 255, a];
    }
    return TRANSPARENT;
  }
  const open = value.indexOf('(');
  if (open > 0) {
    const parts = value.slice(open + 1, value.lastIndexOf(')')).split(/[\s,/]+/).filter(Boolean);
    const r = Number.parseFloat(parts[0]) || 0;
    const g = Number.parseFloat(parts[1]) || 0;
    const b = Number.parseFloat(parts[2]) || 0;
    const a = parts.length > 3 ? Number.parseFloat(parts[3]) : 1;
    return [r, g, b, Number.isFinite(a) ? a : 1];
  }
  return TRANSPARENT;
}

function expand(charCode: number): number {
  const digit = Number.parseInt(String.fromCharCode(charCode), 16);
  return digit * 17;
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
