import { Animated, easeOutCubic } from './animate.js';
import { mixColorStrings } from './color.js';
import { getSeriesRenderer } from './registry.js';
import { Renderer } from './renderer.js';
import {
  logTicks,
  niceLogDomain,
  nextNiceStep,
  niceStepUp,
  scaleLinear,
  scaleLog,
  ticksFromStep,
  type Scale,
} from './scale.js';
import { lowerBound, nearestIndex, normalizeData } from './data.js';
import { buildStacks } from './stack.js';
import { boxContains, clamp } from './utils.js';
import type {
  AnimationOptions,
  AxisId,
  AxisOptions,
  Box,
  ChartEvents,
  ChartOptions,
  DrawContext,
  Padding,
  Plugin,
  PointerEventState,
  SeriesOptions,
  SeriesState,
  StackMap,
  Theme,
  ThemeColorKey,
} from './types.js';
import { telegramLight } from '../themes/telegram.js';

const AXES: readonly AxisId[] = ['y', 'y2'];
const DEFAULT_PADDING: Padding = { top: 20, right: 0, bottom: 0, left: 0 };
const DEFAULT_ANIMATION: AnimationOptions = { duration: 260, easing: easeOutCubic };
const DEFAULT_HEIGHT = 240;
const MIN_RANGE = 0.02;

export interface DomainState {
  readonly min: Animated;
  readonly max: Animated;
  /** Tick step of the target domain. */
  step: number;
  ticks: number[];
  /** False when no visible series uses this axis. */
  used: boolean;
}

type Listener<K extends keyof ChartEvents> = (payload: ChartEvents[K]) => void;

export class Chart {
  readonly container: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly renderer: Renderer;
  /** Area the series are drawn into, in CSS pixels. */
  readonly plot: Box = { x: 0, y: 0, w: 0, h: 0 };
  readonly rangeFrom = new Animated(0);
  readonly rangeTo = new Animated(1);

  series: SeriesState[] = [];
  /** Full x extent across every series, ignoring visibility. */
  xExtent: readonly [number, number] = [0, 1];
  xScale: Scale = scaleLinear(0, 1, 0, 1);
  stacks: StackMap = new Map();
  hoverIndex = -1;
  hoverSeriesId: string | null = null;
  pointerX = -1;
  pointerY = -1;
  pointerInside = false;

  readonly xAxis: AxisOptions;
  readonly yAxis: AxisOptions;
  readonly y2Axis: AxisOptions;
  readonly padding: Padding;
  readonly animation: AnimationOptions | null;

  private readonly domains: Record<AxisId, DomainState> = {
    y: createDomain(),
    y2: createDomain(),
  };
  private readonly scales: Record<AxisId, Scale> = {
    y: scaleLinear(0, 1, 1, 0),
    y2: scaleLinear(0, 1, 1, 0),
  };
  private readonly plugins: Plugin[];
  private readonly listeners = new Map<keyof ChartEvents, Set<Listener<never>>>();
  private readonly ownsCanvas: boolean;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly themeState: { prev: Theme; next: Theme; mix: Animated };
  /** Set only when the caller pinned a height; otherwise the container rules. */
  private readonly explicitHeight: number | undefined;
  private lastContext: DrawContext | null = null;
  private frameHandle = 0;
  private needsLayout = true;
  private destroyed = false;
  private dragging = false;

  constructor(target: HTMLElement | string, options: ChartOptions) {
    const host = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
    if (!host) throw new Error('nanochart: target element not found');

    if (host instanceof HTMLCanvasElement) {
      this.container = host.parentElement ?? host;
      this.canvas = host;
      this.ownsCanvas = false;
    } else {
      this.container = host;
      this.canvas = document.createElement('canvas');
      this.canvas.style.display = 'block';
      this.canvas.style.width = '100%';
      host.appendChild(this.canvas);
      this.ownsCanvas = true;
    }
    this.canvas.style.touchAction = 'pan-y';
    this.canvas.setAttribute('role', 'img');
    if (options.ariaLabel) this.canvas.setAttribute('aria-label', options.ariaLabel);

    this.renderer = new Renderer(this.canvas);
    this.xAxis = options.x ?? {};
    this.yAxis = options.y ?? {};
    this.y2Axis = options.y2 ?? {};
    this.padding = { ...DEFAULT_PADDING, ...options.padding };
    this.animation =
      options.animation === false ? null : { ...DEFAULT_ANIMATION, ...(options.animation ?? {}) };

    const theme = options.theme ?? telegramLight;
    this.themeState = { prev: theme, next: theme, mix: new Animated(1) };

    if (options.range) {
      this.rangeFrom.jump(clamp(options.range[0], 0, 1));
      this.rangeTo.jump(clamp(options.range[1], 0, 1));
    }

    this.plugins = [...(options.plugins ?? [])];
    this.setSeries(options.series, false);

    this.explicitHeight = options.height;
    this.canvas.style.height = `${this.measuredHeight()}px`;

    for (const plugin of this.plugins) plugin.init?.(this);

    this.attachEvents();
    this.resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.resize());
    this.resizeObserver?.observe(this.container);
    this.resize();
  }

  get theme(): Theme {
    return this.themeState.next;
  }

  get duration(): number {
    return this.animation ? this.animation.duration : 0;
  }

  /** Current visible window as fractions of the full x extent. */
  range(now = performance.now()): [number, number] {
    return [this.rangeFrom.at(now), this.rangeTo.at(now)];
  }

  domain(axis: AxisId): DomainState {
    return this.domains[axis];
  }

  scaleFor(axis: AxisId): Scale {
    return this.scales[axis];
  }

  seriesById(id: string): SeriesState | undefined {
    return this.series.find((s) => s.id === id);
  }

  color(key: ThemeColorKey, now: number): string {
    const { prev, next, mix } = this.themeState;
    const t = mix.at(now);
    return t >= 1 ? next[key] : mixColorStrings(prev[key], next[key], t);
  }

  seriesColor(series: SeriesState, now: number): string {
    const { prev, next, mix } = this.themeState;
    const t = mix.at(now);
    const target = resolveSeriesColor(next, series);
    return t >= 1 ? target : mixColorStrings(resolveSeriesColor(prev, series), target, t);
  }

  font(size: number, weight = 400): string {
    return `${weight} ${size}px ${this.themeState.next.font}`;
  }

  setTheme(theme: Theme, animate = true): void {
    if (theme === this.themeState.next) return;
    const now = performance.now();
    const state = this.themeState;
    const t = state.mix.at(now);
    state.prev = t >= 1 ? state.next : snapshotTheme(state.prev, state.next, t);
    state.next = theme;
    state.mix.jump(0);
    state.mix.set(1, now, animate && this.animation ? this.animation.duration * 1.4 : 0);
    this.emit('themechange', { theme });
    this.invalidate();
  }

  setSeries(list: readonly SeriesOptions[], animate = true): void {
    const previous = new Map(this.series.map((s) => [s.id, s]));
    this.series = list.map((options, index) => {
      const old = previous.get(options.id);
      // Runtime visibility wins over the original option, or every toggle
      // would be undone by the next rebuild. A caller that means to override
      // it says so by passing a `visible` that differs from the old options.
      const stated = options.visible !== undefined && options.visible !== old?.options.visible;
      const visible = stated ? (options.visible as boolean) : old?.visible ?? options.visible ?? true;
      return {
        id: options.id,
        type: options.type,
        options,
        index,
        name: options.name ?? options.id,
        axis: options.axis ?? 'y',
        data: normalizeData(options.data),
        visible,
        alpha: old?.alpha ?? new Animated(visible ? 1 : 0),
      };
    });
    for (const s of this.series) {
      if (!animate) s.alpha.jump(s.visible ? 1 : 0);
      if (!getSeriesRenderer(s.type)) {
        throw new Error(
          `nanochart: no renderer for series type "${s.type}". ` +
            'Register one with registerSeries(), or import from the package entry ' +
            'so the built-in types register themselves.',
        );
      }
    }
    this.updateExtent();
    this.needsLayout = true;
    this.invalidate();
  }

  /**
   * Patches one series in place.
   *
   * Rebuilding the whole list would re-parse every sample of every series, so
   * changing a single colour cost as much as replacing the dataset. Only a
   * change of `type` needs the full path, because the renderer is bound at
   * build time.
   */
  updateSeries(id: string, patch: Partial<SeriesOptions>): void {
    const series = this.seriesById(id);
    if (!series) return;

    if (patch.type !== undefined && patch.type !== series.type) {
      const next = this.series.map((s) => (s.id === id ? { ...s.options, ...patch } : s.options));
      this.setSeries(next);
      return;
    }

    const options = { ...series.options, ...patch };
    (series as { options: SeriesOptions }).options = options;

    if (patch.data !== undefined) {
      series.data = normalizeData(options.data);
      this.updateExtent();
    }
    if (patch.name !== undefined) series.name = options.name ?? id;
    if (patch.axis !== undefined) series.axis = options.axis ?? 'y';

    this.needsLayout = true;
    this.invalidate();
    // Routed through toggle() so the animation and the event still happen.
    if (patch.visible !== undefined) this.toggle(id, patch.visible);
  }

  toggle(id: string, visible?: boolean): void {
    const series = this.seriesById(id);
    if (!series) return;
    const next = visible ?? !series.visible;
    if (next === series.visible) return;
    series.visible = next;
    series.alpha.set(next ? 1 : 0, performance.now(), this.duration);
    this.emit('toggle', { id, visible: next });
    this.invalidate();
  }

  setRange(from: number, to: number, animate = true): void {
    let a = clamp(Math.min(from, to), 0, 1);
    let b = clamp(Math.max(from, to), 0, 1);
    if (b - a < MIN_RANGE) {
      b = Math.min(1, a + MIN_RANGE);
      a = Math.max(0, b - MIN_RANGE);
    }
    if (a === this.rangeFrom.target && b === this.rangeTo.target) return;
    const now = performance.now();
    const duration = animate ? this.duration : 0;
    this.rangeFrom.set(a, now, duration);
    this.rangeTo.set(b, now, duration);
    this.emit('rangechange', { from: a, to: b });
    this.invalidate();
  }

  use(plugin: Plugin): this {
    this.plugins.push(plugin);
    plugin.init?.(this);
    this.needsLayout = true;
    this.invalidate();
    return this;
  }

  on<K extends keyof ChartEvents>(event: K, listener: Listener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => set.delete(listener as Listener<never>);
  }

  emit<K extends keyof ChartEvents>(event: K, payload: ChartEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) (listener as Listener<K>)(payload);
  }

  resize(): void {
    if (this.destroyed) return;
    const width = this.container.clientWidth || this.canvas.clientWidth;
    const height = this.measuredHeight();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (this.renderer.resize(width, height, dpr)) {
      this.needsLayout = true;
      this.render();
    }
  }

  /**
   * Reading the height back off the canvas would only return what was written
   * there once, so an unpinned chart could never follow its container.
   */
  private measuredHeight(): number {
    if (this.explicitHeight !== undefined) return this.explicitHeight;
    return this.container.clientHeight || this.canvas.clientHeight || DEFAULT_HEIGHT;
  }

  invalidate(): void {
    if (this.destroyed || this.frameHandle) return;
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  /** Draws immediately, outside of the animation loop. */
  render(): void {
    if (this.destroyed) return;
    if (this.frameHandle) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = 0;
    }
    this.frame();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    this.resizeObserver?.disconnect();
    this.detachEvents();
    for (const plugin of this.plugins) plugin.destroy?.(this);
    this.listeners.clear();
    if (this.ownsCanvas) {
      this.canvas.remove();
      return;
    }
    // A canvas we were handed goes back the way it came.
    this.renderer.ctx.clearRect(0, 0, this.renderer.width, this.renderer.height);
    this.canvas.removeAttribute('role');
    this.canvas.removeAttribute('aria-label');
    this.canvas.style.touchAction = '';
    this.canvas.style.cursor = '';
  }

  createContext(now: number, box: Box, x: Scale, yScales: Record<AxisId, Scale>, preview: boolean): DrawContext {
    return {
      chart: this,
      r: this.renderer,
      box,
      now,
      x,
      stacks: this.stacks,
      preview,
      scaleFor: (axis) => yScales[axis],
      alphaOf: (series) => series.alpha.at(now),
      colorOf: (series) => this.seriesColor(series, now),
      color: (key) => this.color(key, now),
      font: (size, weight) => this.font(size, weight),
    };
  }

  drawSeries(ctx: DrawContext): void {
    for (const series of this.series) {
      if (ctx.alphaOf(series) <= 0.001) continue;
      getSeriesRenderer(series.type)?.draw(ctx, series);
    }
  }

  /** Index window covering `[from, to]` plus one point on each side. */
  windowIndices(series: SeriesState, from: number, to: number): [number, number] {
    const data = series.data;
    if (data.length === 0) return [0, -1];
    const i0 = Math.max(0, lowerBound(data, from) - 1);
    const i1 = Math.min(data.length - 1, lowerBound(data, to));
    return [i0, i1];
  }

  /** Series used for shared-x hover; the longest visible cartesian one. */
  referenceSeries(): SeriesState | null {
    let best: SeriesState | null = null;
    for (const series of this.series) {
      if (!series.visible) continue;
      if (getSeriesRenderer(series.type)?.cartesian === false) continue;
      if (!best || series.data.length > best.data.length) best = series;
    }
    return best;
  }

  private frame = (): void => {
    this.frameHandle = 0;
    const now = performance.now();
    this.draw(now);
    if (this.isAnimating(now)) this.invalidate();
  };

  private draw(now: number): void {
    const { renderer } = this;
    if (renderer.width <= 0 || renderer.height <= 0) return;
    if (this.needsLayout) this.layout();

    renderer.begin(this.color('background', now));

    const [e0, e1] = this.xExtent;
    const span = e1 - e0 || 1;
    const from = e0 + this.rangeFrom.at(now) * span;
    const to = e0 + this.rangeTo.at(now) * span;
    this.xScale = this.buildScale(this.xAxis, from, to, this.plot.x, this.plot.x + this.plot.w);
    this.stacks = buildStacks(this.series, (s) => s.alpha.at(now));
    this.updateDomains(now, from, to);

    for (const axis of AXES) {
      const domain = this.domains[axis];
      this.scales[axis] = this.buildScale(
        this.axisOptions(axis),
        domain.min.at(now),
        domain.max.at(now),
        this.plot.y + this.plot.h,
        this.plot.y,
      );
    }

    const ctx = this.createContext(now, this.plot, this.xScale, this.scales, false);
    this.lastContext = ctx;

    for (const plugin of this.plugins) plugin.drawUnder?.(ctx);

    renderer.clip({ x: this.plot.x, y: this.plot.y - 8, w: this.plot.w, h: this.plot.h + 16 });
    this.drawSeries(ctx);
    renderer.restore();

    for (const plugin of this.plugins) plugin.drawOver?.(ctx);
  }

  private layout(): void {
    this.needsLayout = false;
    const box: Box = {
      x: this.padding.left,
      y: this.padding.top,
      w: Math.max(1, this.renderer.width - this.padding.left - this.padding.right),
      h: Math.max(1, this.renderer.height - this.padding.top - this.padding.bottom),
    };
    for (let i = this.plugins.length - 1; i >= 0; i--) this.plugins[i].measure?.(this, box);
    this.plot.x = box.x;
    this.plot.y = box.y;
    this.plot.w = Math.max(1, box.w);
    this.plot.h = Math.max(1, box.h);
  }

  private updateExtent(): void {
    let min = Infinity;
    let max = -Infinity;
    for (const series of this.series) {
      const data = series.data;
      if (data.length === 0) continue;
      if (data.x[0] < min) min = data.x[0];
      if (data.x[data.length - 1] > max) max = data.x[data.length - 1];
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      this.xExtent = [0, 1];
      return;
    }
    if (max <= min) {
      // One sample, or many sharing an x. Pad around it rather than replacing
      // it, or the point would be scaled off screen.
      const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.05 : 0.5;
      this.xExtent = [min - pad, min + pad];
      return;
    }
    if (this.xAxis.type === 'category') {
      // One slot per sample, so the first and last need half a slot each.
      const slot = this.categorySlot(min, max);
      this.xExtent = [min - slot / 2, max + slot / 2];
      return;
    }
    // Headroom keeps edge bars and dots from being cut in half.
    const headroom = (this.xAxis.padding ?? 0) * (max - min);
    this.xExtent = [min - headroom, max + headroom];
  }

  /** Width of one category slot, from the longest series on the axis. */
  private categorySlot(min: number, max: number): number {
    let most = 0;
    for (const series of this.series) {
      if (series.data.length > most) most = series.data.length;
    }
    return most > 1 ? (max - min) / (most - 1) : 1;
  }

  /** Raw data extent for an axis over the `[from, to]` x window. */
  measureExtent(axis: AxisId, from: number, to: number): { min: number; max: number; baseline: boolean } | null {
    let min = Infinity;
    let max = -Infinity;
    let baseline = false;
    let found = false;

    for (const series of this.series) {
      if (series.axis !== axis || !series.visible || series.data.length === 0) continue;
      const renderer = getSeriesRenderer(series.type);
      if (!renderer || renderer.cartesian === false) continue;
      if (renderer.baseline) baseline = true;

      const [i0, i1] = this.windowIndices(series, from, to);
      if (i1 < i0) continue;
      const custom = renderer.extent?.(series, i0, i1, this.stacks);
      if (custom) {
        if (custom[0] < min) min = custom[0];
        if (custom[1] > max) max = custom[1];
        found = true;
        continue;
      }
      const stack = this.stacks.get(series.id);
      const column = series.data.y;
      for (let i = i0; i <= i1; i++) {
        // Negative stacks grow downwards, so `top` can sit below `base`.
        // Gaps are NaN, and every comparison against NaN is false, so they
        // drop out of the scan without a branch.
        const a = stack ? stack.base[i] : column[i];
        const b = stack ? stack.top[i] : column[i];
        if (a < min) min = a;
        if (b < min) min = b;
        if (a > max) max = a;
        if (b > max) max = b;
      }
      found = found || Number.isFinite(min);
    }
    return found ? { min, max, baseline } : null;
  }

  /**
   * Applies axis options and snaps the domain so ticks land on round values.
   * `intervals` forces a tick count, which keeps a second axis on the same grid.
   */
  niceDomain(
    options: AxisOptions,
    raw: { min: number; max: number; baseline: boolean },
    intervals?: number,
  ): {
    min: number;
    max: number;
    step: number;
  } {
    const hasMin = options.min !== undefined;
    const hasMax = options.max !== undefined;
    let low = hasMin ? (options.min as number) : raw.min;
    let high = hasMax ? (options.max as number) : raw.max;
    if (options.type !== 'log' && (options.zero ?? raw.baseline) && !hasMin) low = Math.min(0, low);
    if (high <= low) high = low + 1;

    const headroom = options.padding ?? 0;
    if (headroom > 0) {
      const extra = (high - low) * headroom;
      if (!hasMax) high += extra;
      if (!hasMin && low !== 0) low -= extra;
    }

    // Rounding the step up keeps the tick count at or below the requested one,
    // and a forced count must round up or the domain would clip the series.
    const count = intervals ?? options.ticks ?? 5;
    let step = niceStepUp((high - low) / count);
    if (!hasMin) low = Math.floor(low / step + 1e-9) * step;
    if (!hasMax) high = Math.ceil(high / step - 1e-9) * step;

    if (intervals && !hasMax) {
      // Snapping the minimum down can push the maximum past the last tick.
      for (let guard = 0; guard < 16 && low + step * count < high - 1e-9; guard++) {
        step = nextNiceStep(step);
        if (!hasMin) low = Math.floor(low / step + 1e-9) * step;
      }
      high = low + step * count;
    }
    return { min: low, max: high, step };
  }

  axisOptions(axis: AxisId): AxisOptions {
    return axis === 'y' ? this.yAxis : this.y2Axis;
  }

  private buildScale(options: AxisOptions, d0: number, d1: number, r0: number, r1: number): Scale {
    return options.type === 'log' ? scaleLog(d0, d1, r0, r1) : scaleLinear(d0, d1, r0, r1);
  }

  private updateDomains(now: number, from: number, to: number): void {
    const duration = this.duration;
    let intervals: number | undefined;
    for (const axis of AXES) {
      const options = this.axisOptions(axis);
      const domain = this.domains[axis];
      const raw = this.measureExtent(axis, from, to);

      domain.used = raw !== null;
      if (!raw) continue;

      if (options.type === 'log') {
        // Decades are already round numbers, so a log axis neither snaps to a
        // step nor shares a tick count with the other axis.
        const low = options.min ?? niceLogDomain(raw.min, raw.max).min;
        const high = options.max ?? niceLogDomain(raw.min, raw.max).max;
        if (domain.min.target !== low || domain.max.target !== high) {
          domain.step = 0;
          this.setTicks(domain, logTicks(low, high, options.ticks ?? 6));
        }
        domain.min.set(low, now, duration);
        domain.max.set(high, now, duration);
        continue;
      }

      const { min: low, max: high, step } = this.niceDomain(options, raw, intervals);
      intervals ??= Math.max(1, Math.round((high - low) / step));

      if (domain.step !== step || domain.min.target !== low || domain.max.target !== high) {
        domain.step = step;
        this.setTicks(domain, ticksFromStep(low, high, step));
      }
      domain.min.set(low, now, duration);
      domain.max.set(high, now, duration);
    }
  }

  /**
   * A plugin that reserves space for tick labels — a y axis placed outside the
   * plot — cannot measure itself until the ticks exist, and the ticks are only
   * known after layout. Re-running layout when the set changes closes that
   * loop; it settles in a frame, because tick counts do not depend on the
   * gutter they produce.
   */
  private setTicks(domain: DomainState, ticks: number[]): void {
    domain.ticks = ticks;
    this.needsLayout = true;
    this.invalidate();
  }

  private isAnimating(now: number): boolean {
    if (this.themeState.mix.active(now)) return true;
    if (this.rangeFrom.active(now) || this.rangeTo.active(now)) return true;
    for (const axis of AXES) {
      const domain = this.domains[axis];
      if (domain.min.active(now) || domain.max.active(now)) return true;
    }
    for (const series of this.series) {
      if (series.alpha.active(now)) return true;
    }
    for (const plugin of this.plugins) {
      if (plugin.animating?.(this, now)) return true;
    }
    return false;
  }

  private attachEvents(): void {
    const canvas = this.canvas;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
  }

  private detachEvents(): void {
    const canvas = this.canvas;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
  }

  private toState(event: PointerEvent, type: PointerEventState['type']): PointerEventState {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return {
      type,
      x,
      y,
      inside: type !== 'leave' && x >= 0 && y >= 0 && x <= rect.width && y <= rect.height,
      originalEvent: event,
    };
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.dragging = true;
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic or already released pointers cannot be captured.
    }
    this.dispatchPointer(this.toState(event, 'down'));
  };

  private onPointerMove = (event: PointerEvent): void => {
    this.dispatchPointer(this.toState(event, 'move'));
  };

  private onPointerUp = (event: PointerEvent): void => {
    const state = this.toState(event, 'up');
    try {
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore pointers that are no longer active.
    }
    this.dragging = false;
    this.dispatchPointer(state);
    if (state.inside && this.hoverIndex >= 0) {
      this.emit('select', { index: this.hoverIndex, seriesId: this.hoverSeriesId });
    }
  };

  private onPointerLeave = (event: PointerEvent): void => {
    if (this.dragging) return;
    this.dispatchPointer(this.toState(event, 'leave'));
  };

  private dispatchPointer(state: PointerEventState): void {
    this.pointerX = state.x;
    this.pointerY = state.y;
    this.pointerInside = state.inside;
    this.canvas.style.cursor = '';
    let captured = false;
    for (let i = this.plugins.length - 1; i >= 0; i--) {
      if (this.plugins[i].pointer?.(this, state)) {
        captured = true;
        break;
      }
    }
    if (captured) this.setHover(-1, null);
    else this.updateHover(state);
    this.invalidate();
  }

  private updateHover(state: PointerEventState): void {
    if (!state.inside || state.type === 'leave' || !boxContains(this.plot, state.x, state.y)) {
      this.setHover(-1, null);
      return;
    }
    const ctx = this.lastContext;
    if (ctx) {
      for (const series of this.series) {
        const renderer = getSeriesRenderer(series.type);
        if (!renderer?.hit || series.alpha.at(ctx.now) <= 0.01) continue;
        if (renderer.hit(ctx, series, state.x, state.y)) {
          this.setHover(-1, series.id);
          return;
        }
      }
      if (this.series.some((s) => getSeriesRenderer(s.type)?.hit)) {
        this.setHover(-1, null);
        return;
      }
    }
    const reference = this.referenceSeries();
    if (!reference) {
      this.setHover(-1, null);
      return;
    }
    this.setHover(nearestIndex(reference.data, this.xScale.invert(state.x)), null);
  }

  private setHover(index: number, seriesId: string | null): void {
    if (this.hoverIndex === index && this.hoverSeriesId === seriesId) return;
    this.hoverIndex = index;
    this.hoverSeriesId = seriesId;
    this.emit('hover', { index, seriesId });
  }
}

function createDomain(): DomainState {
  return { min: new Animated(0), max: new Animated(1), step: 1, ticks: [], used: false };
}

function resolveSeriesColor(theme: Theme, series: SeriesState): string {
  const explicit = theme.dark ? series.options.colorDark ?? series.options.color : series.options.color;
  return explicit ?? theme.palette[series.index % theme.palette.length];
}

function snapshotTheme(prev: Theme, next: Theme, t: number): Theme {
  // Built by walking the keys rather than naming them, so a theme carrying its
  // own colours cross-fades too, and adding a key to `Theme` cannot be
  // forgotten here.
  const out: Record<string, unknown> = { ...next };
  for (const key of Object.keys(next) as (keyof Theme)[]) {
    const a = prev[key];
    const b = next[key];
    if (typeof b === 'string' && typeof a === 'string' && key !== 'name' && key !== 'font') {
      out[key] = mixColorStrings(a, b, t);
    }
  }
  out.dark = t >= 0.5 ? next.dark : prev.dark;
  out.palette = next.palette.map((color, i) =>
    mixColorStrings(prev.palette[i % prev.palette.length], color, t),
  );
  return out as unknown as Theme;
}
