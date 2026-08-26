import { beforeAll, describe, expect, it } from 'vitest';
import { parseColor } from '../src/core/color.js';

/**
 * How a real canvas answers, checked against Chrome.
 *
 * A colour with an sRGB spelling is handed back as hex; one without — the
 * wide-gamut and perceptual spaces — is handed back verbatim, which is the
 * shape that used to send `parse` and `viaCanvas` calling each other until the
 * stack ran out. Anything the host cannot read leaves `fillStyle` untouched.
 */
const SERIALIZED: Record<string, string> = {
  '#000000': '#000000',
  '#ffffff': '#ffffff',
  rebeccapurple: '#663399',
  'hwb(90 10% 10%)': '#80e61a',
  'oklch(0.7 0.1 200)': 'oklch(0.7 0.1 200)',
  'lab(50 40 30)': 'lab(50 40 30)',
  'color(display-p3 1 0 0)': 'color(display-p3 1 0 0)',
  'color-mix(in srgb, red, blue)': 'color(srgb 0.5 0 0.5)',
};

/** What each of those paints, once clamped into the canvas's own sRGB. */
const PIXELS: Record<string, readonly number[]> = {
  'oklch(0.7 0.1 200)': [64, 180, 195, 255],
  'lab(50 40 30)': [175, 84, 72, 255],
  'color(display-p3 1 0 0)': [255, 0, 0, 255],
  'color(srgb 0.5 0 0.5)': [128, 0, 128, 255],
};

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value() {
      let fill = '#000000';
      return {
        globalCompositeOperation: 'source-over',
        set fillStyle(next: string) {
          const resolved = SERIALIZED[next];
          // An unreadable value is ignored, exactly as a real canvas ignores it.
          if (resolved !== undefined) fill = resolved;
        },
        get fillStyle() {
          return fill;
        },
        fillRect() {},
        getImageData: () => ({ data: PIXELS[fill] ?? [0, 0, 0, 0] }),
      };
    },
  });
});

describe('colors the fast path cannot read', () => {
  it('resolves a wide-gamut color instead of recursing until the stack gives out', () => {
    expect(parseColor('color(display-p3 1 0 0)')).toEqual([255, 0, 0, 1]);
  });

  it('resolves the perceptual spaces the same way', () => {
    expect(parseColor('oklch(0.7 0.1 200)')).toEqual([64, 180, 195, 1]);
    expect(parseColor('lab(50 40 30)')).toEqual([175, 84, 72, 1]);
  });

  it('follows a color-mix() through the color() it resolves to', () => {
    expect(parseColor('color-mix(in srgb, red, blue)')).toEqual([128, 0, 128, 1]);
  });

  it('still takes the string round trip when the host offers an sRGB spelling', () => {
    // No pixel is read for these: the canvas already answered in hex.
    expect(parseColor('rebeccapurple')).toEqual([102, 51, 153, 1]);
    expect(parseColor('hwb(90 10% 10%)')).toEqual([128, 230, 26, 1]);
  });

  it('treats a color the host rejects as transparent', () => {
    expect(parseColor('not-a-color(1 2 3)')).toEqual([0, 0, 0, 0]);
  });
});
