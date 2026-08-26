import { formatCompact, formatDay, formatMonth, formatTime } from './utils.js';

export interface Scale {
  readonly d0: number;
  readonly d1: number;
  readonly r0: number;
  readonly r1: number;
  /** Domain value -> pixel. */
  map(value: number): number;
  /** Pixel -> domain value. */
  invert(pixel: number): number;
}

export function scaleLinear(d0: number, d1: number, r0: number, r1: number): Scale {
  const span = d1 - d0 || 1;
  const k = (r1 - r0) / span;
  return {
    d0,
    d1,
    r0,
    r1,
    map: (value) => r0 + (value - d0) * k,
    invert: (pixel) => d0 + (pixel - r0) / k,
  };
}

/** Rounded step that yields roughly `count` intervals across the span. */
export function niceStep(span: number, count: number): number {
  if (!(span > 0) || count <= 0) return 1;
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const factor = normalized >= 7.5 ? 10 : normalized >= 3.5 ? 5 : normalized >= 1.5 ? 2 : 1;
  return factor * magnitude;
}

/** Smallest 1/2/5-based step that is not smaller than `raw`. */
export function niceStepUp(raw: number): number {
  if (!(raw > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  // Nudge down so an exact 1, 2 or 5 does not fall through to the next factor.
  const normalized = raw / magnitude - 1e-9;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

/** Next 1/2/5-based step above `step`. */
export function nextNiceStep(step: number): number {
  return niceStepUp(step * 1.5);
}

export function ticksFromStep(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  if (!(step > 0) || !Number.isFinite(min) || !Number.isFinite(max)) return out;
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  const factor = 10 ** decimals;
  const first = Math.ceil(min / step - 1e-9);
  const last = Math.floor(max / step + 1e-9);
  const limit = Math.min(last - first, 1000);
  for (let i = 0; i <= limit; i++) {
    out.push(Math.round((first + i) * step * factor) / factor);
  }
  return out;
}

export function linearTickSet(min: number, max: number, count: number): { ticks: number[]; step: number } {
  const step = niceStepUp((max - min) / Math.max(1, count));
  return { ticks: min === max ? [min] : ticksFromStep(min, max, step), step };
}

export function linearTicks(min: number, max: number, count: number): number[] {
  return linearTickSet(min, max, count).ticks;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

const TIME_STEPS = [
  SECOND, 5 * SECOND, 15 * SECOND, 30 * SECOND,
  MINUTE, 5 * MINUTE, 15 * MINUTE, 30 * MINUTE,
  HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR,
  DAY, 2 * DAY, 4 * DAY, WEEK, 2 * WEEK,
  MONTH, 3 * MONTH, 6 * MONTH, YEAR, 2 * YEAR, 5 * YEAR, 10 * YEAR,
];

export function timeStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  for (const step of TIME_STEPS) {
    if (step >= raw) return step;
  }
  return TIME_STEPS[TIME_STEPS.length - 1];
}

export function timeTicks(min: number, max: number, count: number): number[] {
  const step = timeStep(max - min, count);
  const out: number[] = [];
  let value = alignTime(min, step);
  while (value <= max && out.length < 1000) {
    out.push(value);
    value = step >= MONTH ? addMonths(value, Math.round(step / MONTH)) : value + step;
  }
  return out;
}

function alignTime(min: number, step: number): number {
  if (step < HOUR) return Math.ceil(min / step) * step;
  // Anchor everything from an hour upwards to local midnight.
  const date = new Date(min);
  date.setHours(0, 0, 0, 0);
  if (step >= MONTH) {
    date.setDate(1);
    const months = Math.max(1, Math.round(step / MONTH));
    date.setMonth(Math.ceil(date.getMonth() / months) * months);
    while (date.getTime() < min) date.setMonth(date.getMonth() + months);
    return date.getTime();
  }
  let value = date.getTime();
  while (value < min) value += step;
  return value;
}

function addMonths(timestamp: number, months: number): number {
  const date = new Date(timestamp);
  date.setMonth(date.getMonth() + months);
  return date.getTime();
}

/** Picks a readable label format for the current zoom level. */
export function timeFormatter(span: number, count: number): (value: number) => string {
  const step = timeStep(span, count);
  if (step < DAY) {
    // Intraday ranges that cross midnight get a date marker on the day boundary.
    return span > 2 * DAY ? (value) => (isMidnight(value) ? formatDay(value) : formatTime(value)) : formatTime;
  }
  if (step < 10 * MONTH) return formatDay;
  return formatMonth;
}

function isMidnight(value: number): boolean {
  const date = new Date(value);
  return date.getHours() === 0 && date.getMinutes() === 0;
}

export const defaultValueFormatter = formatCompact;
