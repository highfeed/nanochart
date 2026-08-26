import type { Animated, Easing } from './animate.js';
import type { Chart } from './chart.js';
import type { SeriesData } from './data.js';
import type { Renderer } from './renderer.js';
import type { Scale } from './scale.js';

export interface Point {
  x: number;
  y: number;
  /** Candlestick fields; `y` mirrors `close` for shared tooling. */
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

/** Input shape for candlestick series; `y` is derived from `close`. */
export interface OhlcInput {
  x: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Accepted shapes: `[5, 7, 3]`, `[[ts, 5], ...]`, `[{ x, y }, ...]` or OHLC
 * objects. `null` and `undefined` mark a gap, as does any non-finite number.
 */
export type SeriesInput =
  | readonly (number | null | undefined)[]
  | readonly (Point | null | undefined)[]
  | readonly (OhlcInput | null | undefined)[]
  // Deliberately `number[]` rather than `[number, number]`: an array literal
  // like `[[1, 2], [3, 4]]` infers as `number[][]`, and a tuple type would
  // reject it without an assertion at every call site.
  | readonly (readonly number[] | null | undefined)[];

/** Built-in types plus anything registered through `registerSeries`. */
export type SeriesType = 'line' | 'area' | 'bar' | 'pie' | 'candlestick' | 'scatter' | (string & {});

export type AxisId = 'y' | 'y2';

export type Curve = 'linear' | 'smooth' | 'step';

export interface SeriesOptions {
  id: string;
  type: SeriesType;
  data: SeriesInput;
  name?: string;
  /** Explicit color, otherwise taken from the theme palette. */
  color?: string;
  /** Optional variant used while a dark theme is active. */
  colorDark?: string;
  visible?: boolean;
  axis?: AxisId;
  /** Series sharing a stack id are stacked on top of each other. */
  stack?: string;
  /** Normalize the whole stack to 100% at every x. */
  normalize?: boolean;
  lineWidth?: number;
  fillOpacity?: number;
  curve?: Curve;
  dash?: readonly number[];
  /** Bar and candle width as a fraction of the x step (0..1). */
  barWidth?: number;
  /** Pie hole radius as a fraction of the outer radius (0..1). */
  innerRadius?: number;
  /** Scatter dot radius in pixels. */
  radius?: number;
  /** Candlestick colors; default to the theme `positive` and `negative`. */
  upColor?: string;
  downColor?: string;
}

export interface SeriesState {
  readonly id: string;
  readonly type: SeriesType;
  readonly options: SeriesOptions;
  readonly index: number;
  name: string;
  axis: AxisId;
  /** Samples in columnar form; see `SeriesData`. */
  data: SeriesData;
  visible: boolean;
  alpha: Animated;
}

export type AxisType = 'linear' | 'time' | 'log' | 'category';

export interface AxisOptions {
  /**
   * `log` spans orders of magnitude; `category` puts one slot per sample and
   * labels it from `categories`, which is what a bar chart usually wants.
   */
  type?: AxisType;
  /** Labels for a `category` axis, indexed by sample position. */
  categories?: readonly string[];
  /** Hard domain bounds; omit for auto. */
  min?: number;
  max?: number;
  /** Approximate tick count. */
  ticks?: number;
  format?: (value: number, index: number) => string;
  /** Always include zero in the domain. Defaults to true for bars and areas. */
  zero?: boolean;
  /** Extra headroom as a fraction of the domain span. */
  padding?: number;
}

export interface Theme {
  readonly name: string;
  readonly dark: boolean;
  readonly font: string;
  readonly background: string;
  readonly text: string;
  readonly textMuted: string;
  readonly grid: string;
  readonly crosshair: string;
  /** Gains and losses: candles, profit and loss bars. */
  readonly positive: string;
  readonly negative: string;
  readonly tooltipBackground: string;
  readonly tooltipText: string;
  readonly tooltipMuted: string;
  readonly tooltipBorder: string;
  readonly tooltipShadow: string;
  readonly overlay: string;
  readonly handle: string;
  readonly handleGrip: string;
  readonly palette: readonly string[];
}

export type ThemeColorKey = {
  [K in keyof Theme]: Theme[K] extends string ? (K extends 'name' | 'font' ? never : K) : never;
}[keyof Theme];

export interface AnimationOptions {
  duration: number;
  easing: Easing;
}

export interface ChartOptions {
  series: readonly SeriesOptions[];
  theme?: Theme;
  x?: AxisOptions;
  y?: AxisOptions;
  y2?: AxisOptions;
  padding?: Partial<Padding>;
  /**
   * Plugins are drawn in list order; screen space is reserved in reverse order,
   * so the last plugin sits closest to the canvas edge.
   */
  plugins?: readonly Plugin[];
  animation?: Partial<AnimationOptions> | false;
  /** Visible x window as fractions of the full extent. */
  range?: readonly [number, number];
  /** Smallest window the scrubber and zoom will allow. Defaults to 0.02. */
  minSpan?: number;
  /** Canvas height in CSS pixels; defaults to the container height. */
  height?: number;
  /** BCP 47 tag for tick and tooltip formatting. Defaults to the host locale. */
  locale?: string;
  /**
   * IANA zone for time axes, e.g. `'UTC'` or `'Asia/Tokyo'`. Defaults to the
   * host zone. Day and month ticks anchor to midnight in this zone.
   */
  timeZone?: string;
  ariaLabel?: string;
}

export interface PointerEventState {
  readonly type: 'move' | 'down' | 'up' | 'leave';
  /** Position in CSS pixels, relative to the canvas. */
  readonly x: number;
  readonly y: number;
  readonly inside: boolean;
  readonly originalEvent: PointerEvent | null;
}

export interface StackLayout {
  readonly base: Float64Array;
  readonly top: Float64Array;
}

export type StackMap = ReadonlyMap<string, StackLayout>;

export interface DrawContext {
  readonly chart: Chart;
  readonly r: Renderer;
  /** Area the series are drawn into. */
  readonly box: Box;
  readonly now: number;
  readonly x: Scale;
  readonly stacks: StackMap;
  /** True while rendering the miniature preview of the range selector. */
  readonly preview: boolean;
  scaleFor(axis: AxisId): Scale;
  alphaOf(series: SeriesState): number;
  colorOf(series: SeriesState): string;
  /** Theme color resolved at the current time, so theme switches cross-fade. */
  color(key: ThemeColorKey): string;
  font(size: number, weight?: number): string;
}

export interface SeriesRenderer {
  readonly type: SeriesType;
  /** Cartesian renderers take part in axis domain calculation. Default true. */
  readonly cartesian?: boolean;
  /** Domain always includes zero (bars, areas). */
  readonly baseline?: boolean;
  /**
   * Width of the slot this renderer draws around each sample, in data units.
   *
   * A bar is centred on its sample, so half of the first and the last one
   * falls beyond the extent of the data itself. Reporting the width lets the x
   * domain leave room for it, the way a category axis leaves half a slot.
   */
  slot?(series: SeriesState): number;
  draw(ctx: DrawContext, series: SeriesState): void;
  /** Custom domain contribution for `[i0, i1]`, overriding the default scan. */
  extent?(series: SeriesState, i0: number, i1: number, stacks: StackMap): readonly [number, number] | null;
  /** Non-cartesian hit testing, used for pie slices. */
  hit?(ctx: DrawContext, series: SeriesState, px: number, py: number): boolean;
}

export interface Plugin {
  readonly name: string;
  init?(chart: Chart): void;
  /** Shrink `box` to reserve space for this plugin. */
  measure?(chart: Chart, box: Box): void;
  /** Drawn beneath the series. */
  drawUnder?(ctx: DrawContext): void;
  /** Drawn on top of the series. */
  drawOver?(ctx: DrawContext): void;
  /** Return true to capture the event and stop propagation. */
  pointer?(chart: Chart, event: PointerEventState): boolean;
  /** Keeps the render loop alive while the plugin runs its own animation. */
  animating?(chart: Chart, now: number): boolean;
  destroy?(chart: Chart): void;
}

export interface ChartEvents {
  hover: { index: number; seriesId: string | null };
  select: { index: number; seriesId: string | null };
  rangechange: { from: number; to: number };
  toggle: { id: string; visible: boolean };
  themechange: { theme: Theme };
}
