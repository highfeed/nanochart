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
    const column = series.data.y;
    const xs = series.data.x;
    const c = ctx.r.ctx;

    c.save();
    // Stacked bars collapse through their height, so opacity stays at one.
    c.globalAlpha = stack ? Math.min(1, ctx.alphaOf(series) * 4) : ctx.alphaOf(series);
    c.fillStyle = ctx.colorOf(series);
    c.beginPath();

    // Below about a pixel and a half per bar, individual rects are
    // indistinguishable and merely expensive; collapse each pixel column into
    // the envelope of the bars that land in it.
    const merged = metrics.width < 1.5;
    let pending = -1;
    let top = Infinity;
    let bottom = -Infinity;

    const flushColumn = (): void => {
      if (pending < 0 || bottom - top < 0.35) return;
      c.rect(pending, top, 1, bottom - top);
    };

    for (let i = i0; i <= i1; i++) {
      const value = column[i];
      if (!Number.isFinite(value)) continue;

      const center = ctx.x.map(xs[i]);
      const high = y.map(stack ? stack.top[i] : value);
      const low = stack ? y.map(stack.base[i]) : zero;

      if (merged) {
        const px = Math.round(center);
        if (px !== pending) {
          flushColumn();
          pending = px;
          top = Infinity;
          bottom = -Infinity;
        }
        top = Math.min(top, high, low);
        bottom = Math.max(bottom, high, low);
        continue;
      }

      const left = Math.round(center + metrics.offset);
      const right = Math.round(center + metrics.offset + metrics.width);
      const height = low - high;
      if (Math.abs(height) < 0.35) continue;
      c.rect(left, Math.min(high, low), Math.max(1, right - left), Math.abs(height));
    }
    if (merged) flushColumn();

    c.fill();
    c.restore();
  },
};
