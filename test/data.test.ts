import { describe, expect, it } from 'vitest';
import { nearestIndex, normalizePoints } from '../src/core/utils.js';

describe('normalizePoints', () => {
  it('accepts a flat number array', () => {
    expect(normalizePoints([5, 7, 3])).toEqual([
      { x: 0, y: 5 },
      { x: 1, y: 7 },
      { x: 2, y: 3 },
    ]);
  });

  it('accepts [x, y] tuples', () => {
    expect(normalizePoints([[10, 1], [20, 2]])).toEqual([
      { x: 10, y: 1 },
      { x: 20, y: 2 },
    ]);
  });

  it('sorts unsorted input by x', () => {
    expect(normalizePoints([[3, 'c'], [1, 'a'], [2, 'b']] as never).map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('derives y from close for OHLC input', () => {
    const [point] = normalizePoints([{ x: 0, open: 1, high: 4, low: 0, close: 3 }]);
    expect(point.y).toBe(3);
    expect(point.high).toBe(4);
  });

  // null is the conventional way to express a gap in a series.
  it.fails('accepts null as a gap instead of throwing', () => {
    expect(() => normalizePoints([1, null, 3] as never)).not.toThrow();
  });

  // NaN currently flows straight into the canvas path.
  it.fails('does not let NaN reach the point list', () => {
    const points = normalizePoints([1, NaN, 3]);
    expect(points.every((p) => Number.isFinite(p.y))).toBe(true);
  });
});

describe('nearestIndex', () => {
  const points = normalizePoints([[0, 0], [10, 0], [20, 0]]);
  it('finds the closest point on either side', () => {
    expect(nearestIndex(points, 4)).toBe(0);
    expect(nearestIndex(points, 6)).toBe(1);
    expect(nearestIndex(points, 999)).toBe(2);
  });
  it('returns -1 for an empty series', () => {
    expect(nearestIndex([], 5)).toBe(-1);
  });
});
