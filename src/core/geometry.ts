import type { DrawContext, SeriesState } from './types.js';

/**
 * Smallest gap between two x values, converted to pixels.
 *
 * Cached on the series data, because it depends only on the samples and this
 * runs for every bar and candle series on every frame.
 */
const cache = new WeakMap<object, number>();

export function stepPixels(ctx: DrawContext, series: SeriesState): number {
  const data = series.data;
  if (data.length < 2) return ctx.box.w / 2;

  let min = cache.get(data);
  if (min === undefined) {
    min = Infinity;
    const x = data.x;
    for (let i = 1; i < data.length; i++) {
      const delta = x[i] - x[i - 1];
      if (delta > 0 && delta < min) min = delta;
    }
    cache.set(data, min);
  }
  if (!Number.isFinite(min)) return ctx.box.w / 2;
  return Math.max(1, min * (ctx.x.map(1) - ctx.x.map(0)));
}
