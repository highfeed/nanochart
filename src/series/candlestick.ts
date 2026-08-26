import { stepPixels } from '../core/geometry.js';
import type { DrawContext, SeriesRenderer, SeriesState } from '../core/types.js';
import type { Scale } from '../core/scale.js';

const MIN_BODY = 1;

/** Candles are unreadable in the range selector, so it gets a close line. */
function drawCloseLine(ctx: DrawContext, series: SeriesState, i0: number, i1: number, y: Scale): void {
  const c = ctx.r.ctx;
  const data = series.data;
  const closes = data.close ?? data.y;
  const stride = Math.max(1, Math.floor((i1 - i0) / Math.max(1, ctx.box.w)));
  c.save();
  c.globalAlpha = ctx.alphaOf(series);
  c.strokeStyle = series.options.upColor ?? ctx.color('positive');
  c.lineWidth = 1;
  c.lineJoin = 'round';
  c.beginPath();
  let started = false;
  for (let i = i0; i <= i1; i += stride) {
    const value = closes[i];
    if (!Number.isFinite(value)) {
      started = false;
      continue;
    }
    const px = ctx.x.map(data.x[i]);
    const py = y.map(value);
    if (started) c.lineTo(px, py);
    else c.moveTo(px, py);
    started = true;
  }
  c.stroke();
  c.restore();
}

/** OHLC candles. Rising and falling candles are batched into two paths. */
export const candlestick: SeriesRenderer = {
  type: 'candlestick',

  extent(series, i0, i1) {
    const data = series.data;
    const lows = data.low ?? data.y;
    const highs = data.high ?? data.y;
    let min = Infinity;
    let max = -Infinity;
    for (let i = i0; i <= i1; i++) {
      if (lows[i] < min) min = lows[i];
      if (highs[i] > max) max = highs[i];
    }
    return Number.isFinite(min) && Number.isFinite(max) ? [min, max] : null;
  },

  draw(ctx, series) {
    const [i0, i1] = ctx.chart.windowIndices(series, ctx.x.d0, ctx.x.d1);
    if (i1 < i0) return;

    const y = ctx.scaleFor(series.axis);
    if (ctx.preview) {
      drawCloseLine(ctx, series, i0, i1, y);
      return;
    }

    const data = series.data;
    const opens = data.open ?? data.y;
    const closes = data.close ?? data.y;
    const highs = data.high ?? data.y;
    const lows = data.low ?? data.y;

    const width = Math.max(1, stepPixels(ctx, series) * (series.options.barWidth ?? 0.62));
    const wick = width > 4 ? 1 : 0.5;
    const up = new Path2D();
    const down = new Path2D();

    // Under about two pixels a candle has no readable body, so each pixel
    // column becomes one aggregate candle: first open, last close, and the
    // extremes of everything in between.
    const merged = width < 2;
    let px = -1;
    let open = Number.NaN;
    let close = Number.NaN;
    let high = -Infinity;
    let low = Infinity;

    const emit = (): void => {
      if (px < 0 || !Number.isFinite(open) || !Number.isFinite(close)) return;
      const path = close >= open ? up : down;
      const bodyTop = y.map(Math.max(open, close));
      const bodyBottom = y.map(Math.min(open, close));
      path.rect(px, bodyTop, MIN_BODY, Math.max(MIN_BODY, bodyBottom - bodyTop));
      const top = y.map(high);
      const bottom = y.map(low);
      path.rect(px, top, wick, Math.max(MIN_BODY, bottom - top));
    };

    for (let i = i0; i <= i1; i++) {
      if (!Number.isFinite(closes[i])) continue;

      if (merged) {
        const column = Math.round(ctx.x.map(data.x[i]));
        if (column !== px) {
          emit();
          px = column;
          open = opens[i];
          high = -Infinity;
          low = Infinity;
        }
        close = closes[i];
        if (highs[i] > high) high = highs[i];
        if (lows[i] < low) low = lows[i];
        continue;
      }

      const center = ctx.x.map(data.x[i]);
      const path = closes[i] >= opens[i] ? up : down;

      const bodyTop = y.map(Math.max(opens[i], closes[i]));
      const bodyBottom = y.map(Math.min(opens[i], closes[i]));
      const left = Math.round(center - width / 2);
      const right = Math.max(left + MIN_BODY, Math.round(center + width / 2));
      path.rect(left, bodyTop, right - left, Math.max(MIN_BODY, bodyBottom - bodyTop));

      const top = y.map(highs[i]);
      const bottom = y.map(lows[i]);
      path.rect(Math.round(center) - wick / 2, top, wick, Math.max(MIN_BODY, bottom - top));
    }
    if (merged) emit();

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
