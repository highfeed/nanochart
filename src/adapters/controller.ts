import { Chart } from '../core/chart.js';
import type { AxisOptions, ChartOptions, SeriesOptions, Theme } from '../core/types.js';
// The built-in series types register themselves from the package entry, and a
// page that imports only a wrapper never loads it: the chart it built had no
// renderer for `line`, and threw on its first series. Loading the entry here
// makes each wrapper entry self-sufficient; the plugins and themes it also
// exports are unused references, which a bundler drops as usual.
import '../index.js';

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
  /** Sample counts, so an array appended to in place still reads as changed. */
  lengths: number[];
  range: [number, number] | undefined;
  height: number | undefined;
  /** Everything the chart reads once, at construction. */
  fixed: Record<string, unknown>;
}

/**
 * Shallow copies throughout: every array and object the caller still holds is
 * fair game for an in-place edit. Nothing large is duplicated — `data` is
 * compared by identity, so only the reference is carried across.
 */
const snapshot = (options: ChartOptions): Snapshot => ({
  theme: options.theme,
  series: options.series.map((series) => ({ ...series })),
  lengths: options.series.map((series) => series.data?.length ?? 0),
  range: options.range ? [options.range[0], options.range[1]] : undefined,
  height: options.height,
  fixed: {
    x: axis(options.x),
    y: axis(options.y),
    y2: axis(options.y2),
    // A plugin is known by its name. A page that builds its plugin list inline
    // hands over new instances on every render, and rebuilding the chart for
    // each of them would be the very churn this diff exists to avoid.
    plugins: (options.plugins ?? []).map((plugin) => plugin.name),
    padding: { ...options.padding },
    animation: typeof options.animation === 'object' ? { ...options.animation } : options.animation,
    locale: options.locale,
    timeZone: options.timeZone,
    minSpan: options.minSpan,
    ariaLabel: options.ariaLabel,
  },
});

/** Axis options, one level deeper for `categories`, which is a list of labels. */
const axis = (options: AxisOptions | undefined): Record<string, unknown> => ({
  ...options,
  categories: options?.categories ? [...options.categories] : undefined,
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
  /** Replaced when an option the chart reads once changes; `onChart` reports it. */
  chart: Chart;
  private readonly target: HTMLElement;
  private readonly onChart: ((chart: Chart) => void) | undefined;
  private previous: Snapshot;

  constructor(target: HTMLElement, options: ChartOptions, onChart?: (chart: Chart) => void) {
    this.target = target;
    this.onChart = onChart;
    this.chart = new Chart(target, options);
    this.previous = snapshot(options);
    onChart?.(this.chart);
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
    const current = snapshot(next);
    this.previous = current;

    if (!equal(previous.fixed, current.fixed)) {
      // Axes, plugins, locale, padding: the chart reads them once, at
      // construction, and used to go on ignoring the prop that changed them.
      // There is no narrower path than a new chart, and the change is rare.
      this.chart.destroy();
      this.chart = new Chart(this.target, next);
      this.onChart?.(this.chart);
      return;
    }

    if (next.theme && next.theme !== previous.theme) {
      this.chart.setTheme(next.theme);
    }

    applySeries(this.chart, previous, current);

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
function applySeries(chart: Chart, previous: Snapshot, current: Snapshot): void {
  const before = previous.series;
  const after = current.series;
  if (before.length !== after.length) {
    chart.setSeries(after);
    return;
  }
  for (let i = 0; i < after.length; i++) {
    if (after[i].id !== before[i].id || after[i].type !== before[i].type) {
      chart.setSeries(after);
      return;
    }
  }
  for (let i = 0; i < after.length; i++) {
    const patch = diff(before[i], after[i]);
    // `data` is compared by identity, and then by length: a series appended
    // to in place — a Vue array pushed to, the tape in the examples — keeps
    // its array and grows it, which identity alone reads as unchanged.
    if (current.lengths[i] !== previous.lengths[i]) patch.data = after[i].data;
    if (Object.keys(patch).length > 0) chart.updateSeries(after[i].id, patch);
  }
}

/**
 * The fields of `next` that differ from `previous`, by identity, so a series
 * that only changed colour is patched with its colour and its samples are
 * not parsed again.
 */
function diff(previous: SeriesOptions, next: SeriesOptions): Partial<SeriesOptions> {
  const patch: Partial<SeriesOptions> = {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]) as Set<keyof SeriesOptions>;
  for (const key of keys) {
    if (previous[key] !== next[key]) (patch as Record<keyof SeriesOptions, unknown>)[key] = next[key];
  }
  return patch;
}

/**
 * Structural equality for the shapes the snapshot holds: plain objects and
 * arrays by their contents, everything else — numbers, strings, functions —
 * by identity. A callback recreated on every render therefore counts as a
 * change, the way it does everywhere else in a framework.
 */
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => equal(item, b[i]));
  }
  if (isPlain(a) && isPlain(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => equal(a[key], b[key]));
  }
  return false;
}

const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
