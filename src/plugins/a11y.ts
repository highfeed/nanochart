import type { Chart } from '../core/chart.js';
import { nearestIndex } from '../core/data.js';
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
 *
 * Marking that focus is left to the browser. Painting a ring on the canvas
 * meant deciding for every page what a focus indicator looks like and when it
 * shows, on an element the page cannot restyle; `:focus-visible` on the canvas
 * is the same indicator every other control on the page gets, and CSS can
 * change it. `outline: none` on it is a page saying keyboard users may not see
 * where they are, so it should say something else instead.
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

    const cell = (series: SeriesState, i: number): string => {
      const value = series.data.y[i];
      return Number.isFinite(value) ? formatY(value, series) : '';
    };

    const rows = Math.min(reference.data.length, maxRows);
    const head = ['', ...shown.map((s) => s.name)];
    const lines: string[][] = [];
    for (let i = 0; i < rows; i++) {
      const x = reference.data.x[i];
      // Series may sit on their own x grid, so match by value rather than by
      // row, the way the tooltip does. Pairing by row put numbers side by side
      // that never occurred together, under an x taken from a third series —
      // and a reader of this table cannot see that they do not belong.
      const previous = reference.data.x[Math.max(i - 1, 0)];
      const next = reference.data.x[Math.min(i + 1, reference.data.length - 1)];
      const tolerance = Math.max((next - previous) / 2, Number.EPSILON);
      lines.push([
        formatX(x),
        ...shown.map((series) => {
          if (series === reference) return cell(series, i);
          const j = nearestIndex(series.data, x);
          return Math.abs(series.data.x[j] - x) <= tolerance ? cell(series, j) : '';
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
    },

    destroy(chart) {
      chart.canvas.removeEventListener('keydown', onKeyDown);
      chart.canvas.removeAttribute('tabindex');
      chart.canvas.removeAttribute('aria-describedby');
      table?.remove();
      table = null;
      host = null;
      built = [];
    },
  };
}

