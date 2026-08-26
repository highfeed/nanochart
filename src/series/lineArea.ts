import { withAlpha } from '../core/color.js';
import type { Renderer } from '../core/renderer.js';
import type { Curve, DrawContext, SeriesRenderer, SeriesState } from '../core/types.js';
import { clamp } from '../core/utils.js';

type ValueAt = (index: number) => number;

/**
 * Samples the visible window into a flat `[x0, y0, x1, y1, ...]` buffer,
 * skipping points that would land on the same pixel column.
 */
function samplePath(ctx: DrawContext, series: SeriesState, valueAt: ValueAt): number[] {
  const [i0, i1] = ctx.chart.windowIndices(series, ctx.x.d0, ctx.x.d1);
  const out: number[] = [];
  if (i1 < i0) return out;
  const y = ctx.scaleFor(series.axis);
  const stride = Math.max(1, Math.floor((i1 - i0) / Math.max(1, ctx.box.w * 2)));
  let i = i0;
  for (; i <= i1; i += stride) out.push(ctx.x.map(series.points[i].x), y.map(valueAt(i)));
  if (i - stride !== i1) out.push(ctx.x.map(series.points[i1].x), y.map(valueAt(i1)));
  return out;
}

function tracePath(r: Renderer, points: readonly number[], curve: Curve, reverse = false): void {
  const ctx = r.ctx;
  const n = points.length;
  if (n < 2) return;
  if (reverse) {
    for (let i = n - 2; i >= 0; i -= 2) ctx.lineTo(points[i], points[i + 1]);
    return;
  }
  ctx.moveTo(points[0], points[1]);
  if (curve === 'step') {
    for (let i = 2; i < n; i += 2) {
      ctx.lineTo(points[i], points[i - 1]);
      ctx.lineTo(points[i], points[i + 1]);
    }
    return;
  }
  if (curve === 'smooth') {
    for (let i = 0; i + 3 < n; i += 2) {
      const x0 = i > 0 ? points[i - 2] : points[i];
      const y0 = i > 0 ? points[i - 1] : points[i + 1];
      const x1 = points[i];
      const y1 = points[i + 1];
      const x2 = points[i + 2];
      const y2 = points[i + 3];
      const x3 = i + 5 < n ? points[i + 4] : x2;
      const y3 = i + 5 < n ? points[i + 5] : y2;
      ctx.bezierCurveTo(
        x1 + (x2 - x0) / 6,
        y1 + (y2 - y0) / 6,
        x2 - (x3 - x1) / 6,
        y2 - (y3 - y1) / 6,
        x2,
        y2,
      );
    }
    return;
  }
  for (let i = 2; i < n; i += 2) ctx.lineTo(points[i], points[i + 1]);
}

function topValue(ctx: DrawContext, series: SeriesState): ValueAt {
  const stack = ctx.stacks.get(series.id);
  return stack ? (i) => stack.top[i] : (i) => series.points[i].y;
}

export const line: SeriesRenderer = {
  type: 'line',
  draw(ctx, series) {
    const points = samplePath(ctx, series, topValue(ctx, series));
    if (points.length < 4) return;
    const c = ctx.r.ctx;
    c.save();
    c.globalAlpha = ctx.alphaOf(series);
    c.strokeStyle = ctx.colorOf(series);
    c.lineWidth = series.options.lineWidth ?? (ctx.preview ? 1 : 2);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    if (series.options.dash) c.setLineDash(series.options.dash as number[]);
    c.beginPath();
    tracePath(ctx.r, points, series.options.curve ?? 'linear');
    c.stroke();
    c.restore();
  },
};

export const area: SeriesRenderer = {
  type: 'area',
  baseline: true,
  draw(ctx, series) {
    const stack = ctx.stacks.get(series.id);
    const top = samplePath(ctx, series, topValue(ctx, series));
    if (top.length < 4) return;

    const y = ctx.scaleFor(series.axis);
    const curve = series.options.curve ?? 'linear';
    const c = ctx.r.ctx;
    const color = ctx.colorOf(series);
    const alpha = ctx.alphaOf(series);

    c.save();
    // Stacked areas already shrink through the stack layout, so they stay opaque.
    c.globalAlpha = stack ? Math.min(1, alpha * 4) : alpha;
    c.beginPath();
    tracePath(ctx.r, top, curve);
    if (stack) {
      const base = samplePath(ctx, series, (i) => stack.base[i]);
      tracePath(ctx.r, base, curve, true);
    } else {
      const zero = y.map(clamp(0, y.d0, y.d1));
      c.lineTo(top[top.length - 2], zero);
      c.lineTo(top[0], zero);
    }
    c.closePath();
    c.fillStyle = withAlpha(color, series.options.fillOpacity ?? (stack ? 1 : 0.18));
    c.fill();

    if (!stack) {
      c.beginPath();
      tracePath(ctx.r, top, curve);
      c.strokeStyle = color;
      c.lineWidth = series.options.lineWidth ?? (ctx.preview ? 1 : 2);
      c.lineJoin = 'round';
      c.lineCap = 'round';
      c.stroke();
    }
    c.restore();
  },
};
