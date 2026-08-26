import { Chart } from '../core/chart.js';
import type { ChartOptions, SeriesOptions } from '../core/types.js';

/**
 * The part of a framework binding that is not framework-specific.
 *
 * Every wrapper has the same job: build a chart on mount, work out the
 * narrowest update for each prop change, and destroy on unmount. Only the
 * lifecycle hooks differ, so the diffing lives here and each binding stays a
 * dozen lines.
 */
export class ChartController {
  readonly chart: Chart;
  private previous: ChartOptions;

  constructor(target: HTMLElement, options: ChartOptions) {
    this.chart = new Chart(target, options);
    this.previous = options;
  }

  /**
   * Applies whatever changed, preferring the narrowest call.
   *
   * A wrapper is handed a whole options object on every render, so treating
   * that as "replace everything" would restart every animation on an unrelated
   * prop change.
   */
  update(next: ChartOptions): void {
    const previous = this.previous;
    this.previous = next;

    if (next.theme && next.theme !== previous.theme) {
      this.chart.setTheme(next.theme);
    }

    if (next.series !== previous.series) {
      applySeries(this.chart, previous.series, next.series);
    }

    const range = next.range;
    if (range && (!previous.range || range[0] !== previous.range[0] || range[1] !== previous.range[1])) {
      this.chart.setRange(range[0], range[1]);
    }

    if (next.height !== previous.height) this.chart.setHeight(next.height);
  }

  destroy(): void {
    this.chart.destroy();
  }
}

/**
 * Patches series individually when the set of ids is unchanged.
 *
 * Replacing the list rebuilds every series and re-parses every sample, so a
 * render that only changed one colour would re-parse the whole dataset.
 */
function applySeries(chart: Chart, previous: readonly SeriesOptions[], next: readonly SeriesOptions[]): void {
  if (previous.length !== next.length) {
    chart.setSeries(next);
    return;
  }
  for (let i = 0; i < next.length; i++) {
    if (next[i].id !== previous[i].id || next[i].type !== previous[i].type) {
      chart.setSeries(next);
      return;
    }
  }
  for (let i = 0; i < next.length; i++) {
    if (next[i] !== previous[i]) chart.updateSeries(next[i].id, next[i]);
  }
}
