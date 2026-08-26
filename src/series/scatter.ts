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
    const dots = new Path2D();
    for (let i = i0; i <= i1; i++) {
      const point = series.points[i];
      dots.moveTo(ctx.x.map(point.x) + radius, y.map(point.y));
      dots.arc(ctx.x.map(point.x), y.map(point.y), radius, 0, Math.PI * 2);
    }

    const c = ctx.r.ctx;
    c.save();
    c.globalAlpha = ctx.alphaOf(series);
    c.fillStyle = withAlpha(ctx.colorOf(series), series.options.fillOpacity ?? 0.65);
    c.fill(dots);
    c.restore();
  },
};
