# nanochart

[![CI](https://github.com/highfeed/nanochart/actions/workflows/ci.yml/badge.svg)](https://github.com/highfeed/nanochart/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/nanochart.js.svg)](https://www.npmjs.com/package/nanochart.js)
[![gzip](https://img.shields.io/badge/gzip-14.7%20kB-brightgreen.svg)](#performance-notes)

Tiny canvas charting library with a plugin core and Telegram-style day/night themes.

- **14.7 kB gzip** for everything: 6 series types, axes, legend, tooltip and a range scrubber
- **Zero runtime dependencies**, single `<canvas>`, no DOM overlays
- **Everything animates**: y-axis rescaling, series toggling, zooming and theme switching
- **Plugin core**: axes, legend, tooltip and scrubber are plugins, and so is anything you add
- Written in strict TypeScript, shipped as ESM with type declarations

## Install

```bash
npm install nanochart.js
```

> The npm package is `nanochart.js` — the bare `nanochart` name was taken by an
> unrelated placeholder. Everything else, including the import name, is unchanged.

Or drop the global build into a page:

```html
<script src="nanochart.global.js"></script>
```

## Quick start

```js
import { Chart, legend, rangeSelector, telegramLight, tooltip, xAxis, yAxis } from 'nanochart';

const chart = new Chart('#followers', {
  theme: telegramLight,
  height: 320,
  x: { type: 'time' },
  range: [0.6, 1],
  series: [
    { id: 'joined', type: 'line', name: 'Joined', color: '#4bd964', data: joined },
    { id: 'left', type: 'line', name: 'Left', color: '#fe3c30', data: left },
  ],
  plugins: [yAxis(), xAxis(), tooltip(), rangeSelector(), legend()],
});
```

`data` accepts `[5, 7, 3]`, `[[timestamp, value], ...]` or `[{ x, y }, ...]`.
`null`, `undefined` and any non-finite number mark a gap: the line breaks there,
the fill splits, and the point drops out of the tooltip and the axis domain.

## Series types

| Type | Options | Notes |
| --- | --- | --- |
| `line` | `lineWidth`, `curve`, `dash` | `curve` is `linear`, `smooth` or `step` |
| `area` | `fillOpacity`, `curve` | Stack with `stack: 'id'`, add `normalize: true` for 100% stacks |
| `bar` | `barWidth`, `stack` | Bars sharing a `stack` are stacked, the rest are grouped |
| `candlestick` | `barWidth`, `upColor`, `downColor` | Data is `{ x, open, high, low, close }` |
| `scatter` | `radius`, `fillOpacity` | Dots, for correlations and distributions |
| `pie` | `innerRadius` | One series per slice, so the legend toggles slices |

Every series takes `color`, `colorDark` (used while a dark theme is active), `axis`
(`'y'` or `'y2'`) and `visible`.

Negative values in a stack grow downwards from zero, so a pair of series makes a
diverging bar chart:

```js
series: [
  { id: 'profit', type: 'bar', name: 'Profit', stack: 'pnl', data: profit },
  { id: 'loss', type: 'bar', name: 'Loss', stack: 'pnl', data: loss },  // negative values
];
```

## Plugins

```js
yAxis({ prefix: '$' });                       // 67.5K -> $67.5K, -500 -> -$500
yAxis({ axis: 'y2', tinted: true });          // right axis, tinted with its series color
yAxis({ labelPosition: 'inside', color: '#fff' }); // labels on top of filled areas
xAxis({ height: 26, spacing: 78, suffix: '%' });
tooltip({ total: true, format: (value, series, index) => `$${value}` });
legend({ itemHeight: 30 });
rangeSelector({ height: 44, minSpan: 0.06 });
```

Tick labels pick their own unit and precision from the axis step, so `$67.5K` and
`$68K` never collapse into the same label. Two y axes are automatically put on the
same grid lines.

Plugins are drawn in list order and reserve screen space in reverse order, so the last
plugin in the array sits closest to the canvas edge. A plugin is a plain object:

```js
const watermark = {
  name: 'watermark',
  measure(chart, box) { box.h -= 20; },        // reserve space
  drawUnder(ctx) { /* painted below the series */ },
  drawOver(ctx) { /* painted above the series */ },
  pointer(chart, event) { return false; },      // return true to capture the event
  animating(chart, now) { return false; },      // keeps the render loop alive
};
```

Custom series types work the same way:

```js
import { registerSeries } from 'nanochart.js';

registerSeries({
  type: 'dots',
  draw(ctx, series) {
    const y = ctx.scaleFor(series.axis);
    const { x, y: values, length } = series.data;
    for (let i = 0; i < length; i++) {
      if (!Number.isFinite(values[i])) continue;   // a gap
      ctx.r.circle(ctx.x.map(x[i]), y.map(values[i]), 3, ctx.colorOf(series));
    }
  },
});
```

Samples are stored columnar — `series.data` holds parallel `Float64Array`s
(`x`, `y`, and `open`/`high`/`low`/`close` for OHLC input) rather than one
object per point. `pointAt(series.data, i)` materializes a single `{ x, y }`
when an object is more convenient than the columns.

## Themes

`telegramLight` and `telegramDark` ship with the library; `createTheme(base, overrides)`
derives new ones. `chart.setTheme(theme)` cross-fades every color, including the palette,
instead of snapping.

```js
chart.setTheme(dark ? telegramDark : telegramLight);
```

A theme is a flat map of colors plus a `palette` array and a `dark` flag, so a brand theme
is a dozen lines. `positive` and `negative` drive candles and any gain/loss coloring.

## API

```ts
chart.setTheme(theme, animate?)         // animated theme cross-fade
chart.setSeries(series, animate?)       // replace the whole dataset
chart.updateSeries(id, patch)           // patch one series
chart.toggle(id, visible?)              // show or hide with animation
chart.setRange(from, to, animate?)      // visible window, 0..1 of the full extent
chart.range()                           // current window
chart.resize()                          // usually handled by ResizeObserver
chart.render()                          // force a synchronous frame
chart.destroy()
chart.on('hover' | 'select' | 'rangechange' | 'toggle' | 'themechange', handler)
```

## Performance notes

- One canvas per chart, one `requestAnimationFrame` loop that stops when nothing animates.
- Samples live in typed-array columns, so a million points cost a million
  numbers rather than a million objects.
- Every series type decimates. Lines and areas keep the first, last, lowest and
  highest sample of each pixel column, so a one-sample spike survives instead of
  being skipped; bars, candles and dots collapse per column the same way.
- Bars are batched into a single path per series.
- Text metrics are cached, colors are parsed once per string, and the minimum x
  step of a series is computed once rather than per frame.

## Examples

```bash
npm install
npm start          # builds and serves on http://localhost:4173
```

- `examples/index.html` — the basics: lines, bars, stacked areas, dual axes and a donut.
- `examples/crypto.html` — an exchange dashboard with 27 charts: hourly, daily, monthly
  and yearly data, candles, order book depth, diverging P&L bars, retention, latency
  percentiles and a custom heatmap series.

## License

MIT
