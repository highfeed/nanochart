import type { Point, SeriesInput } from './types.js';

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function normalizePoints(input: SeriesInput): Point[] {
  const out: Point[] = new Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const raw = input[i];
    if (typeof raw === 'number') {
      out[i] = { x: i, y: raw };
    } else if (Array.isArray(raw)) {
      const tuple = raw as readonly [number, number];
      out[i] = { x: tuple[0], y: tuple[1] };
    } else {
      const point = raw as Point;
      out[i] =
        point.close === undefined
          ? { x: point.x, y: point.y }
          : { ...point, y: (point.y as number | undefined) ?? point.close };
    }
  }
  for (let i = 1; i < out.length; i++) {
    if (out[i].x < out[i - 1].x) {
      out.sort((a, b) => a.x - b.x);
      break;
    }
  }
  return out;
}

/** First index whose x is >= value, or `points.length`. */
export function lowerBound(points: readonly Point[], value: number): number {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].x < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index of the point closest to `value`, or -1 for empty series. */
export function nearestIndex(points: readonly Point[], value: number): number {
  if (points.length === 0) return -1;
  const i = lowerBound(points, value);
  if (i === 0) return 0;
  if (i >= points.length) return points.length - 1;
  return value - points[i - 1].x <= points[i].x - value ? i - 1 : i;
}

const COMPACT_UNITS = ['', 'K', 'M', 'B', 'T'];

/** 1234 -> "1.2K" */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1000) return trimZero(value, abs < 10 && !Number.isInteger(value) ? 1 : 0);
  let unit = 0;
  let scaled = value;
  while (Math.abs(scaled) >= 1000 && unit < COMPACT_UNITS.length - 1) {
    scaled /= 1000;
    unit++;
  }
  return trimZero(scaled, Math.abs(scaled) < 10 ? 1 : 0) + COMPACT_UNITS[unit];
}

function unitOf(value: number): number {
  const abs = Math.abs(value);
  if (abs < 1000) return 0;
  return Math.min(COMPACT_UNITS.length - 1, Math.floor(Math.log10(abs) / 3));
}

function decimalsOf(step: number): number {
  if (!(step > 0)) return 0;
  const text = step.toPrecision(12).replace(/0+$/, '');
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : Math.min(6, text.length - dot - 1);
}

/**
 * Compact formatter for axis ticks: each value picks its own unit, while `step`
 * decides the precision, so neighbouring labels never collapse into each other.
 */
export function compactFormatter(step: number): (value: number) => string {
  return (value) => {
    if (value === 0) return '0';
    const unit = unitOf(value);
    const scale = 1000 ** unit;
    const text = (value / scale).toFixed(decimalsOf(Math.abs(step) / scale));
    return (text.includes('.') ? text.replace(/\.?0+$/, '') : text) + COMPACT_UNITS[unit];
  };
}

/** 1234567 -> "1,234,567" */
export function formatGrouped(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const [int, frac] = Math.abs(rounded).toString().split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${rounded < 0 ? '-' : ''}${grouped}${frac ? `.${frac}` : ''}`;
}

function trimZero(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return digits > 0 && text.endsWith('.0') ? text.slice(0, -2) : text;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad2 = (value: number): string => (value < 10 ? `0${value}` : `${value}`);

/** "Jan 7" */
export function formatDay(timestamp: number): string {
  const date = new Date(timestamp);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** "Sat, 7 Jan 2023" */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "14:05" */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatMonth(timestamp: number): string {
  const date = new Date(timestamp);
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function boxContains(box: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean {
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}
