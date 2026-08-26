import { Animated } from '../core/animate.js';
import { scaleLinear, type Scale } from '../core/scale.js';
import type { AxisId, Box, DrawContext, Plugin } from '../core/types.js';
import { clamp } from '../core/utils.js';

export interface RangeSelectorOptions {
  /** Height of the scrubber in CSS pixels. */
  height?: number;
  /** Gap between the plot and the scrubber. */
  offset?: number;
  /** Smallest selectable window, as a fraction of the full extent. */
  minSpan?: number;
  handleWidth?: number;
  radius?: number;
}

type Mode = 'none' | 'left' | 'right' | 'move';

const AXES: readonly AxisId[] = ['y', 'y2'];

/** Telegram-style preview strip with a draggable window. */
export function rangeSelector(options: RangeSelectorOptions = {}): Plugin {
  const height = options.height ?? 44;
  const offset = options.offset ?? 14;
  const handleWidth = options.handleWidth ?? 10;
  const radius = options.radius ?? 7;
  const minSpan = options.minSpan ?? 0.06;

  const box: Box = { x: 0, y: 0, w: 0, h: 0 };
  const domains: Record<AxisId, { min: Animated; max: Animated }> = {
    y: { min: new Animated(0), max: new Animated(1) },
    y2: { min: new Animated(0), max: new Animated(1) },
  };
  let mode: Mode = 'none';
  let grab = 0;

  const positionAt = (fraction: number): number => box.x + fraction * box.w;

  return {
    name: 'nano:rangeSelector',

    measure(_chart, area) {
      area.h -= height + offset;
      box.x = area.x;
      box.y = area.y + area.h + offset;
      box.w = area.w;
      box.h = height;
    },

    animating(_chart, now) {
      for (const axis of AXES) {
        if (domains[axis].min.active(now) || domains[axis].max.active(now)) return true;
      }
      return false;
    },

    drawOver(ctx) {
      if (box.w <= 0 || box.h <= 0) return;
      const chart = ctx.chart;
      const [e0, e1] = chart.xExtent;
      const x = scaleLinear(e0, e1, box.x, box.x + box.w);
      const inner: Box = { x: box.x, y: box.y + 2, w: box.w, h: box.h - 4 };

      const scales = {} as Record<AxisId, Scale>;
      for (const axis of AXES) {
        const state = domains[axis];
        const raw = chart.measureExtent(axis, e0, e1);
        if (raw) {
          const nice = chart.niceDomain(axis === 'y' ? chart.yAxis : chart.y2Axis, raw);
          state.min.set(nice.min, ctx.now, chart.duration);
          state.max.set(nice.max, ctx.now, chart.duration);
        }
        scales[axis] = scaleLinear(
          state.min.at(ctx.now),
          state.max.at(ctx.now),
          inner.y + inner.h,
          inner.y,
        );
      }

      const r = ctx.r;
      const c = r.ctx;
      r.save();
      r.roundRectPath(box.x, box.y, box.w, box.h, radius);
      c.clip();
      chart.drawSeries(chart.createContext(ctx.now, inner, x, scales, true));
      r.restore();

      const from = positionAt(chart.rangeFrom.at(ctx.now));
      const to = positionAt(chart.rangeTo.at(ctx.now));

      r.save();
      r.roundRectPath(box.x, box.y, box.w, box.h, radius);
      c.clip();
      c.fillStyle = ctx.color('overlay');
      c.fillRect(box.x, box.y, from - box.x, box.h);
      c.fillRect(to, box.y, box.x + box.w - to, box.h);
      r.restore();

      r.roundRectPath(from, box.y, to - from, box.h, radius);
      c.rect(from + handleWidth, box.y + 1, Math.max(0, to - from - handleWidth * 2), box.h - 2);
      c.fillStyle = ctx.color('handle');
      c.fill('evenodd');

      drawGrip(ctx, from + handleWidth / 2, box.y + box.h / 2);
      drawGrip(ctx, to - handleWidth / 2, box.y + box.h / 2);
    },

    pointer(chart, event) {
      const near =
        event.inside &&
        event.y >= box.y - 8 &&
        event.y <= box.y + box.h + 8 &&
        event.x >= box.x - 10 &&
        event.x <= box.x + box.w + 10;

      if (event.type === 'down') {
        if (!near) return false;
        const from = positionAt(chart.rangeFrom.target);
        const to = positionAt(chart.rangeTo.target);
        if (Math.abs(event.x - from) <= handleWidth) mode = 'left';
        else if (Math.abs(event.x - to) <= handleWidth) mode = 'right';
        else {
          mode = 'move';
          grab = event.x > from && event.x < to ? event.x - from : (to - from) / 2;
          apply(chart, event.x);
        }
        chart.canvas.style.cursor = mode === 'move' ? 'grabbing' : 'ew-resize';
        return true;
      }

      if (mode !== 'none') {
        if (event.type === 'move') apply(chart, event.x);
        else mode = 'none';
        return true;
      }

      if (!near) return false;
      const from = positionAt(chart.rangeFrom.target);
      const to = positionAt(chart.rangeTo.target);
      const onHandle = Math.abs(event.x - from) <= handleWidth || Math.abs(event.x - to) <= handleWidth;
      chart.canvas.style.cursor = onHandle ? 'ew-resize' : event.x > from && event.x < to ? 'grab' : 'pointer';
      return true;
    },
  };

  function apply(chart: DrawContext['chart'], px: number): void {
    const t = clamp((px - box.x) / Math.max(1, box.w), 0, 1);
    const from = chart.rangeFrom.target;
    const to = chart.rangeTo.target;
    if (mode === 'left') chart.setRange(Math.min(t, to - minSpan), to, false);
    else if (mode === 'right') chart.setRange(from, Math.max(t, from + minSpan), false);
    else {
      const span = to - from;
      const start = clamp((px - grab - box.x) / Math.max(1, box.w), 0, 1 - span);
      chart.setRange(start, start + span, false);
    }
  }
}

function drawGrip(ctx: DrawContext, x: number, y: number): void {
  ctx.r.fillRoundRect(x - 1, y - 5, 2, 10, 1, ctx.color('handleGrip'));
}
