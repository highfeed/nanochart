import { withAlpha } from '../core/color.js';
import type { SeriesRenderer } from '../core/types.js';

/** Dots at every point, useful for correlations and distributions. */
export const scatter: SeriesRenderer = {
  type: 'scatter',

  draw(ctx, series) {
    const [i0, i1] = ctx.chart.windowIndices(series, ctx.x.d0, ctx.x.d1);
    if (i1 < i0) return;

    const y = ctx.scaleFor(series.axis);
    const radius = series.options.radius ?? (ctx.preview ? 1 : 3);
    const xs = series.data.x;
    const ys = series.data.y;
    const dots = new Path2D();

    // Dots landing on the same pixel are indistinguishable once drawn, so a
    // dense series only pays for the pixels it actually covers.
    const step = Math.max(1, radius);
    const seen = i1 - i0 > ctx.box.w ? new Set<number>() : null;

    for (let i = i0; i <= i1; i++) {
      const value = ys[i];
      if (!Number.isFinite(value)) continue;
      const px = ctx.x.map(xs[i]);
      const py = y.map(value);

      if (seen) {
        const key = Math.round(px / step) * 65536 + Math.round(py / step);
        if (seen.has(key)) continue;
        seen.add(key);
      }
      dots.moveTo(px + radius, py);
      dots.arc(px, py, radius, 0, Math.PI * 2);
    }

    const c = ctx.r.ctx;
    c.save();
    c.globalAlpha = ctx.alphaOf(series);
    c.fillStyle = withAlpha(ctx.colorOf(series), series.options.fillOpacity ?? 0.65);
    c.fill(dots);
    c.restore();
  },
};
