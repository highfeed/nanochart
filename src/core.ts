/**
 * The chart, with no series type registered.
 *
 * The package entry registers the six built-in types as a side effect, which
 * is what lets a chart draw with nothing else set up — and what makes a
 * bundler keep all six for every import from it. A page that wants only what
 * it draws imports the chart from here, the renderers it needs from
 * `nanochart.js/series`, its plugins from `nanochart.js/plugins`, and registers
 * the renderers itself. Nothing in the three entries has a side effect, so the
 * rest is never bundled.
 */
export type * from './core/types.js';
export { Chart, type DomainState } from './core/chart.js';
export {
  emptyData,
  lowerBound,
  nearestIndex,
  normalizeData,
  pointAt,
  type SeriesData,
} from './core/data.js';
export { createFormats, type Formats } from './core/intl.js';
export { Renderer, type TextStyle } from './core/renderer.js';
export { getSeriesRenderer, registerSeries } from './core/registry.js';
export { Animated, easeInOutCubic, easeLinear, easeOutCubic, easeOutQuint, type Easing } from './core/animate.js';
export { mixColorStrings, parseColor, rgbaToString, withAlpha, type RGBA } from './core/color.js';
export {
  linearTicks,
  logTicks,
  niceLogDomain,
  scaleLinear,
  scaleLog,
  ticksFromStep,
  timeTicks,
  type Scale,
} from './core/scale.js';
export {
  clamp,
  formatCompact,
  formatDate,
  formatDay,
  formatGrouped,
  formatLog,
  formatMonth,
  formatPercent,
  formatTime,
  lerp,
} from './core/utils.js';
export { stepPixels } from './core/geometry.js';
export { createTheme, telegramDark, telegramLight } from './themes/telegram.js';
