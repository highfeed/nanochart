import { defaultFormats } from './intl.js';

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

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

/**
 * Tick labels for a log axis.
 *
 * A log axis has no single step to take precision from — 0.001 and 1M can sit
 * on the same axis — so each label takes its precision from its own magnitude.
 */
export function formatLog(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1) return formatCompact(value);
  const decimals = Math.min(10, Math.ceil(-Math.log10(abs)) + 1);
  return Number.parseFloat(value.toFixed(decimals)).toString();
}

/**
 * 1234567 -> "1,234,567", in the host locale.
 *
 * Grouping by hand breaks at 1e21, where `Number#toString` switches to
 * exponential notation and the digits stop lining up. A chart with its own
 * `locale` formats through `chart.formats.number` instead.
 */
export function formatGrouped(value: number): string {
  return defaultFormats().number(value);
}

function trimZero(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return digits > 0 && text.endsWith('.0') ? text.slice(0, -2) : text;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/** "Jan 7", in the host locale and timezone. */
export function formatDay(timestamp: number): string {
  return defaultFormats().day(timestamp);
}

/** "Sat, 7 Jan 2023", in the host locale and timezone. */
export function formatDate(timestamp: number): string {
  return defaultFormats().date(timestamp);
}

/** "14:05", in the host locale and timezone. */
export function formatTime(timestamp: number): string {
  return defaultFormats().time(timestamp);
}

/** "Jan 2023", in the host locale and timezone. */
export function formatMonth(timestamp: number): string {
  return defaultFormats().month(timestamp);
}

export function boxContains(box: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean {
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}
