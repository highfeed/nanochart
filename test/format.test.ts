import { describe, expect, it } from 'vitest';
import { formatCompact, formatGrouped, formatPercent } from '../src/core/utils.js';
import { niceStepUp, ticksFromStep } from '../src/core/scale.js';

describe('formatCompact', () => {
  it('picks a unit per magnitude', () => {
    expect(formatCompact(999)).toBe('999');
    expect(formatCompact(1234)).toBe('1.2K');
    expect(formatCompact(1_500_000)).toBe('1.5M');
    expect(formatCompact(-2400)).toBe('-2.4K');
  });
});

describe('formatGrouped', () => {
  it('groups thousands', () => {
    expect(formatGrouped(1234567)).toBe('1,234,567');
    expect(formatGrouped(-1000)).toBe('-1,000');
    expect(formatGrouped(12.5)).toBe('12.5');
  });

  // Number#toString switches to exponential notation at 1e21 and the grouping
  // regex then mangles it into a wrong number.
  it.fails('handles numbers past the exponential-notation threshold', () => {
    expect(formatGrouped(1e21)).toBe('1,000,000,000,000,000,000,000');
  });
});

describe('formatPercent', () => {
  it('rounds to whole percent', () => {
    expect(formatPercent(12.4)).toBe('12%');
  });
});

describe('ticks', () => {
  it('rounds steps up to a 1/2/5 sequence', () => {
    expect(niceStepUp(1)).toBe(1);
    expect(niceStepUp(1.1)).toBe(2);
    expect(niceStepUp(3)).toBe(5);
    expect(niceStepUp(6)).toBe(10);
  });

  it('produces ticks inside the domain', () => {
    expect(ticksFromStep(0, 10, 2)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('never returns an unbounded tick list', () => {
    expect(ticksFromStep(0, 1e9, 1).length).toBeLessThanOrEqual(1001);
  });
});
