# nanochart

[![CI](https://github.com/highfeed/nanochart/actions/workflows/ci.yml/badge.svg)](https://github.com/highfeed/nanochart/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/nanochart.js.svg)](https://www.npmjs.com/package/nanochart.js)
[![gzip](https://img.shields.io/badge/gzip-15.3%20kB-brightgreen.svg)](#performance-notes)

Tiny canvas charting library with a plugin core and Telegram-style day/night themes.

- **15.3 kB gzip** for a line chart with axes and a tooltip; 18.9 kB for all six
  series types plus every plugin — unused ones tree-shake away
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

### Axes

```js
x: { type: 'time' }                              // timestamps
x: { type: 'category', categories: ['Mon', ...] } // one slot per sample
y: { type: 'log' }                                // orders of magnitude
y: { type: 'linear', min: 0, max: 100 }
```

```js
new Chart('#chart', { locale: 'de-DE', timeZone: 'UTC', ... });
```

Tick and tooltip formatting goes through `Intl`, so month names, weekday names,
number grouping and decimal separators follow `locale`, and day and month ticks
anchor to midnight in `timeZone` rather than on the machine drawing the chart.
Both default to the host. `chart.formats` exposes the same formatters if you
need them in a custom `format` callback, and `createFormats(locale, timeZone)`
builds a set before the chart exists — a tooltip `title` is passed in the
options, so it has no chart to read yet, and the standalone `formatDate`,
`formatTime` and `formatMonth` helpers always use the host zone.

A `log` axis ticks whole decades, adds 2s and 5s when there is room, takes each
label's precision from its own magnitude, and never has zero forced into it — not
even by a bar or area series. A `category` axis leaves half a slot at each end so
edge bars are whole.

| Type | Options | Notes |
| --- | --- | --- |
| `line` | `lineWidth`, `curve`, `dash` | `curve` is `linear`, `smooth` or `step` |
| `area` | `fillOpacity`, `curve` | Stack with `stack: 'id'`, add `normalize: true` for 100% stacks |
| `bar` | `barWidth`, `stack` | Bars sharing a `stack` are stacked, the rest are grouped |
| `candlestick` | `barWidth`, `upColor`, `downColor` | Data is `{ x, open, high, low, close }` |
| `scatter` | `radius`, `fillOpacity` | Dots, for correlations and distributions |
| `pie` | `innerRadius` | One series per slice, so the legend toggles slices |

Every series takes `color`, `colorDark` (used while a dark theme is active), `axis`
(`'y'` or `'y2'`) and `visible`. Colors accept hex, `rgb()`, `hsl()` and the basic
CSS keywords everywhere; anything more exotic is resolved by the browser.

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
yAxis({ placement: 'outside' });              // gutter beside the plot, sized to fit
xAxis({ height: 26, spacing: 78, suffix: '%' });
tooltip({ total: true, format: (value, series, index) => `$${value}` });
legend({ position: 'top', align: 'center' });
legend({ orientation: 'vertical', filter: (s) => s.axis === 'y' });
rangeSelector({ height: 44, minSpan: 0.06 });
zoom();                                       // wheel to zoom, drag to pan
zoom({ modifier: 'ctrl', drag: false });      // ctrl+wheel only, no panning
a11y({ summary: 'Revenue by day' });          // keyboard nav + hidden data table
```

Tick labels pick their own unit and precision from the axis step, so `$67.5K` and
`$68K` never collapse into the same label. Two y axes are automatically put on the
same grid lines.

By default the y axis draws over the plot, Telegram style. `placement: 'outside'`
reserves a gutter instead, measured against the widest label the current domain
produces, which is what wide labels and conventional layouts want.

`zoom` anchors on the value under the cursor, so the point you are pointing at
stays put. It captures the pointer only once a drag actually moves, so a click
still hovers. `chart.minSpan` is the floor for how far in anything can zoom —
the scrubber and `zoom` can raise it, never lower it.

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

`examples/annotations.js` is a plugin that does something: horizontal thresholds and
vertical bands, placed by the scales of the frame being drawn and painted in the theme's
colours at that instant, so they follow an animating domain and cross-fade with a theme
switch — which is the reason to draw an annotation on the canvas rather than position a
div over it.

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

## Accessibility

A canvas is opaque to assistive technology: `role="img"` and a label say that a
picture exists, not what is in it. The `a11y` plugin fixes both halves of that.

```js
plugins: [tooltip(), a11y({ summary: 'Revenue by day' })]
```

It renders the data as a visually hidden `<table>` beside the canvas — real
numbers, one column per series, formatted through the chart's locale — and
points the canvas at it with `aria-describedby`. It also makes the chart a focus
stop, so <kbd>←</kbd> and <kbd>→</kbd> walk the points with the tooltip
following, <kbd>Home</kbd> and <kbd>End</kbd> jump to the ends, and
<kbd>Esc</kbd> clears. Long series are capped at `maxRows` with the total noted
in the caption.

The focus itself is marked by the browser, not painted on the canvas, so it
matches the rest of the page and answers to CSS:

```css
.chart canvas:focus-visible { outline: 2px solid #3390ec; outline-offset: 2px; }
```

## Framework wrappers

Thin bindings over the same core, in their own entry points so the plain
library is untouched. `react` and `vue` are optional peers.

```jsx
import { NanoChart } from 'nanochart.js/react';

<NanoChart series={series} theme={theme} onChart={setChart} />
```

```vue
<script setup>
import { NanoChart } from 'nanochart.js/vue';
</script>

<template><NanoChart :options="options" @ready="onReady" /></template>
```

```svelte
<script>
  import { nanochart } from 'nanochart.js/svelte';
</script>

<div use:nanochart={options} />
```

All three share `ChartController`, which works out the narrowest update for
whatever changed: a new theme cross-fades, a changed series is patched rather
than replacing the list, and identical options do nothing at all. A wrapper is
handed a whole options object on every render, so treating that as "replace
everything" would restart every animation on an unrelated prop change.

## Themes

`telegramLight` and `telegramDark` ship with the library; `createTheme(base, overrides)`
derives new ones. `chart.setTheme(theme)` cross-fades every color, including the palette
and any extra color keys your own theme adds, instead of snapping.

```js
chart.setTheme(dark ? telegramDark : telegramLight);
```

A theme is a flat map of colors plus a `palette` array and a `dark` flag, so a brand theme
is a dozen lines. `positive` and `negative` drive candles and any gain/loss coloring.

## API

```ts
chart.setTheme(theme, animate?)         // animated theme cross-fade
chart.setSeries(series, animate?)       // replace the whole dataset
chart.updateSeries(id, patch)           // patch one series, in place
chart.toggle(id, visible?)              // show or hide with animation
chart.setRange(from, to, animate?)      // visible window, 0..1 of the full extent
chart.range()                           // current window
chart.setHeight(height?)                // pin the height, or omit to follow the container
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
- `examples/crypto.html` — an exchange dashboard: a tape streaming a trade a second
  through `updateSeries`, price and volume sharing one window over `rangechange`, a
  headline price above the canvas driven by `hover`, candles, order book depth, diverging
  P&L bars, 100% stacked areas, a logarithmic latency axis, a categorical axis, an axis in
  its own gutter, a series with a collection gap, ctrl+wheel zoom, keyboard navigation, a
  custom heatmap series and a custom annotation plugin.

`npm run check:examples` loads both pages headlessly and fails if anything throws or a
chart never gets a canvas. CI runs it, and so does the Pages deploy — the examples are
the only end-to-end use of the public API.

## License

MIT
