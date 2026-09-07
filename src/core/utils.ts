import { defaultFormats } from './intl.js';

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const COMPACT_UNITS = ['', 'K', 'M', 'B', 'T'];

/** 1234 -> "1.2K"; past the last unit, 1e18 -> "1e18" rather than "1000000T". */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1000) return trimZero(value, abs < 10 && !Number.isInteger(value) ? 1 : 0);
  const unit = unitOf(value);
  if (unit >= COMPACT_UNITS.length) return exponent(value, 1);
  const scaled = value / 1000 ** unit;
  return trimZero(scaled, Math.abs(scaled) < 10 ? 1 : 0) + COMPACT_UNITS[unit];
}

/**
 * Thousands past the first, off the exponent `toExponential` prints: exact,
 * where a logarithm can land a hair short of a whole one. A non-finite value
 * has no exponent and stays in the first unit, to be printed as it is.
 */
function unitOf(value: number): number {
  const power = Number(value.toExponential().split('e')[1]);
  return power >= 3 ? Math.floor(power / 3) : 0;
}

/**
 * Scientific notation for what the units do not reach — wei, satoshi, a
 * population in atoms: 1e18 -> "1e18", 2.5e21 -> "2.5e21".
 */
function exponent(value: number, decimals: number): string {
  const [mantissa, power] = value.toExponential(Math.min(decimals, 20)).split('e');
  return `${trimZeros(mantissa)}e${Number(power)}`;
}

/** Past this, a double has no digits left to tell two ticks apart with. */
const MAX_DECIMALS = 15;

/**
 * Decimal places needed to tell two values a `step` apart from each other.
 *
 * Read off the exponent rather than off a rendered string: `toPrecision`
 * switches to exponential notation below 1e-6, and counting the digits of
 * `1.00000000000e-7` took the exponent for decimals. It landed on 6, which was
 * also the cap, so an axis that fine drew every one of its ticks as a bare
 * "0" — five identical labels reading as a chart of nothing.
 */
function decimalsOf(step: number): number {
  if (!(step > 0)) return 0;
  const [mantissa, exponent] = step.toExponential(11).split('e');
  const digits = mantissa.replace(/0+$/, '').replace('.', '').length - 1;
  return Math.max(0, Math.min(MAX_DECIMALS, digits - Number(exponent)));
}

/**
 * Compact formatter for axis ticks: each value picks its own unit, while `step`
 * decides the precision, so neighbouring labels never collapse into each other.
 */
export function compactFormatter(step: number): (value: number) => string {
  return (value) => {
    if (value === 0) return '0';
    const unit = unitOf(value);
    if (unit >= COMPACT_UNITS.length) {
      const power = Number(value.toExponential().split('e')[1]);
      return exponent(value, decimalsOf(Math.abs(step) / 10 ** power));
    }
    const scale = 1000 ** unit;
    return trimZeros((value / scale).toFixed(decimalsOf(Math.abs(step) / scale))) + COMPACT_UNITS[unit];
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

/** "1.50" -> "1.5", "2.00" -> "2". */
function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
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
