import { minStep, stepPixels } from '../core/geometry.js';
import type { DrawContext, SeriesRenderer, SeriesState } from '../core/types.js';
import { clamp } from '../core/utils.js';

interface BarMetrics {
  width: number;
  offset: number;
}

/** Fraction of the x step a bar fills when the caller says nothing. */
const DEFAULT_WIDTH = 0.72;

/**
 * Stacked series share a slot; independent bar series sit side by side.
 *
 * A slot is as wide as its series is opaque. Splitting by `visible` had the
 * neighbours of a toggled series jump to their new width the moment it was
 * switched, while it was still fading; weighted by alpha, its slot closes as
 * it fades and the others widen with it, and a series switched on opens its
 * slot the same way.
 */
function barMetrics(ctx: DrawContext, series: SeriesState): BarMetrics {
  const keys: string[] = [];
  const weights: number[] = [];
  for (const other of ctx.chart.series) {
    if (other.type !== 'bar') continue;
    const key = other.options.stack ?? other.id;
    const alpha = ctx.alphaOf(other);
    const at = keys.indexOf(key);
    if (at < 0) {
      keys.push(key);
      weights.push(alpha);
    } else if (alpha > weights[at]) weights[at] = alpha;
  }
  const slot = keys.indexOf(series.options.stack ?? series.id);
  const total = stepPixels(ctx, series) * (series.options.barWidth ?? DEFAULT_WIDTH);
  let before = 0;
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += weights[i];
    if (i < slot) before += weights[i];
  }
  if (slot < 0 || sum <= 0) return { width: total, offset: -total / 2 };
  return { width: (total * weights[slot]) / sum, offset: -total / 2 + (total * before) / sum };
}

export const bar: SeriesRenderer = {
  type: 'bar',
  slot: (series) => minStep(series.data) * (series.options.barWidth ?? DEFAULT_WIDTH),
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
