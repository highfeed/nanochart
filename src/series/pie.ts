import type { DrawContext, SeriesRenderer, SeriesState } from '../core/types.js';

const START_ANGLE = -Math.PI / 2;
const HOVER_SHIFT = 8;

interface Slice {
  start: number;
  end: number;
  share: number;
}

function seriesTotal(series: SeriesState): number {
  const column = series.data.y;
  let sum = 0;
  for (let i = 0; i < series.data.length; i++) {
    if (Number.isFinite(column[i])) sum += column[i];
  }
  return sum;
}

function sliceOf(ctx: DrawContext, series: SeriesState): Slice | null {
  let total = 0;
  let before = 0;
  let own = 0;
  for (const other of ctx.chart.series) {
    if (other.type !== 'pie') continue;
    const value = seriesTotal(other) * ctx.alphaOf(other);
    if (other === series) {
      own = value;
      before = total;
    }
    total += value;
  }
  if (total <= 0 || own <= 0) return null;
  const start = START_ANGLE + (before / total) * Math.PI * 2;
  const end = start + (own / total) * Math.PI * 2;
  return { start, end, share: own / total };
}

function geometry(ctx: DrawContext): { cx: number; cy: number; radius: number } {
  const inset = ctx.preview ? 2 : HOVER_SHIFT + 4;
  return {
    cx: ctx.box.x + ctx.box.w / 2,
    cy: ctx.box.y + ctx.box.h / 2,
    radius: Math.max(1, Math.min(ctx.box.w, ctx.box.h) / 2 - inset),
  };
}

export const pie: SeriesRenderer = {
  type: 'pie',
  cartesian: false,
  draw(ctx, series) {
    const slice = sliceOf(ctx, series);
    if (!slice) return;

    const { cx, cy, radius } = geometry(ctx);
    const inner = (series.options.innerRadius ?? 0) * radius;
    const mid = (slice.start + slice.end) / 2;
    const hovered = !ctx.preview && ctx.chart.hoverSeriesId === series.id;
    const ox = hovered ? Math.cos(mid) * HOVER_SHIFT : 0;
    const oy = hovered ? Math.sin(mid) * HOVER_SHIFT : 0;
    const c = ctx.r.ctx;

    c.save();
    c.beginPath();
    c.arc(cx + ox, cy + oy, radius, slice.start, slice.end);
    if (inner > 0) c.arc(cx + ox, cy + oy, inner, slice.end, slice.start, true);
    else c.lineTo(cx + ox, cy + oy);
    c.closePath();
    c.fillStyle = ctx.colorOf(series);
    c.fill();

    if (!ctx.preview && slice.end - slice.start > 0.22) {
      const labelRadius = inner > 0 ? (radius + inner) / 2 : radius * 0.68;
      const size = Math.max(11, Math.min(20, radius * 0.16 + slice.share * 26));
      ctx.r.text(`${Math.round(slice.share * 100)}%`, cx + ox + Math.cos(mid) * labelRadius, cy + oy + Math.sin(mid) * labelRadius, {
        font: ctx.font(size, 600),
        color: '#ffffff',
        align: 'center',
        baseline: 'middle',
      });
    }
    c.restore();
  },

  hit(ctx, series, px, py) {
    const slice = sliceOf(ctx, series);
    if (!slice) return false;
    const { cx, cy, radius } = geometry(ctx);
    const dx = px - cx;
    const dy = py - cy;
    const distance = Math.hypot(dx, dy);
    const inner = (series.options.innerRadius ?? 0) * radius;
    if (distance > radius || distance < inner) return false;
    let angle = Math.atan2(dy, dx);
    while (angle < slice.start) angle += Math.PI * 2;
    return angle <= slice.end;
  },
};
