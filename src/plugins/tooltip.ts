import { withAlpha } from '../core/color.js';
import { nearestIndex } from '../core/data.js';
import type { DrawContext, Plugin, SeriesState } from '../core/types.js';
import { formatDate, formatGrouped } from '../core/utils.js';

export interface TooltipOptions {
  /** Card heading; receives the x value and the point index. */
  title?: (x: number, index: number) => string;
  format?: (value: number, series: SeriesState, index: number) => string;
  /** Muted prefix in front of the series name; defaults to the stack share. */
  note?: (value: number, series: SeriesState, index: number) => string;
  /** Adds a summary row with the sum of all visible series. */
  total?: boolean;
  totalLabel?: string;
  crosshair?: boolean;
  points?: boolean;
}

interface Row {
  label: string;
  value: string;
  note: string;
  color: string;
}

const PADDING = 11;
const ROW_HEIGHT = 20;
const TITLE_HEIGHT = 20;
const RADIUS = 9;
const GAP = 26;

export function tooltip(options: TooltipOptions = {}): Plugin {
  const showCrosshair = options.crosshair ?? true;
  const showPoints = options.points ?? true;

  return {
    name: 'nano:tooltip',

    drawOver(ctx) {
      const chart = ctx.chart;
      if (chart.hoverSeriesId) {
        drawSliceCard(ctx, chart.hoverSeriesId, options);
        return;
      }
      const index = chart.hoverIndex;
      const reference = chart.referenceSeries();
      if (index < 0 || !reference || index >= reference.data.length) return;

      const box = ctx.box;
      const px = ctx.x.map(reference.data.x[index]);
      if (px < box.x - 1 || px > box.x + box.w + 1) return;

      const hasBars = chart.series.some((s) => s.type === 'bar' && s.visible);
      if (hasBars) dimAround(ctx, reference, index, px);
      else if (showCrosshair) ctx.r.vline(px, box.y, box.y + box.h, ctx.color('crosshair'));

      const refX = reference.data.x[index];
      const previous = reference.data.x[Math.max(index - 1, 0)];
      const next = reference.data.x[Math.min(index + 1, reference.data.length - 1)];
      const tolerance = Math.max((next - previous) / 2, Number.EPSILON);

      const rows: Row[] = [];
      let total = 0;
      for (const series of chart.series) {
        if (!series.visible || series.type === 'pie' || series.data.length === 0) continue;
        // Series may sit on their own x grid, so match by value instead of index.
        const i = series === reference ? index : nearestIndex(series.data, refX);
        if (Math.abs(series.data.x[i] - refX) > tolerance) continue;
        const raw = series.data.y[i];
        // A gap has no value to report, so the series drops out of the card.
        if (!Number.isFinite(raw)) continue;
        total += raw;
        const stack = ctx.stacks.get(series.id);
        const share = stack && series.options.normalize ? `${Math.round(stack.top[i] - stack.base[i])}%` : '';
        rows.push({
          label: series.name,
          value: options.format ? options.format(raw, series, i) : formatGrouped(raw),
          note: options.note ? options.note(raw, series, i) : share,
          color: ctx.colorOf(series),
        });

        if (showPoints && !hasBars && series.type !== 'bar' && series.type !== 'candlestick') {
          const y = ctx.scaleFor(series.axis).map(stack ? stack.top[i] : raw);
          if (y >= box.y - 4 && y <= box.y + box.h + 4) {
            ctx.r.circle(ctx.x.map(series.data.x[i]), y, 4, ctx.color('background'), ctx.colorOf(series), 2.5);
          }
        }
      }
      if (rows.length === 0) return;
      if (options.total) {
        rows.push({
          label: options.totalLabel ?? 'All',
          value: formatGrouped(total),
          note: '',
          color: ctx.color('tooltipText'),
        });
      }

      const titleX = reference.data.x[index];
      const title = options.title
        ? options.title(titleX, index)
        : chart.xAxis.type === 'time'
          ? formatDate(titleX)
          : formatGrouped(titleX);

      drawCard(ctx, title, rows, px);
    },
  };
}

function dimAround(ctx: DrawContext, reference: SeriesState, index: number, px: number): void {
  const box = ctx.box;
  const data = reference.data;
  const near = index + 1 < data.length ? index + 1 : index - 1;
  const neighbour = near >= 0 && near < data.length ? data.x[near] : null;
  const step = neighbour !== null ? Math.abs(ctx.x.map(neighbour) - px) : box.w / 8;
  const half = Math.max(2, step / 2);
  const mask = withAlpha(ctx.color('background'), 0.55);
  const c = ctx.r.ctx;
  c.fillStyle = mask;
  c.fillRect(box.x, box.y, Math.max(0, px - half - box.x), box.h);
  const right = px + half;
  c.fillRect(right, box.y, Math.max(0, box.x + box.w - right), box.h);
}

function drawSliceCard(ctx: DrawContext, seriesId: string, options: TooltipOptions): void {
  const series = ctx.chart.seriesById(seriesId);
  if (!series) return;
  let value = 0;
  for (let i = 0; i < series.data.length; i++) {
    if (Number.isFinite(series.data.y[i])) value += series.data.y[i];
  }
  const rows: Row[] = [
    {
      label: series.name,
      value: options.format ? options.format(value, series, 0) : formatGrouped(value),
      note: '',
      color: ctx.colorOf(series),
    },
  ];
  drawCard(ctx, '', rows, ctx.chart.pointerX, ctx.chart.pointerY);
}

function drawCard(ctx: DrawContext, title: string, rows: readonly Row[], px: number, py?: number): void {
  const r = ctx.r;
  const box = ctx.box;
  const titleFont = ctx.font(12, 600);
  const labelFont = ctx.font(12, 400);
  const valueFont = ctx.font(12, 600);
  const noteFont = ctx.font(11, 400);

  let width = title ? r.measure(title, titleFont) : 0;
  for (const row of rows) {
    const note = row.note ? r.measure(row.note, noteFont) + 8 : 0;
    width = Math.max(width, note + r.measure(row.label, labelFont) + GAP + r.measure(row.value, valueFont));
  }
  width += PADDING * 2;
  const height = PADDING * 2 + (title ? TITLE_HEIGHT : 0) + rows.length * ROW_HEIGHT - (title ? 0 : 4);

  let x = px + 14;
  if (x + width > box.x + box.w) x = px - 14 - width;
  x = Math.min(Math.max(x, box.x), Math.max(box.x, box.x + box.w - width));
  const y = Math.min(
    Math.max(box.y + 6, (py ?? box.y + 6) - height / 2),
    Math.max(box.y, box.y + box.h - height - 2),
  );

  const c = r.ctx;
  c.save();
  c.shadowColor = ctx.color('tooltipShadow');
  c.shadowBlur = 14;
  c.shadowOffsetY = 3;
  r.fillRoundRect(x, y, width, height, RADIUS, ctx.color('tooltipBackground'));
  c.restore();
  r.strokeRoundRect(x + 0.5, y + 0.5, width - 1, height - 1, RADIUS, ctx.color('tooltipBorder'));

  const left = x + PADDING;
  const right = x + width - PADDING;
  let cursor = y + PADDING;
  if (title) {
    r.text(title, left, cursor + TITLE_HEIGHT / 2 - 2, {
      font: titleFont,
      color: ctx.color('tooltipText'),
      baseline: 'middle',
    });
    cursor += TITLE_HEIGHT;
  }
  for (const row of rows) {
    const middle = cursor + ROW_HEIGHT / 2 - 1;
    let labelX = left;
    if (row.note) {
      r.text(row.note, left, middle, {
        font: noteFont,
        color: ctx.color('tooltipMuted'),
        baseline: 'middle',
      });
      labelX += r.measure(row.note, noteFont) + 8;
    }
    r.text(row.label, labelX, middle, {
      font: labelFont,
      color: ctx.color('tooltipText'),
      baseline: 'middle',
    });
    r.text(row.value, right, middle, {
      font: valueFont,
      color: row.color,
      align: 'right',
      baseline: 'middle',
    });
    cursor += ROW_HEIGHT;
  }
}
