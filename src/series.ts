/**
 * The built-in series renderers, none of them registered.
 *
 * `registerSeries` from `nanochart.js/core` takes the ones a page draws; the
 * package entry registers all six.
 */
export { area, line } from './series/lineArea.js';
export { bar } from './series/bar.js';
export { candlestick } from './series/candlestick.js';
export { pie } from './series/pie.js';
export { scatter } from './series/scatter.js';
