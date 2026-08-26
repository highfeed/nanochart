import { describe, expect, it } from 'vitest';
import { normalizeData } from '../src/core/data.js';
import { buildStacks } from '../src/core/stack.js';
import type { SeriesState } from '../src/core/types.js';

function series(id: string, values: number[], options: Record<string, unknown> = {}): SeriesState {
  return {
    id,
    type: 'bar',
    options: { id, type: 'bar', data: values, stack: 's', ...options } as never,
    index: 0,
    name: id,
    axis: 'y',
    data: normalizeData(values),
    visible: true,
    alpha: { at: () => 1 } as never,
  };
}

const layout = (list: SeriesState[]) => buildStacks(list, () => 1);

describe('buildStacks', () => {
  it('stacks positive values cumulatively', () => {
    const stacks = layout([series('a', [10, 20]), series('b', [1, 2])]);
    expect([...stacks.get('a')!.top]).toEqual([10, 20]);
    expect([...stacks.get('b')!.base]).toEqual([10, 20]);
    expect([...stacks.get('b')!.top]).toEqual([11, 22]);
  });

  it('grows negative values downwards from zero', () => {
    const stacks = layout([series('up', [10]), series('down', [-4])]);
    expect([...stacks.get('up')!.top]).toEqual([10]);
    expect([...stacks.get('down')!.base]).toEqual([0]);
    expect([...stacks.get('down')!.top]).toEqual([-4]);
  });

  it('normalizes a positive stack to 100%', () => {
    const stacks = layout([
      series('a', [1], { normalize: true }),
      series('b', [3], { normalize: true }),
    ]);
    expect([...stacks.get('a')!.top]).toEqual([25]);
    expect([...stacks.get('b')!.top]).toEqual([100]);
  });

  // `totals[i] > 0` collapses any column whose signed sum is zero or negative.
  it.fails('normalizes a column that contains negative values', () => {
    const stacks = layout([
      series('a', [10], { normalize: true }),
      series('b', [-10], { normalize: true }),
    ]);
    const spans = ['a', 'b'].map((id) => {
      const s = stacks.get(id)!;
      return Math.abs(s.top[0] - s.base[0]);
    });
    expect(spans.reduce((a, b) => a + b, 0)).toBeCloseTo(100);
  });
});
