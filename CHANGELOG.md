# Changelog

## Unreleased

First public release. Everything below is relative to the unreleased state the
project was in before it had tests or a repository.

### Added

- Logarithmic and category axes (`type: 'log'`, `type: 'category'`).
- `locale` and `timeZone` — tick and tooltip formatting through `Intl`, with day
  and month ticks anchored to midnight in the chart's zone rather than the
  host's.
- `zoom()` plugin: wheel zoom anchored on the cursor, drag panning, optional
  modifier key.
- `a11y()` plugin: a visually hidden data table and keyboard navigation.
- React, Vue and Svelte wrappers at `nanochart.js/react`, `/vue`, `/svelte`.
- `yAxis({ placement: 'outside' })` — a gutter sized to the widest label.
- Legend `position`, `orientation`, `align` and `filter`.
- `chart.setHeight()`, `chart.minSpan`, `chart.formats`.
- `SeriesRenderer.slot()` — a renderer that draws a slot around each sample
  reports its width, and the x domain leaves room for it.
- `createFormats(locale, timeZone)` — the same formatters a chart builds, for
  `title` and `format` callbacks that are written before the chart exists.
- Gaps: `null`, `undefined` and non-finite values break lines, split area fills
  and drop out of tooltips and axis domains.

### Changed

- **Breaking.** Samples are stored columnar. `series.points` is now
  `series.data`, holding parallel `Float64Array`s; `normalizePoints` is
  `normalizeData`; `nearestIndex` and `lowerBound` take `SeriesData`.
- Decimation keeps the first, last, lowest and highest sample of each pixel
  column instead of every Nth sample, and now applies to every series type.
  A one-sample spike survives where it used to vanish.
- `updateSeries` patches in place instead of rebuilding every series.
- The theme cross-fade walks the theme's keys, so custom colour keys animate.

### Fixed

- Series registration dropped by Rollup and `vite build` under
  `sideEffects: false`, which left charts drawing nothing at all, silently.
- `hsl()` colours read as if they were `rgb()`; named colours resolving to
  transparent, which made them vanish during theme cross-fades.
- `toggle()` undone by any later `updateSeries`.
- Charts not following their container's height.
- Single-point series scaled off screen.
- Normalized stacks collapsing when a column's signed sum was zero.
- `formatGrouped` producing wrong digits past 1e21.
- Unregistered series types drawing nothing instead of raising.
- `destroy()` leaving attributes, styles and pixels on a borrowed canvas.
- Bars and candles losing their outer half at the ends of a time or linear
  axis. A bar is centred on its sample, and the domain used to end on the last
  sample, so the first and the last one were clipped at the edge of the plot
  unless the caller knew to set `x.padding`. The domain now leaves half a bar
  at each end, measured from the data, the way a category axis already left
  half a slot. An explicit `x.padding` still wins where it is larger.
- A bare `null` among `[x, y]` pairs or `{ x, y }` objects taking its index as
  an x, which placed the gap at the epoch on a time axis and stretched the
  domain across every year in between. Such a sample now takes its position
  from the samples it sits between — on a regular grid, the missing slot
  itself — so it breaks the line where it stands without reaching past the
  data; one at either end settles onto its neighbour. A `null` in a flat array
  still belongs at its index, which is a position there. A sample whose own x
  is unusable settles the same way and loses its value with it: a number with
  nowhere to go is not a reading.
- A hover surviving `setSeries` and drawing samples from the discarded series;
  it now follows the series by id, or ends when that series is gone.
- `hover` events swallowed when the pointer moved between two series that
  number the sample under it the same. The hovered series is part of the
  identity of a hover, and listeners read it from `chart.hoverReference`.
- A hover landing on a gap, which stroked a crosshair over a tooltip that never
  drew. A series with a value at the pointer wins, and when none has one the
  pointer reports nothing.
- Arrow keys walking the longest series rather than the one the mouse hovered,
  which put shorter series out of reach of the keyboard.
- `a11y()` ringing every chart a mouse clicked on, and leaving the ring behind
  after focus moved away. It no longer paints one at all: the canvas is a focus
  stop, and the browser's own `:focus-visible` indicator marks it, which a page
  can restyle like any other control's.
- A colour in a modern CSS space — `oklch()`, `lab()`, `color()`, `color-mix()`
  — overflowing the stack. Such a colour has no sRGB spelling, so the canvas
  hands it back verbatim rather than as hex, and the parser fed it to itself
  until the stack gave out. Anything the round trip cannot resolve is now
  painted and read back off the pixel.
- A `locale` whose digits are not Latin (`ar-EG`, `fa-IR`, `bn-BD`, `my-MM`) or
  whose calendar is not Gregorian (`th-TH`) throwing `RangeError` in the middle
  of a frame. The wall clock a tick anchor is built from is arithmetic rather
  than something a reader sees, so it is now read in Latin digits on the
  Gregorian calendar; labels keep the locale's own.
- A gap in a candlestick series reading as a candle at zero, which pulled the
  whole price axis down to meet it. The OHLC columns start out as gaps rather
  than zeros, so a hole — or a plain `{ x, y }` sitting among candles — carries
  no price.
- Framework wrappers ignoring an options object that was edited in place, which
  is exactly what the Vue binding's deep watch hands back: the diff held the
  caller's object and compared each field against itself. It now keeps its own
  snapshot of the fields it reads, and compares series field by field.
- Everything past a gap dropping out of the visible window, and hovers near one
  landing on the wrong sample. `lowerBound` binary-searches the x column, and a
  positionless gap used to sit in that column as a NaN: `x[mid] < value` is
  false for a NaN, so the search took the wrong half. Positions are finite
  throughout now, which is what a binary search needs.
- A tooltip beside a gap admitting rows from series at a completely different
  x, because the step it measures its reach against was NaN for the same
  reason.
