import { Chart } from '../core/chart.js';
import type { ChartOptions, SeriesOptions, Theme } from '../core/types.js';

/**
 * The fields the diff reads, copied out of the caller's options object.
 *
 * Keeping the object itself looks equivalent and is not. A caller that edits it
 * in place — which is what a Vue `deep` watch hands back, and ordinary usage
 * there — would leave `previous` and `next` as the same object, and every
 * check would compare a field with itself and conclude nothing had changed.
 */
interface Snapshot {
  theme: Theme | undefined;
  series: SeriesOptions[];
  range: [number, number] | undefined;
  height: number | undefined;
}

/**
 * Shallow copies throughout: every array and object the caller still holds is
 * fair game for an in-place edit. Nothing large is duplicated — `data` is
 * compared by identity, so only the reference is carried across.
 */
const snapshot = (options: ChartOptions): Snapshot => ({
  theme: options.theme,
  series: options.series.map((series) => ({ ...series })),
  range: options.range ? [options.range[0], options.range[1]] : undefined,
  height: options.height,
});

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
  private previous: Snapshot;

  constructor(target: HTMLElement, options: ChartOptions) {
    this.chart = new Chart(target, options);
    this.previous = snapshot(options);
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
    this.previous = snapshot(next);

    if (next.theme && next.theme !== previous.theme) {
      this.chart.setTheme(next.theme);
    }

    applySeries(this.chart, previous.series, next.series);

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
    if (!same(next[i], previous[i])) chart.updateSeries(next[i].id, next[i]);
  }
}

/**
 * Field by field, because the snapshot is a copy and never the same object.
 * `data` and `dash` are compared by identity, so a series that only changed
 * colour still costs one string comparison rather than a pass over its samples.
 */
function same(a: SeriesOptions, b: SeriesOptions): boolean {
  const keys = Object.keys(a) as (keyof SeriesOptions)[];
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}
