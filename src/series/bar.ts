import { stepPixels } from '../core/geometry.js';
import type { DrawContext, SeriesRenderer, SeriesState } from '../core/types.js';
import { clamp } from '../core/utils.js';

interface BarMetrics {
  width: number;
  offset: number;
}

/** Stacked series share a slot; independent bar series sit side by side. */
function barMetrics(ctx: DrawContext, series: SeriesState): BarMetrics {
  const slots: string[] = [];
  for (const other of ctx.chart.series) {
    if (other.type !== 'bar' || !other.visible) continue;
    const key = other.options.stack ?? other.id;
    if (!slots.includes(key)) slots.push(key);
  }
  const key = series.options.stack ?? series.id;
  const slot = Math.max(0, slots.indexOf(key));
  const count = Math.max(1, slots.length);
  const total = stepPixels(ctx, series) * (series.options.barWidth ?? 0.72);
  const width = total / count;
  return { width, offset: -total / 2 + slot * width };
}

export const bar: SeriesRenderer = {
  type: 'bar',
  baseline: true,
  draw(ctx, series) {
    const [i0, i1] = ctx.chart.windowIndices(series, ctx.x.d0, ctx.x.d1);
    if (i1 < i0) return;

    const stack = ctx.stacks.get(series.id);
    const y = ctx.scaleFor(series.axis);
    const metrics = barMetrics(ctx, series);
    const zero = y.map(clamp(0, y.d0, y.d1));
    const c = ctx.r.ctx;

    c.save();
    // Stacked bars collapse through their height, so opacity stays at one.
    c.globalAlpha = stack ? Math.min(1, ctx.alphaOf(series) * 4) : ctx.alphaOf(series);
    c.fillStyle = ctx.colorOf(series);
    c.beginPath();
    for (let i = i0; i <= i1; i++) {
      const center = ctx.x.map(series.points[i].x);
      const left = Math.round(center + metrics.offset);
      const right = Math.round(center + metrics.offset + metrics.width);
      const top = y.map(stack ? stack.top[i] : series.points[i].y);
      const bottom = stack ? y.map(stack.base[i]) : zero;
      const height = bottom - top;
      if (Math.abs(height) < 0.35) continue;
      c.rect(left, Math.min(top, bottom), Math.max(1, right - left), Math.abs(height));
    }
    c.fill();
    c.restore();
  },
};
