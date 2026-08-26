import { withAlpha } from '../core/color.js';
import type { Chart } from '../core/chart.js';
import type { Plugin, SeriesState } from '../core/types.js';

export interface LegendOptions {
  /** Pill height in CSS pixels. */
  itemHeight?: number;
  gap?: number;
  /** Space between the plot and the nearest row. */
  offset?: number;
  fontSize?: number;
  /** Which side of the plot the legend sits on. Defaults to `bottom`. */
  position?: 'top' | 'bottom';
  /** `vertical` stacks one item per row, for narrow plots and long names. */
  orientation?: 'horizontal' | 'vertical';
  /** Horizontal alignment of each row. Defaults to `start`. */
  align?: 'start' | 'center' | 'end';
  /** Return false to keep a series out of the legend entirely. */
  filter?: (series: SeriesState) => boolean;
}

interface Item {
  series: SeriesState;
  x: number;
  y: number;
  w: number;
  h: number;
}

const CHECK_SIZE = 15;

export function legend(options: LegendOptions = {}): Plugin {
  const height = options.itemHeight ?? 30;
  const gap = options.gap ?? 8;
  const offset = options.offset ?? 12;
  const fontSize = options.fontSize ?? 13;
  const position = options.position ?? 'bottom';
  const vertical = options.orientation === 'vertical';
  const align = options.align ?? 'start';
  let items: Item[] = [];

  /** Lays rows out from y=0 and returns the total height they need. */
  const layout = (chart: Chart, left: number, width: number): number => {
    const font = chart.font(fontSize, 500);
    const shown = options.filter ? chart.series.filter(options.filter) : chart.series;
    items = [];
    if (shown.length === 0) return 0;

    const rows: Item[][] = [[]];
    let x = 0;
    for (const series of shown) {
      const w = chart.renderer.measure(series.name, font) + CHECK_SIZE + 30;
      const row = rows[rows.length - 1];
      if (vertical ? row.length > 0 : row.length > 0 && x + w > width) {
        rows.push([]);
        x = 0;
      }
      const current = rows[rows.length - 1];
      current.push({ series, x, y: (rows.length - 1) * (height + gap), w, h: height });
      x += w + gap;
    }

    // Alignment is per row, so a short last row sits under the ones above it
    // the way the caller asked rather than always hugging the left edge.
    for (const row of rows) {
      const used = row.reduce((total, item) => total + item.w + gap, -gap);
      const slack = Math.max(0, width - used);
      const shift = align === 'center' ? slack / 2 : align === 'end' ? slack : 0;
      for (const item of row) {
        item.x += left + shift;
        items.push(item);
      }
    }
    return rows.length * (height + gap) - gap;
  };

  return {
    name: 'nano:legend',

    measure(chart, box) {
      const total = layout(chart, box.x, box.w);
      if (total <= 0) return;
      box.h -= total + offset;
      const top = position === 'top' ? box.y : box.y + box.h + offset;
      if (position === 'top') box.y += total + offset;
      for (const item of items) item.y += top;
    },

    drawOver(ctx) {
      const font = ctx.font(fontSize, 500);
      const background = ctx.color('background');
      for (const item of items) {
        const color = ctx.colorOf(item.series);
        const on = item.series.visible;
        const radius = item.h / 2;
        const r = ctx.r;

        if (on) r.fillRoundRect(item.x, item.y, item.w, item.h, radius, color);
        else r.strokeRoundRect(item.x + 0.5, item.y + 0.5, item.w - 1, item.h - 1, radius, withAlpha(color, 0.5));

        const cx = item.x + 16;
        const cy = item.y + item.h / 2;
        if (on) {
          const c = r.ctx;
          c.save();
          c.strokeStyle = background;
          c.lineWidth = 2;
          c.lineCap = 'round';
          c.lineJoin = 'round';
          c.beginPath();
          c.moveTo(cx - 4.5, cy);
          c.lineTo(cx - 1, cy + 3.5);
          c.lineTo(cx + 5, cy - 3.5);
          c.stroke();
          c.restore();
        } else {
          r.circle(cx, cy, 4.5, withAlpha(color, 0.45));
        }

        r.text(item.series.name, cx + 12, cy + 0.5, {
          font,
          color: on ? background : color,
          align: 'left',
          baseline: 'middle',
        });
      }
    },

    pointer(chart, event) {
      const hit = items.find(
        (item) =>
          event.x >= item.x &&
          event.x <= item.x + item.w &&
          event.y >= item.y &&
          event.y <= item.y + item.h,
      );
      if (!hit) return false;
      if (event.type === 'up') chart.toggle(hit.series.id);
      chart.canvas.style.cursor = 'pointer';
      return true;
    },
  };
}
