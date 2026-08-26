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
  niceStep,
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

export { createTheme, telegramDark, telegramLight } from './themes/telegram.js';

import { registerSeries } from './core/registry.js';
import { bar } from './series/bar.js';
import { candlestick } from './series/candlestick.js';
import { area, line } from './series/lineArea.js';
import { pie } from './series/pie.js';
import { scatter } from './series/scatter.js';

export { area, bar, candlestick, line, pie, scatter };
export { stepPixels } from './core/geometry.js';
export { xAxis, yAxis, type XAxisOptions, type YAxisOptions } from './plugins/axes.js';
export { legend, type LegendOptions } from './plugins/legend.js';
export { tooltip, type TooltipOptions } from './plugins/tooltip.js';
export { rangeSelector, type RangeSelectorOptions } from './plugins/rangeSelector.js';
export { zoom, type ZoomOptions } from './plugins/zoom.js';
export { a11y, type A11yOptions } from './plugins/a11y.js';

registerSeries(line);
registerSeries(area);
registerSeries(bar);
registerSeries(pie);
registerSeries(candlestick);
registerSeries(scatter);
