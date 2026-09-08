# Changelog

## 0.2.0 — 2026-09-08

Everything a full review of the library turned up, in three parts: the four
findings that broke a first real page (#65), the seven visible defects (#66)
and the eleven polish items (#67).

### Added

- `nanochart.js/core`, `nanochart.js/series` and `nanochart.js/plugins`: the
  chart, the renderers and the plugins as entries that register nothing, for
  a page that wants only the series types it draws. The package entry still
  registers all six, which is why every import from it carries them; `./core`
  used to point at the chart module alone.
- `tooltip({ formatTotal })`. Without it the total row goes through `format`,
  given the sum and the series under the pointer.
- `onChart` in the Svelte action's options. The action was the one wrapper
  with no way to reach the chart.
- `yAxis({ backdrop })`: a wash of the background behind each overlaid label,
  so a muted label reads on top of the first bar or a filled area. On unless
  the labels have a `color` of their own, which was chosen against the fill;
  an `outside` axis has nothing behind its labels.
- `reference` on `hover` and `select`: the id of the series `index` counts
  into. Two series on their own x grids both number their first sample 0, so
  an index alone left a listener reaching into `chart.hoverReference`.
- `min`, `max`, `zero` and `ticks` on the `x` axis options, which the type
  offered and the extent ignored. A pinned bound is where the axis ends,
  headroom and all; `ticks` replaces the count `xAxis({ spacing })` derives
  from the width.
- `readableOn(color)`: black or white, whichever reads on a fill.

### Changed

- A container's padding no longer counts as room for an unpinned chart: the
  canvas takes the container's content height, which is the space it can
  occupy.
- The framework wrappers rebuild the chart when an option it reads once
  changes — `x`, `y`, `y2`, `plugins`, `padding`, `animation`, `locale`,
  `timeZone`, `minSpan`, `ariaLabel` — where they used to ignore the change.
  React's `onChart`, Vue's `ready` and the Svelte action's `onChart` report
  the new chart. A plugin is known by its name, so a list rebuilt from the
  same plugins on every render is the same list. A series is patched with the
  fields that changed, so a colour change no longer parses its samples again.
- A pie labels a slice in white or in dark, whichever reads on its fill; the
  label was always white, and "12%" on the yellow of either palette was hard
  to read.

### Fixed

- The tooltip's total row ignoring `format`: "Profit $820, Loss $0, Net 820".
- Stacked areas tracing their lower edge with straight chords whatever the
  `curve`, which left slivers of background between smooth or stepped layers
  wherever a chord ran above the curve. The base follows the curve of the top
  it retraces.
- The scrubber's preview drawing a log axis on a linear scale, with everything
  below the top decade flattened along the bottom.
- Day ticks drifting an hour off midnight after a DST change, and the day
  marker on an intraday axis disappearing past it. Days and longer step from
  one midnight to the next; a sub-day step re-anchors on the midnight it
  crosses. `Formats.startOfDay` remembers its answers, since a time axis asks
  for the same midnights on every frame.
- A series appended to in place — a Vue array pushed to — not reaching the
  chart through a wrapper, because `data` was compared by identity alone. Its
  length counts too now.
- The renderer's font cache going stale across `save()` and `restore()`. A raw
  restore put the old font back without the cache knowing, and the next text
  asking for the new one was drawn in the old. The renderer's own `save()` and
  `restore()` keep the record in step, it starts every frame afresh, and the
  pie draws its labels through them.
- `yAxis({ placement: 'outside' })` reserving its gutter only from the second
  frame: the ticks were known only after layout, so the opening frame drew
  the plot across the whole width with the labels off the canvas, and the
  next one shifted it right. The domains are settled before layout now, and
  the frame that changes a tick set is the frame that lays out for it.
- A change of tick set fading the whole axis rather than the labels that
  changed. Drawn as two whole sets, one over the other, a label in both was
  painted twice and read at 75% in the middle of the fade, so the axis took a
  breath each time a label came into the window. It fades tick by tick.
- `Formats.addMonths` running past the end of a shorter month: 31 January
  plus a month was 3 March. It is held inside the month it lands in.
- `updateSeries` with shorter data leaving the hover past the end of it, so a
  `hover` listener reading the column by that index was handed undefined.
- Grouped bars jumping to their new width the moment a series was toggled,
  while it was still fading beside them. A slot is as wide as its series is
  opaque, so it closes with the fade and the neighbours widen with it.
- `formatCompact` past the last unit: 1e18 came out as "1000000T", and a
  volume in satoshi or wei gets there. It reads "1e18", and tick labels that
  far out keep their precision from the step as everywhere else.

- The framework wrappers building a chart with no series types registered.
  `nanochart.js/react`, `/vue` and `/svelte` load the shared controller and
  nothing else, and the built-in types registered themselves only from the
  package entry, so a page that imported nothing but a wrapper threw "no
  renderer for series type" on its first series. The controller loads the
  entry now, and a test imports each wrapper into an otherwise empty module
  graph.
- An unpinned chart growing without end in a container with no height of its
  own. The canvas sits inside the container it measures, so a container sized
  by its content — padding, a caption beside the canvas — was sized by the
  canvas: reading that height back and writing it to the canvas grew the
  container by its padding, the `ResizeObserver` reported the growth, and the
  loop ran until the tab gave out. The canvas is collapsed for the measurement
  now, which tells a container with a height of its own from one that was
  following the canvas; the latter gets the default height.
- `select` firing at the end of a drag pan, and never for a pie slice. A
  release is a click only when no plugin captured a move of the press, and a
  slice has no index, so a pie reports `{ index: -1, seriesId }`.
- A cancelled pointer — a touch the browser took for scrolling — arriving as a
  release, so a finger that landed on a legend pill and scrolled toggled the
  series, and one that landed on the plot could select a point. It is a leave
  now: nothing is under the pointer, and nothing was chosen.
- The legend toggling on any release over a pill, wherever the press began. A
  toggle is a press and a release on the same pill.

## 0.1.0 — 2026-08-26

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
- Every tick on an axis finer than a millionth drawing as a bare `0`. The
  precision came from counting the digits of the step as `toPrecision` renders
  it, and that switches to exponential notation below 1e-6, so the exponent of
  `1.00000000000e-7` was read as decimals. It landed on 6, which was also the
  cap, and `toFixed(6)` of 2e-7 is `0.000000`. Precision is read off the
  exponent now.
- The `a11y()` data table pairing series row by row, which put numbers side by
  side that never occurred together whenever two series sat on their own x
  grids — under an x taken from a third. It matches by x value now, the way the
  tooltip does. A reader of the table cannot see that mispaired numbers do not
  belong, which is the whole reason the table is there.
