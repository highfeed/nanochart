import type { OhlcInput, Point, SeriesInput } from './types.js';

/**
 * Samples stored as parallel typed arrays rather than one object per point.
 *
 * A missing sample is `NaN` in `y`. That is the canonical "no value here", it
 * costs nothing to store, and it propagates naturally: comparisons against it
 * are false, so gaps fall out of domain scans on their own, and renderers
 * break their path when they meet one.
 */
export interface SeriesData {
  readonly length: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** OHLC columns, present only for candlestick-shaped input. */
  readonly open: Float64Array | null;
  readonly high: Float64Array | null;
  readonly low: Float64Array | null;
  readonly close: Float64Array | null;
  /** True when at least one sample is missing, so renderers can skip the check. */
  readonly gaps: boolean;
}

const EMPTY = new Float64Array(0);

/** A column that starts out as all gaps, rather than as all zeros. */
const gapped = (length: number): Float64Array => new Float64Array(length).fill(Number.NaN);

export const emptyData = (): SeriesData => ({
  length: 0,
  x: EMPTY,
  y: EMPTY,
  open: null,
  high: null,
  low: null,
  close: null,
  gaps: false,
});

/** Anything that is not a usable number becomes a gap. */
function value(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : Number.NaN;
}

function isOhlc(raw: unknown): raw is OhlcInput {
  return typeof raw === 'object' && raw !== null && 'close' in raw;
}

/** Reads `[5, 7]`, `[[ts, 5]]`, `[{ x, y }]` and OHLC objects into columns. */
export function normalizeData(input: SeriesInput | null | undefined): SeriesData {
  const length = input ? input.length : 0;
  if (!input || length === 0) return emptyData();

  const x = new Float64Array(length);
  const y = new Float64Array(length);
  let ohlc: { open: Float64Array; high: Float64Array; low: Float64Array; close: Float64Array } | null = null;
  let gaps = false;
  let sorted = true;
  /** True once a sample has carried an x of its own. */
  let positioned = false;
  let holed = false;
  /** Last x that had a position, so holes cannot look out of order. */
  let previous = -Infinity;

  for (let i = 0; i < length; i++) {
    const raw = input[i] as unknown;

    if (typeof raw === 'number') {
      x[i] = i;
      y[i] = value(raw);
    } else if (Array.isArray(raw)) {
      positioned = true;
      x[i] = value(raw[0]);
      y[i] = value(raw[1]);
    } else if (raw === null || raw === undefined) {
      // A bare hole has no position of its own. `[[t1, 5], null, [t3, 7]]`
      // asks for a break between two timestamps, not for a sample at x = 1:
      // reading the index as an x put the gap at the epoch and stretched a
      // time axis across every year since. In a flat array the index *is* the
      // position, and those are filled in below.
      holed = true;
      x[i] = Number.NaN;
      y[i] = Number.NaN;
    } else if (isOhlc(raw)) {
      // Gaps, not zeros: the columns are allocated at the first OHLC sample and
      // only the OHLC samples write to them, so every other slot — a hole, a
      // plain `{ x, y }` among candles — has to read as "no candle here". A
      // zero is a price: it draws a phantom candle on the baseline, and
      // `candlestick.extent` scans the columns directly, so it drags the whole
      // price axis down to meet it.
      ohlc ??= { open: gapped(length), high: gapped(length), low: gapped(length), close: gapped(length) };
      positioned = true;
      x[i] = value(raw.x);
      ohlc.open[i] = value(raw.open);
      ohlc.high[i] = value(raw.high);
      ohlc.low[i] = value(raw.low);
      ohlc.close[i] = value(raw.close);
      y[i] = value((raw as Point).y ?? raw.close);
    } else {
      const point = raw as Point;
      positioned = true;
      x[i] = value(point.x);
      y[i] = value(point.y);
    }

    if (Number.isNaN(y[i])) gaps = true;
    // Ordering is a question about positions, so holes sit it out.
    if (!Number.isNaN(x[i])) {
      if (x[i] < previous) sorted = false;
      previous = x[i];
    }
  }

  // Nothing carried an x, so the index is the position after all — including
  // for the holes, which is what a gap in a flat array means.
  if (holed && !positioned) for (let i = 0; i < length; i++) x[i] = i;

  const data: SeriesData = {
    length,
    x,
    y,
    open: ohlc?.open ?? null,
    high: ohlc?.high ?? null,
    low: ohlc?.low ?? null,
    close: ohlc?.close ?? null,
    gaps,
  };
  return sorted ? data : sortByX(data);
}

/** Reorders every column by ascending x, through a single index permutation. */
function sortByX(data: SeriesData): SeriesData {
  const order = new Uint32Array(data.length);
  for (let i = 0; i < data.length; i++) order[i] = i;
  const x = data.x;
  // Unpositioned samples have no place in an ordering, and a NaN comparator
  // result leaves the sort implementation-defined. They go to the end, where
  // they still read as gaps.
  order.sort((a, b) => {
    const ax = x[a];
    const bx = x[b];
    if (Number.isNaN(ax)) return Number.isNaN(bx) ? a - b : 1;
    if (Number.isNaN(bx)) return -1;
    return ax - bx;
  });

  const take = (column: Float64Array | null): Float64Array | null => {
    if (!column) return null;
    const out = new Float64Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = column[order[i]];
    return out;
  };

  return {
    length: data.length,
    x: take(data.x) as Float64Array,
    y: take(data.y) as Float64Array,
    open: take(data.open),
    high: take(data.high),
    low: take(data.low),
    close: take(data.close),
    gaps: data.gaps,
  };
}

/** First index whose x is >= value, or `length`. */
export function lowerBound(data: SeriesData, value: number): number {
  let lo = 0;
  let hi = data.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (data.x[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index of the sample closest to `value`, or -1 when there are none. */
export function nearestIndex(data: SeriesData, value: number): number {
  if (data.length === 0) return -1;
  const i = lowerBound(data, value);
  if (i === 0) return 0;
  if (i >= data.length) return data.length - 1;
  return value - data.x[i - 1] <= data.x[i] - value ? i - 1 : i;
}

/** Materializes one sample as an object, for callbacks and custom renderers. */
export function pointAt(data: SeriesData, i: number): Point {
  const point: Point = { x: data.x[i], y: data.y[i] };
  if (data.open) {
    point.open = data.open[i];
    point.high = data.high![i];
    point.low = data.low![i];
    point.close = data.close![i];
  }
  return point;
}
