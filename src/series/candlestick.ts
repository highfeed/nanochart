import { stepPixels } from '../core/geometry.js';
import type { DrawContext, SeriesRenderer, SeriesState } from '../core/types.js';
import type { Scale } from '../core/scale.js';

const MIN_BODY = 1;

/** Candles are unreadable in the range selector, so it gets a close line. */
function drawCloseLine(ctx: DrawContext, series: SeriesState, i0: number, i1: number, y: Scale): void {
  const c = ctx.r.ctx;
  const stride = Math.max(1, Math.floor((i1 - i0) / Math.max(1, ctx.box.w)));
  c.save();
  c.globalAlpha = ctx.alphaOf(series);
  c.strokeStyle = series.options.upColor ?? ctx.color('positive');
  c.lineWidth = 1;
  c.lineJoin = 'round';
  c.beginPath();
  for (let i = i0; i <= i1; i += stride) {
    const point = series.points[i];
    const px = ctx.x.map(point.x);
    const py = y.map(point.close ?? point.y);
    if (i === i0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.stroke();
  c.restore();
}

/** OHLC candles. Rising and falling candles are batched into two paths. */
export const candlestick: SeriesRenderer = {
  type: 'candlestick',

  extent(series, i0, i1) {
    let min = Infinity;
    let max = -Infinity;
    for (let i = i0; i <= i1; i++) {
      const point = series.points[i];
      const low = point.low ?? point.y;
      const high = point.high ?? point.y;
      if (low < min) min = low;
      if (high > max) max = high;
    }
    return Number.isFinite(min) ? [min, max] : null;
  },

  draw(ctx, series) {
    const [i0, i1] = ctx.chart.windowIndices(series, ctx.x.d0, ctx.x.d1);
    if (i1 < i0) return;

    const y = ctx.scaleFor(series.axis);
    if (ctx.preview) {
      drawCloseLine(ctx, series, i0, i1, y);
      return;
    }
    const width = Math.max(1, stepPixels(ctx, series) * (series.options.barWidth ?? 0.62));
    const wick = width > 4 ? 1 : 0.5;
    const up = new Path2D();
    const down = new Path2D();

    for (let i = i0; i <= i1; i++) {
      const point = series.points[i];
      const open = point.open ?? point.y;
      const close = point.close ?? point.y;
      const center = ctx.x.map(point.x);
      const path = close >= open ? up : down;

      const top = y.map(Math.max(open, close));
      const bottom = y.map(Math.min(open, close));
      const left = Math.round(center - width / 2);
      const right = Math.max(left + MIN_BODY, Math.round(center + width / 2));
      path.rect(left, top, right - left, Math.max(MIN_BODY, bottom - top));

      const high = y.map(point.high ?? Math.max(open, close));
      const low = y.map(point.low ?? Math.min(open, close));
      path.rect(Math.round(center) - wick / 2, high, wick, Math.max(MIN_BODY, low - high));
    }

    const c = ctx.r.ctx;
    c.save();
    c.globalAlpha = ctx.alphaOf(series);
    c.fillStyle = series.options.upColor ?? ctx.color('positive');
    c.fill(up);
    c.fillStyle = series.options.downColor ?? ctx.color('negative');
    c.fill(down);
    c.restore();
  },
};
