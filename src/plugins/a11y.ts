import type { Chart } from '../core/chart.js';
import type { Plugin, SeriesState } from '../core/types.js';

export interface A11yOptions {
  /**
   * Render a visually hidden table of the data next to the canvas. This is the
   * accessible representation of the chart; screen readers get real numbers
   * rather than a description of a picture. Defaults to true.
   */
  table?: boolean;
  /** Move between points with the arrow keys. Defaults to true. */
  keyboard?: boolean;
  /** Caption for the table and the canvas label. */
  summary?: string;
  /** Formats an x value for the table. Defaults to the chart's formats. */
  formatX?: (value: number) => string;
  /** Formats a y value for the table. Defaults to the chart's formats. */
  formatY?: (value: number, series: SeriesState) => string;
  /** Largest number of rows to render. Defaults to 400. */
  maxRows?: number;
}

let tableId = 0;

/**
 * Whether a focus ring belongs on screen.
 *
 * `document.activeElement` answers a different question: it is the canvas
 * whenever the canvas has focus, and a click gives it focus, so a ring came up
 * around every chart anyone clicked on. `:focus-visible` is the browser's own
 * heuristic for the question actually being asked — false for a pointer, true
 * for Tab, and true from the first key pressed on an element the mouse
 * focused, which is exactly when the arrow keys start moving the tooltip.
 */
const focusVisible = (canvas: HTMLCanvasElement): boolean => {
  if (canvas !== document.activeElement) return false;
  try {
    return canvas.matches(':focus-visible');
  } catch {
    // An engine old enough to reject the selector throws on it. Plain focus is
    // the best answer left, and a ring too often beats a focus stop with none.
    return true;
  }
};

const HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;' +
  'clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0';

/** Series names and formatted values are caller data, so they are escaped. */
const escape = (text: string): string =>
  text.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));

/**
 * Makes a canvas chart usable without sight or a mouse.
 *
 * A canvas is opaque to assistive technology — `role="img"` and a label say
 * that a picture exists, not what is in it. This plugin does two things: it
 * puts the numbers in the DOM as a table only screen readers see, and it makes
 * the chart focusable so the tooltip can be driven from the keyboard.
 */
export function a11y(options: A11yOptions = {}): Plugin {
  const wantTable = options.table ?? true;
  const wantKeyboard = options.keyboard ?? true;
  const maxRows = options.maxRows ?? 400;

  let table: HTMLElement | null = null;
  let host: Chart | null = null;
  /** Data columns the rendered table was built from, to detect changes. */
  let built: unknown[] = [];

  const onKeyDown = (event: KeyboardEvent): void => {
    const chart = host;
    if (!chart) return;
    // The mouse points the hover at the series under it, which is not always
    // the longest one. Taking the keys back to `referenceSeries()` would jump
    // the tooltip to an unrelated series mid-walk, and would leave the shorter
    // series unreachable from the keyboard.
    const reference = chart.hoverReference ?? chart.referenceSeries();
    if (!reference || reference.data.length === 0) return;

    const last = reference.data.length - 1;
    const current = chart.hoverIndex;
    let next = current;

    switch (event.key) {
      case 'ArrowRight': next = current < 0 ? 0 : Math.min(last, current + 1); break;
      case 'ArrowLeft': next = current < 0 ? last : Math.max(0, current - 1); break;
      case 'Home': next = 0; break;
      case 'End': next = last; break;
      case 'Escape': next = -1; break;
      default: return;
    }
    event.preventDefault();

    chart.hoverIndex = next;
    chart.hoverSeriesId = null;
    // Keep the tooltip reading the same series the keys are walking.
    chart.hoverReference = next < 0 ? null : reference;
    // The tooltip positions itself from the pointer, which has not moved.
    chart.pointerX = next < 0 ? -1 : chart.xScale.map(reference.data.x[next]);
    chart.pointerY = chart.plot.y + chart.plot.h / 2;
    chart.pointerInside = next >= 0;
    chart.emit('hover', { index: next, seriesId: null });
    chart.invalidate();
  };

  // Focus draws nothing by itself, so the ring would wait for whatever frame
  // came next — a hover, a resize, an animation — and on a chart at rest that
  // is never. Tabbing away leaves the ring on the canvas the same way.
  const onFocusChange = (): void => {
    host?.invalidate();
  };

  /** True when the series or their samples differ from what the table holds. */
  const changed = (chart: Chart): boolean => {
    const current = chart.series.map((s) => s.data);
    if (current.length !== built.length) return true;
    for (let i = 0; i < current.length; i++) {
      if (current[i] !== built[i]) return true;
    }
    return false;
  };

  const render = (chart: Chart): void => {
    if (!table || !changed(chart)) return;
    built = chart.series.map((s) => s.data);

    const formatX = options.formatX ?? ((value: number) =>
      chart.xAxis.type === 'time' ? chart.formats.date(value) : chart.formats.number(value));
    const formatY = options.formatY ?? ((value: number) => chart.formats.number(value));

    const shown = chart.series.filter((s) => s.data.length > 0);
    const reference = chart.referenceSeries() ?? shown[0];
    if (!reference) {
      table.replaceChildren();
      return;
    }

    const rows = Math.min(reference.data.length, maxRows);
    const head = ['', ...shown.map((s) => s.name)];
    const lines: string[][] = [];
    for (let i = 0; i < rows; i++) {
      const x = reference.data.x[i];
      lines.push([
        formatX(x),
        ...shown.map((s) => {
          const value = s.data.y[i];
          return Number.isFinite(value) ? formatY(value, s) : '';
        }),
      ]);
    }

    const caption = options.summary ?? chart.canvas.getAttribute('aria-label') ?? 'Chart data';
    const truncated =
      reference.data.length > rows
        ? `<caption>${escape(caption)} — first ${rows} of ${reference.data.length} points</caption>`
        : `<caption>${escape(caption)}</caption>`;

    table.innerHTML =
      `<table>${truncated}<thead><tr>${head.map((h) => `<th scope="col">${escape(h)}</th>`).join('')}</tr></thead>` +
      `<tbody>${lines
        .map((line) => `<tr><th scope="row">${escape(line[0])}</th>${line
          .slice(1)
          .map((cell) => `<td>${escape(cell)}</td>`)
          .join('')}</tr>`)
        .join('')}</tbody></table>`;
  };

  return {
    name: 'nano:a11y',

    init(chart) {
      host = chart;

      if (wantKeyboard) {
        chart.canvas.tabIndex = 0;
        chart.canvas.addEventListener('keydown', onKeyDown);
        chart.canvas.addEventListener('focus', onFocusChange);
        chart.canvas.addEventListener('blur', onFocusChange);
      }
      if (options.summary) chart.canvas.setAttribute('aria-label', options.summary);

      if (wantTable) {
        table = document.createElement('div');
        table.id = `nanochart-data-${++tableId}`;
        table.setAttribute('style', HIDDEN);
        chart.canvas.insertAdjacentElement('afterend', table);
        // Described by, not replaced by: the canvas keeps role="img" and its
        // label, and the table carries the numbers behind it. Marking a
        // focusable canvas aria-hidden would put a focus stop in a subtree
        // assistive technology is told to ignore.
        chart.canvas.setAttribute('aria-describedby', table.id);
      }

    },

    drawOver(ctx) {
      render(ctx.chart);
      const chart = ctx.chart;
      if (!wantKeyboard || !focusVisible(chart.canvas)) return;

      // A visible focus ring, since the canvas is now a focus stop.
      const r = ctx.r;
      r.strokeRoundRect(1.5, 1.5, r.width - 3, r.height - 3, 4, ctx.color('crosshair'), 2);
    },

    destroy(chart) {
      chart.canvas.removeEventListener('keydown', onKeyDown);
      chart.canvas.removeEventListener('focus', onFocusChange);
      chart.canvas.removeEventListener('blur', onFocusChange);
      chart.canvas.removeAttribute('tabindex');
      chart.canvas.removeAttribute('aria-describedby');
      table?.remove();
      table = null;
      host = null;
      built = [];
    },
  };
}

