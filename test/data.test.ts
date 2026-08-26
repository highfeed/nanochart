import { describe, expect, it } from 'vitest';
import { lowerBound, nearestIndex, normalizeData, pointAt } from '../src/core/data.js';

import type { SeriesInput } from '../src/core/types.js';

const xs = (input: SeriesInput) => Array.from(normalizeData(input).x);
const ys = (input: SeriesInput) => Array.from(normalizeData(input).y);

describe('normalizeData', () => {
  it('accepts a flat number array', () => {
    expect(xs([5, 7, 3])).toEqual([0, 1, 2]);
    expect(ys([5, 7, 3])).toEqual([5, 7, 3]);
  });

  it('accepts [x, y] tuples', () => {
    expect(xs([[10, 1], [20, 2]])).toEqual([10, 20]);
    expect(ys([[10, 1], [20, 2]])).toEqual([1, 2]);
  });

  it('accepts {x, y} objects', () => {
    expect(ys([{ x: 0, y: 4 }, { x: 1, y: 8 }])).toEqual([4, 8]);
  });

  it('sorts unsorted input, keeping columns aligned', () => {
    const data = normalizeData([[3, 0], [1, 1], [2, 2]]);
    expect(Array.from(data.x)).toEqual([1, 2, 3]);
    expect(Array.from(data.y)).toEqual([1, 2, 0]);
  });

  it('leaves a gap, not a zero, where an OHLC series has no candle', () => {
    // The columns are allocated at the first OHLC sample and only OHLC samples
    // write to them. A zero left in the rest is a price: it draws a candle on
    // the baseline and drags the whole axis down to meet it.
    const data = normalizeData([
      { x: 1, open: 100, high: 110, low: 95, close: 105 },
      null,
      { x: 3, open: 105, high: 115, low: 100, close: 112 },
    ] as never);
    expect(Array.from(data.low!)).toEqual([95, NaN, 100]);
    expect(Array.from(data.high!)).toEqual([110, NaN, 115]);
    expect(Array.from(data.open!)).toEqual([100, NaN, 105]);
    expect(Array.from(data.close!)).toEqual([105, NaN, 112]);
  });

  it('leaves a gap for a plain point sitting among candles', () => {
    const data = normalizeData([
      { x: 1, y: 7 },
      { x: 2, open: 100, high: 110, low: 95, close: 105 },
    ] as never);
    expect(Array.from(data.low!)).toEqual([NaN, 95]);
    expect(Array.from(data.y)).toEqual([7, 105]);
  });

  it('stores OHLC in their own columns and mirrors close into y', () => {
    const data = normalizeData([{ x: 0, open: 1, high: 4, low: 0, close: 3 }]);
    expect(data.open && Array.from(data.open)).toEqual([1]);
    expect(data.high && Array.from(data.high)).toEqual([4]);
    expect(Array.from(data.y)).toEqual([3]);
  });

  it('returns empty data for an empty or missing input', () => {
    expect(normalizeData([]).length).toBe(0);
    expect(normalizeData(null).length).toBe(0);
  });

  it('stores samples columnar, not one object per point', () => {
    const data = normalizeData([1, 2, 3]);
    expect(data.x).toBeInstanceOf(Float64Array);
    expect(data.y).toBeInstanceOf(Float64Array);
  });
});

describe('gaps', () => {
  it('accepts null as a gap instead of throwing', () => {
    const data = normalizeData([1, null, 3]);
    expect(data.length).toBe(3);
    expect(Number.isNaN(data.y[1])).toBe(true);
    expect(data.gaps).toBe(true);
  });

  it('treats undefined and non-finite numbers as gaps too', () => {
    expect(Number.isNaN(normalizeData([1, undefined, 3]).y[1])).toBe(true);
    expect(Number.isNaN(normalizeData([1, NaN, 3]).y[1])).toBe(true);
    expect(Number.isNaN(normalizeData([1, Infinity, 3]).y[1])).toBe(true);
  });

  it('accepts a null entry among objects and tuples', () => {
    expect(() => normalizeData([{ x: 0, y: 1 }, null, { x: 2, y: 3 }])).not.toThrow();
    expect(() => normalizeData([[0, 1], null, [2, 3]])).not.toThrow();
  });

  it('keeps the index as the position in a flat array', () => {
    // Nothing in `[1, null, 3]` carries an x, so the slot's index is its
    // position and the gap belongs at 1.
    const data = normalizeData([1, null, 3]);
    expect([...data.x]).toEqual([0, 1, 2]);
  });

  it('settles a bare null between the samples it sits between', () => {
    // The index is not a timestamp. Taking it put the gap at the epoch, which
    // stretched a 72-hour chart across half a century; the position it does
    // have comes from its neighbours, which on an hourly grid is the missing
    // hour itself.
    const hour = 3_600_000;
    const t = Date.UTC(2026, 7, 26);
    const data = normalizeData([[t, 5], null, [t + 2 * hour, 7]]);
    expect(data.x[1]).toBe(t + hour);
    expect(Number.isNaN(data.y[1])).toBe(true);
    expect(data.gaps).toBe(true);
    // The gap stays where it was put, so it still breaks the line between the
    // two samples rather than being moved to one end.
    expect(data.x[0]).toBe(t);
    expect(data.x[2]).toBe(t + 2 * hour);
  });

  it('spreads a run of nulls evenly across the space they span', () => {
    const data = normalizeData([[0, 1], null, null, null, [8, 2]]);
    expect([...data.x]).toEqual([0, 2, 4, 6, 8]);
  });

  it('gathers a null at either end onto its one neighbour', () => {
    // There is nothing on the far side to interpolate against, and inventing a
    // position out there would stretch the extent to reach it.
    const data = normalizeData([null, [10, 1], [20, 2], null]);
    expect([...data.x]).toEqual([10, 10, 20, 20]);
    expect([...data.y].map((v) => (Number.isNaN(v) ? 'gap' : v))).toEqual(['gap', 1, 2, 'gap']);
  });

  it('treats a sample whose own x is unusable as a gap, not as a reading', () => {
    // A number with nowhere to go is not a value: placing it would be inventing
    // the position, and keeping it would put it in the y domain unseen.
    const data = normalizeData([{ x: 0, y: 1 }, { x: Number.NaN, y: 999 }, { x: 2, y: 3 }]);
    expect([...data.x]).toEqual([0, 1, 2]);
    expect(Number.isNaN(data.y[1])).toBe(true);
  });

  it('keeps the x column searchable past a hole', () => {
    // `lowerBound` binary-searches this column, and `x[mid] < value` is false
    // for a NaN, so a hole in the middle sent the search into the wrong half
    // and everything after it fell out of the window.
    const data = normalizeData([[0, 5], null, [2, 7], [3, 9]]);
    expect(lowerBound(data, 2)).toBe(2);
    expect(lowerBound(data, 3)).toBe(3);
    expect(lowerBound(data, 4)).toBe(4);
  });

  it('does not let an unpositioned gap reorder the series', () => {
    const data = normalizeData([[10, 1], null, [20, 2], [30, 3]]);
    expect([...data.y].map((v) => (Number.isNaN(v) ? 'gap' : v))).toEqual([1, 'gap', 2, 3]);
  });

  it('sorts a settled gap along with everything else', () => {
    // Unsorted input with holes in it used to have to give one of the two up.
    // Once a hole has a position it can be ordered like any other sample.
    const data = normalizeData([[30, 3], null, [10, 1]]);
    expect([...data.x]).toEqual([10, 20, 30]);
    expect([...data.y].map((v) => (Number.isNaN(v) ? 'gap' : v))).toEqual([1, 'gap', 3]);
  });

  it('reports no gaps for clean data', () => {
    expect(normalizeData([1, 2, 3]).gaps).toBe(false);
  });
});

describe('lookups', () => {
  const data = normalizeData([[0, 0], [10, 0], [20, 0]]);

  it('finds the first index at or after a value', () => {
    expect(lowerBound(data, -1)).toBe(0);
    expect(lowerBound(data, 10)).toBe(1);
    expect(lowerBound(data, 99)).toBe(3);
  });

  it('finds the closest point on either side', () => {
    expect(nearestIndex(data, 4)).toBe(0);
    expect(nearestIndex(data, 6)).toBe(1);
    expect(nearestIndex(data, 999)).toBe(2);
  });

  it('returns -1 for an empty series', () => {
    expect(nearestIndex(normalizeData([]), 5)).toBe(-1);
  });
});

describe('pointAt', () => {
  it('materializes a plain point', () => {
    expect(pointAt(normalizeData([[7, 42]]), 0)).toEqual({ x: 7, y: 42 });
  });

  it('includes the OHLC fields when present', () => {
    const data = normalizeData([{ x: 0, open: 1, high: 4, low: 0, close: 3 }]);
    expect(pointAt(data, 0)).toEqual({ x: 0, y: 3, open: 1, high: 4, low: 0, close: 3 });
  });
});

describe('input ergonomics', () => {
  // Array literals infer as number[][], never as tuples. If SeriesInput asks
  // for tuples, every call site needs an assertion — so this file compiling
  // without casts is the assertion.
  it('accepts the literal forms people actually write', () => {
    expect(normalizeData([1, 2, 3]).length).toBe(3);
    expect(normalizeData([[1, 2], [3, 4]]).length).toBe(2);
    expect(normalizeData([{ x: 1, y: 2 }]).length).toBe(1);
    expect(normalizeData([{ x: 0, open: 1, high: 2, low: 0, close: 1 }]).length).toBe(1);
    expect(normalizeData([1, null, 3]).length).toBe(3);
  });
});
