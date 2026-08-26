import { describe, expect, it } from 'vitest';
import { mixColorStrings, parseColor, withAlpha } from '../src/core/color.js';

describe('parseColor', () => {
  it('parses hex in every length', () => {
    expect(parseColor('#3e9ff2')).toEqual([62, 159, 242, 1]);
    expect(parseColor('#abc')).toEqual([170, 187, 204, 1]);
    expect(parseColor('#3e9ff280')).toEqual([62, 159, 242, 128 / 255]);
  });

  it('parses rgb() and rgba()', () => {
    expect(parseColor('rgb(1,2,3)')).toEqual([1, 2, 3, 1]);
    expect(parseColor('rgba(1,2,3,0.5)')).toEqual([1, 2, 3, 0.5]);
  });

  it('treats transparent as fully clear', () => {
    expect(parseColor('transparent')).toEqual([0, 0, 0, 0]);
  });

  // https://github.com/highfeed/nanochart/issues — named CSS colors
  it.fails('supports named CSS colors', () => {
    expect(parseColor('red')).toEqual([255, 0, 0, 1]);
  });

  // hsl() currently falls into the generic "function(...)" branch and its
  // arguments are read as if they were r, g, b — a silently wrong colour.
  it.fails('parses hsl() instead of reading it as rgb', () => {
    const [r, g, b] = parseColor('hsl(210 90% 50%)');
    expect([r, g, b]).not.toEqual([210, 90, 50]);
    expect(b).toBeGreaterThan(r);
  });
});

describe('theme cross-fade', () => {
  it('interpolates two hex colors', () => {
    expect(mixColorStrings('#000000', '#ffffff', 0.5)).toBe('rgb(128,128,128)');
  });

  it('short-circuits at the ends', () => {
    expect(mixColorStrings('red', 'blue', 0)).toBe('red');
    expect(mixColorStrings('red', 'blue', 1)).toBe('blue');
  });

  // A series with color: 'red' vanishes mid-switch, because both ends parse
  // as transparent and the mix is rgba(0,0,0,0).
  it.fails('keeps a named color visible while a theme switch is running', () => {
    expect(mixColorStrings('red', 'red', 0.5)).not.toBe('rgba(0,0,0,0)');
  });
});

describe('withAlpha', () => {
  it('scales the existing alpha', () => {
    expect(withAlpha('rgba(10,20,30,0.5)', 0.5)).toBe('rgba(10,20,30,0.25)');
  });
  it('passes opaque colors through untouched', () => {
    expect(withAlpha('#fff', 1)).toBe('#fff');
  });
});
