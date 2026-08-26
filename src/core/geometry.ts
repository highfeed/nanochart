import type { DrawContext, SeriesState } from './types.js';

/** Smallest gap between two x values, converted to pixels. */
export function stepPixels(ctx: DrawContext, series: SeriesState): number {
  const points = series.points;
  if (points.length < 2) return ctx.box.w / 2;
  let min = Infinity;
  for (let i = 1; i < points.length; i++) {
    const delta = points[i].x - points[i - 1].x;
    if (delta > 0 && delta < min) min = delta;
  }
  if (!Number.isFinite(min)) return ctx.box.w / 2;
  return Math.max(1, min * (ctx.x.map(1) - ctx.x.map(0)));
}
