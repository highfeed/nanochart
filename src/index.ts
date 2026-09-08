export * from './core.js';
export * from './series.js';
export * from './plugins.js';

import { registerSeries } from './core/registry.js';
import { area, bar, candlestick, line, pie, scatter } from './series.js';

// Registered here, at the package entry, so a chart draws with nothing else
// set up. It is also why every import from this entry carries all six types:
// these calls reference them, and `sideEffects` in package.json keeps the
// calls. A page that wants only what it draws imports from `nanochart.js/core`,
// `/series` and `/plugins` instead, and registers the renderers itself.
registerSeries(line);
registerSeries(area);
registerSeries(bar);
registerSeries(pie);
registerSeries(candlestick);
registerSeries(scatter);
