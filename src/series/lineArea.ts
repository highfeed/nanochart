import { withAlpha } from '../core/color.js';
import type { Renderer } from '../core/renderer.js';
import type { Curve, DrawContext, SeriesRenderer, SeriesState } from '../core/types.js';
import { clamp } from '../core/utils.js';

type ValueAt = (index: number) => number;

/**
 * Picks the indices to draw for the visible window.
 *
 * Above roughly two samples per pixel the series is decimated, but not by
 * skipping every Nth sample: each pixel column contributes its first, last,
 * lowest and highest sample. That keeps the silhouette — a one-sample spike
 * between two neighbours survives, where a fixed stride would drop it and
 * quietly redraw the series as something it is not.
 */
function sampleIndices(ctx: DrawContext, series: SeriesState, valueAt: ValueAt): number[] {
  const [i0, i1] = ctx.chart.windowIndices(series, ctx.x.d0, ctx.x.d1);
  const out: number[] = [];
  if (i1 < i0) return out;

  const span = i1 - i0 + 1;
  const columns = Math.max(1, Math.ceil(ctx.box.w));
  if (span <= columns * 2) {
    for (let i = i0; i <= i1; i++) out.push(i);
    return out;
  }

  const x = series.data.x;
  // The x scale is affine, so the pixel column is a multiply-add rather than a
  // call per sample; this loop reads every sample in the window.
  const scale = ctx.x;
  const k = (scale.r1 - scale.r0) / ((scale.d1 - scale.d0) || 1);
  const toColumn = (value: number): number => Math.round(scale.r0 + (value - scale.d0) * k);

  let column = toColumn(x[i0]);
  let first = i0;
  let last = i0;
  let lowest = i0;
  let highest = i0;
  let lowValue = valueAt(i0);
  let highValue = lowValue;

  const flush = (): void => {
    // Emit in index order so the path keeps moving left to right.
    const a = lowest < highest ? lowest : highest;
    const b = lowest < highest ? highest : lowest;
    out.push(first);
    if (a !== first) out.push(a);
    if (b !== a && b !== first) out.push(b);
    if (last !== b && last !== a && last !== first) out.push(last);
  };

  for (let i = i0 + 1; i <= i1; i++) {
    const next = toColumn(x[i]);
    if (next !== column) {
      flush();
      column = next;
      first = last = lowest = highest = i;
      lowValue = highValue = valueAt(i);
      continue;
    }
    const v = valueAt(i);
    // NaN compares false both ways, so gaps never win an extreme.
    if (v < lowValue) {
      lowValue = v;
      lowest = i;
    }
    if (v > highValue) {
      highValue = v;
      highest = i;
    }
    last = i;
  }
  flush();
  return out;
}

/** Splits indices into runs of consecutive drawable samples, breaking at gaps. */
function runs(indices: number[], valueAt: ValueAt, gaps: boolean): number[][] {
  // Nothing to split when the series has no gaps, which is the common case.
  if (!gaps) return [indices];
  const out: number[][] = [];
  let current: number[] = [];
  for (const i of indices) {
    if (Number.isFinite(valueAt(i))) {
      current.push(i);
    } else if (current.length) {
      out.push(current);
      current = [];
    }
  }
  if (current.length) out.push(current);
  return out;
}

/** Maps indices to a flat `[x0, y0, x1, y1, ...]` buffer. */
function project(ctx: DrawContext, series: SeriesState, run: readonly number[], valueAt: ValueAt): number[] {
  const y = ctx.scaleFor(series.axis);
  const x = series.data.x;
  const out: number[] = new Array(run.length * 2);
  for (let k = 0; k < run.length; k++) {
    out[k * 2] = ctx.x.map(x[run[k]]);
    out[k * 2 + 1] = y.map(valueAt(run[k]));
  }
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
  if (!stack) {
    const column = series.data.y;
    return (i) => column[i];
  }
  // A gap in a stacked series must stay a gap, even though the stack layout
  // filled its slot with the running baseline.
  const column = series.data.y;
  return (i) => (Number.isFinite(column[i]) ? stack.top[i] : Number.NaN);
}

export const line: SeriesRenderer = {
  type: 'line',
  draw(ctx, series) {
    const valueAt = topValue(ctx, series);
    const indices = sampleIndices(ctx, series, valueAt);
    if (indices.length === 0) return;

    const c = ctx.r.ctx;
    c.save();
    c.globalAlpha = ctx.alphaOf(series);
    c.strokeStyle = ctx.colorOf(series);
    c.lineWidth = series.options.lineWidth ?? (ctx.preview ? 1 : 2);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    if (series.options.dash) c.setLineDash(series.options.dash as number[]);
    const curve = series.options.curve ?? 'linear';

    c.beginPath();
    for (const run of runs(indices, valueAt, series.data.gaps)) {
      tracePath(ctx.r, project(ctx, series, run, valueAt), curve);
    }
    c.stroke();
    c.restore();
  },
};

export const area: SeriesRenderer = {
  type: 'area',
  baseline: true,
  draw(ctx, series) {
    const stack = ctx.stacks.get(series.id);
    const valueAt = topValue(ctx, series);
    const indices = sampleIndices(ctx, series, valueAt);
    if (indices.length === 0) return;

    const y = ctx.scaleFor(series.axis);
    const curve = series.options.curve ?? 'linear';
    const c = ctx.r.ctx;
    const color = ctx.colorOf(series);
    const alpha = ctx.alphaOf(series);
    const parts = runs(indices, valueAt, series.data.gaps);

    c.save();
    // Stacked areas already shrink through the stack layout, so they stay opaque.
    c.globalAlpha = stack ? Math.min(1, alpha * 4) : alpha;
    c.beginPath();
    for (const run of parts) {
      const top = project(ctx, series, run, valueAt);
      if (top.length < 4) continue;
      tracePath(ctx.r, top, curve);
      if (stack) {
        tracePath(ctx.r, project(ctx, series, run, (i) => stack.base[i]), curve, true);
      } else {
        const zero = y.map(clamp(0, y.d0, y.d1));
        c.lineTo(top[top.length - 2], zero);
        c.lineTo(top[0], zero);
      }
      c.closePath();
    }
    c.fillStyle = withAlpha(color, series.options.fillOpacity ?? (stack ? 1 : 0.18));
    c.fill();

    if (!stack) {
      c.beginPath();
      for (const run of parts) tracePath(ctx.r, project(ctx, series, run, valueAt), curve);
      c.strokeStyle = color;
      c.lineWidth = series.options.lineWidth ?? (ctx.preview ? 1 : 2);
      c.lineJoin = 'round';
      c.lineCap = 'round';
      c.stroke();
    }
    c.restore();
  },
};
