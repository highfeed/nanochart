import { Animated } from '../core/animate.js';
import type { Chart } from '../core/chart.js';
import { withAlpha } from '../core/color.js';
import { linearTickSet, logTicks, timeFormatter, timeTicks } from '../core/scale.js';
import type { AxisId, DrawContext, Plugin } from '../core/types.js';
import { compactFormatter, formatLog } from '../core/utils.js';

/** Cross-fades between the old and the new tick set when the step changes. */
class TickFader {
  private previous: number[] = [];
  private current: number[] = [];
  private readonly fade = new Animated(1);

  update(ticks: readonly number[], now: number, duration: number): void {
    if (same(ticks, this.current)) return;
    this.previous = this.current;
    this.current = ticks.slice();
    // The first set has nothing to cross-fade from, so it appears at once.
    // Fading it in would leave the axis blank on the opening frame, and blank
    // for good if the next frame is delayed — a background tab, a throttled
    // rAF, or a chart that stops animating before the fade completes.
    if (this.previous.length === 0) {
      this.fade.jump(1);
      return;
    }
    this.fade.jump(0);
    this.fade.set(1, now, duration);
  }

  each(now: number, draw: (ticks: readonly number[], alpha: number) => void): void {
    const t = this.fade.at(now);
    if (t < 1 && this.previous.length) draw(this.previous, 1 - t);
    draw(this.current, t);
  }

  active(now: number): boolean {
    return this.fade.active(now);
  }
}

function same(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export interface YAxisOptions {
  axis?: AxisId;
  /** Draw horizontal grid lines. Defaults to true for `y`. */
  grid?: boolean;
  /** Label side. Defaults to left for `y` and right for `y2`. */
  align?: 'left' | 'right';
  /** Tint labels with the color of the first series on this axis. */
  tinted?: boolean;
  /** Explicit label color, useful on top of filled areas. */
  color?: string;
  /** Wrapped around the formatted value, e.g. `$` or ` BTC`. */
  prefix?: string;
  suffix?: string;
  /**
   * `above` (default) and `below` place labels relative to the grid line.
   * `inside` places them below the line and drops the ones that would fall out
   * of the plot, so every label stays on top of a filled area.
   */
  labelPosition?: 'above' | 'below' | 'inside';
  /**
   * `overlay` (default) draws labels on top of the plot, Telegram style.
   * `outside` reserves a gutter for them and shrinks the plot, which is what a
   * conventional chart looks like and what wide labels need.
   */
  placement?: 'overlay' | 'outside';
  /** Gap between the gutter and the plot, in `outside` placement. */
  gutter?: number;
  format?: (value: number) => string;
  fontSize?: number;
}

export function yAxis(options: YAxisOptions = {}): Plugin {
  const axis = options.axis ?? 'y';
  const align = options.align ?? (axis === 'y' ? 'left' : 'right');
  const outside = options.placement === 'outside';
  const gutter = options.gutter ?? 8;
  const fontSize = options.fontSize ?? 11;
  const fader = new TickFader();
  let reserved = 0;

  return {
    name: `nano:yAxis:${axis}`,
    animating: (_chart, now) => fader.active(now),

    measure: outside
      ? (chart, box) => {
          // The gutter is as wide as the widest label the current domain can
          // produce, so it neither clips nor leaves a slab of empty space.
          const domain = chart.domain(axis);
          const format = labelFormat(chart, axis, options, domain.step);
          const font = chart.font(fontSize, 500);
          let widest = 0;
          for (const value of domain.ticks) {
            const width = chart.renderer.measure(format(value, 0), font);
            if (width > widest) widest = width;
          }
          reserved = widest > 0 ? widest + gutter : 0;
          if (reserved === 0) return;
          box.w -= reserved;
          if (align === 'left') box.x += reserved;
        }
      : undefined,

    drawUnder(ctx) {
      const domain = ctx.chart.domain(axis);
      if (!domain.used) return;
      fader.update(domain.ticks, ctx.now, ctx.chart.duration);
      // A secondary axis only owns the grid when the primary one has no data.
      if (!(options.grid ?? (axis === 'y' || !ctx.chart.domain('y').used))) return;

      const scale = ctx.scaleFor(axis);
      const box = ctx.box;
      const gridColor = ctx.color('grid');
      fader.each(ctx.now, (ticks, alpha) => {
        if (alpha <= 0.01) return;
        for (const value of ticks) {
          const y = scale.map(value);
          if (y < box.y - 2 || y > box.y + box.h + 2) continue;
          ctx.r.hline(box.x, box.x + box.w, y, withAlpha(gridColor, alpha));
        }
      });
    },

    // Labels sit above the series so they stay readable on top of bars and areas.
    drawOver(ctx) {
      const chart = ctx.chart;
      const domain = chart.domain(axis);
      if (!domain.used) return;

      const scale = ctx.scaleFor(axis);
      const box = ctx.box;
      const font = ctx.font(fontSize, 500);
      const textColor = options.color ?? (options.tinted ? tint(ctx, axis) : ctx.color('textMuted'));
      const formatter = labelFormat(chart, axis, options, domain.step);
      const x = align === 'left' ? box.x - (outside ? gutter : 0) : box.x + box.w + (outside ? gutter : 0);

      const position = options.labelPosition ?? 'above';
      const size = fontSize;
      // Outside the plot there is nothing to sit clear of, so labels centre on
      // their grid line instead of perching above it.
      const below = outside ? false : position !== 'above';
      fader.each(ctx.now, (ticks, alpha) => {
        if (alpha <= 0.01) return;
        for (const value of ticks) {
          const y = scale.map(value);
          if (y < box.y - 2 || y > box.y + box.h + 2) continue;
          if (!outside && position === 'inside' && y + 5 + size > box.y + box.h) continue;
          ctx.r.text(formatter(value, 0), x, outside ? y : below ? y + 5 : y - 6, {
            font,
            color: withAlpha(textColor, alpha),
            align: outside ? (align === 'left' ? 'right' : 'left') : align,
            baseline: outside ? 'middle' : below ? 'top' : 'bottom',
          });
        }
      });
    },
  };
}

type TickFormat = (value: number, index: number) => string;

/** The formatter a y axis will actually use, options and axis type applied. */
function labelFormat(
  chart: Chart,
  axis: AxisId,
  options: YAxisOptions,
  step: number,
): TickFormat {
  const axisOptions = chart.axisOptions(axis);
  const fallback = axisOptions.type === 'log' ? formatLog : compactFormatter(step);
  const base = options.format ?? axisOptions.format ?? fallback;
  return decorate((value, index) => base(value, index), options.prefix, options.suffix);
}

/** Wraps a formatter, keeping the minus sign in front: `-$500`, not `$-500`. */
function decorate(format: TickFormat, prefix = '', suffix = ''): TickFormat {
  if (!prefix && !suffix) return format;
  return (value, index) => {
    const text = format(value, index);
    return text.startsWith('-') ? `-${prefix}${text.slice(1)}${suffix}` : `${prefix}${text}${suffix}`;
  };
}

function tint(ctx: DrawContext, axis: AxisId): string {
  for (const series of ctx.chart.series) {
    if (series.axis === axis && series.visible) return ctx.colorOf(series);
  }
  return ctx.color('textMuted');
}

/** Whole slots inside the window, thinned so labels do not collide. */
function categoryTicks(d0: number, d1: number, count: number): number[] {
  const first = Math.max(0, Math.ceil(d0 - 1e-9));
  const last = Math.floor(d1 + 1e-9);
  const stride = Math.max(1, Math.ceil((last - first + 1) / Math.max(1, count)));
  const out: number[] = [];
  for (let i = first; i <= last; i += stride) out.push(i);
  return out;
}

export interface XAxisOptions {
  /** Reserved height in CSS pixels. */
  height?: number;
  /** Minimum spacing between labels. */
  spacing?: number;
  format?: (value: number, index: number) => string;
  /** Wrapped around the formatted value, e.g. `$`. */
  prefix?: string;
  suffix?: string;
  fontSize?: number;
}

export function xAxis(options: XAxisOptions = {}): Plugin {
  const height = options.height ?? 26;
  const spacing = options.spacing ?? 78;
  const fader = new TickFader();

  return {
    name: 'nano:xAxis',
    animating: (_chart, now) => fader.active(now),
    measure(_chart, box) {
      box.h -= height;
    },
    drawUnder(ctx) {
      const chart = ctx.chart;
      const box = ctx.box;
      const count = Math.max(2, Math.floor(box.w / spacing));
      const type = chart.xAxis.type;
      const span = ctx.x.d1 - ctx.x.d0;

      let ticks: number[];
      let fallback: (value: number) => string;
      if (type === 'time') {
        ticks = timeTicks(ctx.x.d0, ctx.x.d1, count, chart.formats);
        fallback = timeFormatter(span, count, chart.formats);
      } else if (type === 'log') {
        ticks = logTicks(ctx.x.d0, ctx.x.d1, count);
        fallback = formatLog;
      } else if (type === 'category') {
        ticks = categoryTicks(ctx.x.d0, ctx.x.d1, count);
        const labels = chart.xAxis.categories;
        fallback = (value) => labels?.[Math.round(value)] ?? String(Math.round(value));
      } else {
        const linear = linearTickSet(ctx.x.d0, ctx.x.d1, count);
        ticks = linear.ticks;
        fallback = compactFormatter(linear.step);
      }
      fader.update(ticks, ctx.now, chart.duration);

      const base: TickFormat = options.format ?? chart.xAxis.format ?? ((value) => fallback(value));
      const format = decorate(base, options.prefix, options.suffix);
      const font = ctx.font(options.fontSize ?? 11, 500);
      const color = ctx.color('textMuted');
      const y = box.y + box.h + height / 2 + 2;

      fader.each(ctx.now, (values, alpha) => {
        if (alpha <= 0.01) return;
        for (let i = 0; i < values.length; i++) {
          const label = format(values[i], i);
          const width = ctx.r.measure(label, font);
          const px = Math.min(
            Math.max(ctx.x.map(values[i]), box.x + width / 2),
            box.x + box.w - width / 2,
          );
          ctx.r.text(label, px, y, {
            font,
            color: withAlpha(color, alpha),
            align: 'center',
            baseline: 'middle',
          });
        }
      });
    },
  };
}
