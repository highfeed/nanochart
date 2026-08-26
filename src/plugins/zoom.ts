import type { Chart } from '../core/chart.js';
import type { Plugin, PointerEventState } from '../core/types.js';
import { boxContains, clamp } from '../core/utils.js';

export interface ZoomOptions {
  /** Zoom the visible window with the wheel. Defaults to true. */
  wheel?: boolean;
  /** Pan the visible window by dragging the plot. Defaults to true. */
  drag?: boolean;
  /**
   * Smallest window this plugin will zoom to, as a fraction of the full
   * extent. Cannot go below the chart's own `minSpan`.
   */
  minSpan?: number;
  /** Window multiplier per wheel notch. Defaults to 0.85. */
  speed?: number;
  /**
   * Require a modifier before the wheel zooms, so a page can still be
   * scrolled past the chart. `'none'` (default) zooms on a bare wheel.
   */
  modifier?: 'none' | 'ctrl' | 'shift' | 'alt' | 'meta';
}

const HELD: Record<string, (event: WheelEvent) => boolean> = {
  ctrl: (e) => e.ctrlKey || e.metaKey,
  shift: (e) => e.shiftKey,
  alt: (e) => e.altKey,
  meta: (e) => e.metaKey,
};

/**
 * Wheel zoom and drag pan directly on the plot.
 *
 * A separate plugin rather than core behaviour: a chart that is a static
 * summary should not become draggable, and a chart that never imports this
 * pays nothing for it.
 */
export function zoom(options: ZoomOptions = {}): Plugin {
  const useWheel = options.wheel ?? true;
  const useDrag = options.drag ?? true;
  const speed = clamp(options.speed ?? 0.85, 0.1, 0.99);
  const held = HELD[options.modifier ?? 'none'];

  let host: Chart | null = null;
  let dragging = false;
  let grabX = 0;
  let grabFrom = 0;
  let grabTo = 0;

  const floor = (chart: Chart): number => Math.max(options.minSpan ?? 0, chart.minSpan);

  const onWheel = (event: WheelEvent): void => {
    const chart = host;
    if (!chart) return;
    if (held && !held(event)) return;

    const rect = chart.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (!boxContains(chart.plot, x, y)) return;

    // The page must not scroll while the chart is consuming the gesture.
    event.preventDefault();

    const [from, to] = [chart.rangeFrom.target, chart.rangeTo.target];
    const span = to - from;
    const next = clamp(span * (event.deltaY < 0 ? speed : 1 / speed), floor(chart), 1);
    if (next === span) return;

    // Hold the value under the cursor still, so zooming feels anchored.
    const at = clamp((x - chart.plot.x) / Math.max(1, chart.plot.w), 0, 1);
    const anchor = from + at * span;
    let start = anchor - at * next;
    start = clamp(start, 0, 1 - next);
    chart.setRange(start, start + next, false);
  };

  return {
    name: 'nano:zoom',

    init(chart) {
      host = chart;
      if (useWheel) chart.canvas.addEventListener('wheel', onWheel, { passive: false });
    },

    destroy(chart) {
      chart.canvas.removeEventListener('wheel', onWheel);
      host = null;
    },

    pointer(chart, event: PointerEventState) {
      if (!useDrag) return false;

      if (event.type === 'down') {
        if (!event.inside || !boxContains(chart.plot, event.x, event.y)) return false;
        dragging = true;
        grabX = event.x;
        grabFrom = chart.rangeFrom.target;
        grabTo = chart.rangeTo.target;
        // Not captured: a press alone should not blank the tooltip.
        return false;
      }

      if (!dragging) return false;
      if (event.type !== 'move') {
        dragging = false;
        return false;
      }

      const span = grabTo - grabFrom;
      if (span >= 1) return false;
      const shift = ((grabX - event.x) / Math.max(1, chart.plot.w)) * span;
      const start = clamp(grabFrom + shift, 0, 1 - span);
      if (start === chart.rangeFrom.target) return false;

      chart.canvas.style.cursor = 'grabbing';
      chart.setRange(start, start + span, false);
      // Captured only once the pointer actually moved, so a click still hovers.
      return true;
    },
  };
}
