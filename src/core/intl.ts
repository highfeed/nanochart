/**
 * Date and number formatting for one chart.
 *
 * Everything goes through `Intl`, which the runtime already ships, so a chart
 * is not stuck with English month names and the host's timezone. Instances are
 * expensive to construct and cheap to reuse, so each one is built on first use
 * and kept for the life of the chart.
 */
export interface Formats {
  readonly locale: string | undefined;
  readonly timeZone: string | undefined;
  /** "Jan 7" */
  day(timestamp: number): string;
  /** "Sat, 7 Jan 2023" */
  date(timestamp: number): string;
  /** "14:05" */
  time(timestamp: number): string;
  /** "Jan 2023" */
  month(timestamp: number): string;
  /** "1,234,567" */
  number(value: number): string;
  /**
   * Start of the local day containing `timestamp`, in the configured zone.
   * Tick alignment needs this: a day boundary in Tokyo is not a day boundary
   * in UTC, and anchoring to the wrong one puts every label at 15:00.
   */
  startOfDay(timestamp: number): number;
  /** Shifts by whole calendar months, honouring the configured zone. */
  addMonths(timestamp: number, months: number): number;
  /** Start of the calendar month containing `timestamp`. */
  startOfMonth(timestamp: number): number;
  /** Month index 0..11 in the configured zone. */
  monthOf(timestamp: number): number;
}

type DateOptions = Intl.DateTimeFormatOptions;

const DAY_LABEL: DateOptions = { month: 'short', day: 'numeric' };
const DATE_LABEL: DateOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
const TIME_LABEL: DateOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
const MONTH_LABEL: DateOptions = { month: 'short', year: 'numeric' };
const PARTS: DateOptions = {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
};

export function createFormats(locale?: string, timeZone?: string): Formats {
  const cache = new Map<DateOptions, Intl.DateTimeFormat>();
  const dtf = (options: DateOptions): Intl.DateTimeFormat => {
    let found = cache.get(options);
    if (!found) {
      found = new Intl.DateTimeFormat(locale, timeZone ? { ...options, timeZone } : options);
      cache.set(options, found);
    }
    return found;
  };

  let numbers: Intl.NumberFormat | undefined;

  /** Wall-clock fields in the configured zone. */
  const fields = (timestamp: number): number[] => {
    const parts = dtf(PARTS).formatToParts(timestamp);
    const out: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== 'literal') out[part.type] = Number(part.value);
    }
    // 24:00 is how some locales spell midnight.
    return [out.year, (out.month ?? 1) - 1, out.day, out.hour % 24, out.minute, out.second];
  };

  /**
   * Offset of the configured zone at this instant, in milliseconds.
   * Reading the wall clock as if it were UTC and subtracting gives it without
   * a timezone database of our own.
   */
  const offset = (timestamp: number): number => {
    if (!timeZone) return -new Date(timestamp).getTimezoneOffset() * 60_000;
    const [y, m, d, h, min, s] = fields(timestamp);
    return Date.UTC(y, m, d, h, min, s) - Math.floor(timestamp / 1000) * 1000;
  };

  /** Builds an instant from wall-clock fields in the configured zone. */
  const fromFields = (y: number, m: number, d: number, h = 0, min = 0): number => {
    const guess = Date.UTC(y, m, d, h, min);
    if (!timeZone) return new Date(y, m, d, h, min).getTime();
    // One correction pass is enough away from a DST seam, and lands within an
    // hour of it — which is all a tick anchor needs.
    return guess - offset(guess - offset(guess));
  };

  return {
    locale,
    timeZone,
    day: (t) => dtf(DAY_LABEL).format(t),
    date: (t) => dtf(DATE_LABEL).format(t),
    time: (t) => dtf(TIME_LABEL).format(t),
    month: (t) => dtf(MONTH_LABEL).format(t),
    number(value) {
      if (!Number.isFinite(value)) return String(value);
      numbers ??= new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
      return numbers.format(value);
    },
    startOfDay(t) {
      const [y, m, d] = fields(t);
      return fromFields(y, m, d);
    },
    startOfMonth(t) {
      const [y, m] = fields(t);
      return fromFields(y, m, 1);
    },
    monthOf: (t) => fields(t)[1],
    addMonths(t, months) {
      const [y, m, d, h, min] = fields(t);
      return fromFields(y, m + months, d, h, min);
    },
  };
}

/** Host locale, host timezone. Used by the standalone format helpers. */
let fallback: Formats | undefined;
export function defaultFormats(): Formats {
  return (fallback ??= createFormats());
}
