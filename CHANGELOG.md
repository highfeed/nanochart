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
