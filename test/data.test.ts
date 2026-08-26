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
