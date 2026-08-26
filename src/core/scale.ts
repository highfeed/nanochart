import { defaultFormats, type Formats } from './intl.js';
import { formatCompact } from './utils.js';

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

/** Smallest positive value a log domain will accept, so zero cannot reach it. */
const LOG_FLOOR = 1e-12;

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

/**
 * Log scale, for data spanning orders of magnitude.
 *
 * The domain is clamped away from zero rather than rejected: a log axis with a
 * zero or negative bound is a configuration mistake, and refusing to draw is a
 * worse answer than drawing from the smallest positive value.
 */
export function scaleLog(d0: number, d1: number, r0: number, r1: number): Scale {
  const lo = Math.max(d0, LOG_FLOOR);
  const hi = Math.max(d1, lo * 10);
  const l0 = Math.log(lo);
  const span = Math.log(hi) - l0 || 1;
  const k = (r1 - r0) / span;
  return {
    d0: lo,
    d1: hi,
    r0,
    r1,
    map: (value) => r0 + (Math.log(Math.max(value, LOG_FLOOR)) - l0) * k,
    invert: (pixel) => Math.exp(l0 + (pixel - r0) / k),
  };
}

/** Widens a domain to whole decades. */
export function niceLogDomain(min: number, max: number): { min: number; max: number } {
  const lo = Math.max(min, LOG_FLOOR);
  const hi = Math.max(max, lo * 10);
  return {
    min: 10 ** Math.floor(Math.log10(lo)),
    max: 10 ** Math.ceil(Math.log10(hi)),
  };
}

/**
 * Decade ticks, thinned to fit `count`.
 *
 * A short span gets its 2s and 5s as well, because three labels across a whole
 * axis reads as a broken chart rather than a sparse one.
 */
export function logTicks(min: number, max: number, count = 6): number[] {
  const lo = Math.max(min, LOG_FLOOR);
  const hi = Math.max(max, lo * 10);
  const first = Math.floor(Math.log10(lo));
  const last = Math.ceil(Math.log10(hi));
  const decades = last - first;
  const out: number[] = [];

  if (decades <= 0) return [lo, hi];
  const minors = decades * 3 <= count ? [1, 2, 5] : [1];
  const stride = Math.max(1, Math.ceil(decades / Math.max(1, count)));

  for (let e = first; e <= last; e += stride) {
    const decade = 10 ** e;
    for (const m of minors) {
      const value = m * decade;
      if (value >= lo - LOG_FLOOR && value <= hi * (1 + 1e-9)) out.push(value);
    }
  }
  return out;
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

export function timeTicks(min: number, max: number, count: number, formats = defaultFormats()): number[] {
  const step = timeStep(max - min, count);
  const out: number[] = [];
  let value = alignTime(min, step, formats);
  const months = Math.max(1, Math.round(step / MONTH));
  while (value <= max && out.length < 1000) {
    out.push(value);
    value = step >= MONTH ? formats.addMonths(value, months) : value + step;
  }
  return out;
}

function alignTime(min: number, step: number, formats: Formats): number {
  if (step < HOUR) return Math.ceil(min / step) * step;

  // From an hour upwards, ticks anchor to midnight — and midnight is a
  // property of the chart's timezone, not of the machine drawing it.
  if (step >= MONTH) {
    const months = Math.max(1, Math.round(step / MONTH));
    let value = formats.startOfMonth(min);
    const aligned = Math.ceil(formats.monthOf(value) / months) * months;
    value = formats.addMonths(value, aligned - formats.monthOf(value));
    while (value < min) value = formats.addMonths(value, months);
    return value;
  }

  let value = formats.startOfDay(min);
  while (value < min) value += step;
  return value;
}

/** Picks a readable label format for the current zoom level. */
export function timeFormatter(
  span: number,
  count: number,
  formats = defaultFormats(),
): (value: number) => string {
  const step = timeStep(span, count);
  if (step < DAY) {
    // Intraday ranges that cross midnight get a date marker on the day boundary.
    return span > 2 * DAY
      ? (value) => (value === formats.startOfDay(value) ? formats.day(value) : formats.time(value))
      : (value) => formats.time(value);
  }
  if (step < 10 * MONTH) return (value) => formats.day(value);
  return (value) => formats.month(value);
}

export const defaultValueFormatter = formatCompact;
