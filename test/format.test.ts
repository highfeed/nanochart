import { describe, expect, it } from 'vitest';
import { compactFormatter, formatCompact, formatGrouped, formatPercent } from '../src/core/utils.js';
import { niceStepUp, ticksFromStep } from '../src/core/scale.js';

describe('formatCompact', () => {
  it('picks a unit per magnitude', () => {
    expect(formatCompact(999)).toBe('999');
    expect(formatCompact(1234)).toBe('1.2K');
    expect(formatCompact(1_500_000)).toBe('1.5M');
    expect(formatCompact(-2400)).toBe('-2.4K');
  });
});

describe('compactFormatter', () => {
  it('takes its precision from the step', () => {
    const format = compactFormatter(0.5);
    expect([0.5, 1, 1.5].map(format)).toEqual(['0.5', '1', '1.5']);
    expect([1000, 2000].map(compactFormatter(1000))).toEqual(['1K', '2K']);
  });

  // `toPrecision` switches to exponential notation below 1e-6, and counting
  // the digits of `1.00000000000e-7` took the exponent for decimals. Every
  // tick on an axis that fine came out as a bare "0".
  it('keeps ticks apart below the exponential-notation threshold', () => {
    const format = compactFormatter(1e-7);
    expect([1e-7, 2e-7, 3e-7].map(format)).toEqual(['0.0000001', '0.0000002', '0.0000003']);
  });

  it('goes on working further down', () => {
    expect([5e-9, 1e-8].map(compactFormatter(5e-9))).toEqual(['0.000000005', '0.00000001']);
  });

  it('did not lose the range that already worked', () => {
    expect([2e-6, 4e-6].map(compactFormatter(2e-6))).toEqual(['0.000002', '0.000004']);
    expect([1e-5, 2e-5].map(compactFormatter(1e-5))).toEqual(['0.00001', '0.00002']);
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
  it('handles numbers past the exponential-notation threshold', () => {
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
