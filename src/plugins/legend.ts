import { withAlpha } from '../core/color.js';
import type { Chart } from '../core/chart.js';
import type { Plugin, SeriesState } from '../core/types.js';

export interface LegendOptions {
  /** Pill height in CSS pixels. */
  itemHeight?: number;
  gap?: number;
  /** Space between the plot and the first row. */
  offset?: number;
  fontSize?: number;
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
  let items: Item[] = [];

  const layout = (chart: Chart, left: number, top: number, width: number): number => {
    const font = chart.font(fontSize, 500);
    items = [];
    let x = left;
    let row = 0;
    for (const series of chart.series) {
      const textWidth = chart.renderer.measure(series.name, font);
      const w = textWidth + CHECK_SIZE + 30;
      if (x > left && x + w > left + width) {
        x = left;
        row++;
      }
      items.push({ series, x, y: top + row * (height + gap), w, h: height });
      x += w + gap;
    }
    return items.length ? (row + 1) * (height + gap) - gap : 0;
  };

  return {
    name: 'nano:legend',

    measure(chart, box) {
      const total = layout(chart, box.x, 0, box.w);
      if (total <= 0) return;
      box.h -= total + offset;
      const top = box.y + box.h + offset;
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
