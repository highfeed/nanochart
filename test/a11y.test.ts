import { beforeAll, describe, expect, it } from 'vitest';
import { drawOnce, installCanvas, mount } from './helpers/dom.js';
import { Chart } from '../src/core/chart.js';
import { a11y, tooltip } from '../src/index.js';

beforeAll(installCanvas);



function chartWith(options: Record<string, unknown> = {}, chartOptions: Record<string, unknown> = {}) {
  const host = mount(600, 300);
  const chart = new Chart(host, {
    animation: false,
    height: 300,
    ariaLabel: 'Revenue by day',
    series: [
      { id: 'a', type: 'line', name: 'Revenue', data: [10, 20, 30] },
      { id: 'b', type: 'line', name: 'Costs', data: [5, 6, 7] },
    ],
    plugins: [tooltip(), a11y(options)],
    ...chartOptions,
  });
  chart.render();
  return { chart, host };
}

/** The visually hidden table the plugin inserts after the canvas. */
function tableOf(chart: Chart): HTMLElement {
  const el = chart.canvas.nextElementSibling as HTMLElement;
  expect(el).toBeTruthy();
  return el;
}

/**
 * Whether the frame carries the focus ring.
 *
 * It is the only round rect inset 1.5px from the canvas corner, and a round
 * rect starts at its top-left arc — one radius along the top edge.
 */
function ringed(chart: Chart): boolean {
  return drawOnce(chart)
    .vertices('moveTo')
    .some(([x, y]) => x === 5.5 && y === 1.5);
}

/** How the canvas answers `:focus-visible`, standing in for a browser's own. */
function answerFocusVisible(canvas: HTMLCanvasElement, answer: () => boolean): void {
  Object.defineProperty(canvas, 'matches', { configurable: true, value: answer });
}

function key(chart: Chart, name: string) {
  const event = new KeyboardEvent('keydown', { key: name, cancelable: true, bubbles: true });
  chart.canvas.dispatchEvent(event);
  return event;
}

describe('data table', () => {
  it('puts the numbers in the DOM, one column per series', () => {
    const { chart } = chartWith();
    const text = tableOf(chart).textContent ?? '';
    expect(text).toContain('Revenue');
    expect(text).toContain('Costs');
    expect(tableOf(chart).querySelectorAll('tbody tr')).toHaveLength(3);
    chart.destroy();
  });

  it('is hidden visually but not from assistive technology', () => {
    const { chart } = chartWith();
    const style = tableOf(chart).getAttribute('style') ?? '';
    expect(style).toContain('clip-path');
    expect(tableOf(chart).getAttribute('aria-hidden')).toBeNull();
    chart.destroy();
  });

  it('points the canvas at the table without hiding the canvas', () => {
    const { chart } = chartWith();
    // A focusable element inside an aria-hidden subtree is a contradiction.
    expect(chart.canvas.getAttribute('aria-hidden')).toBeNull();
    expect(chart.canvas.getAttribute('aria-describedby')).toBe(tableOf(chart).id);
    expect(chart.canvas.getAttribute('role')).toBe('img');
    chart.destroy();
  });

  it('captions itself from the chart label', () => {
    const { chart } = chartWith();
    expect(tableOf(chart).querySelector('caption')?.textContent).toContain('Revenue by day');
    chart.destroy();
  });

  it('rebuilds when the data changes', () => {
    const { chart } = chartWith();
    expect(tableOf(chart).querySelectorAll('tbody tr')).toHaveLength(3);
    chart.updateSeries('a', { data: [1, 2, 3, 4, 5] });
    chart.render();
    expect(tableOf(chart).querySelectorAll('tbody tr')).toHaveLength(5);
    chart.destroy();
  });

  it('caps very long series and says so', () => {
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      series: [{ id: 'a', type: 'line', data: Array.from({ length: 5000 }, (_, i) => i) }],
      plugins: [a11y({ maxRows: 50 })],
    });
    chart.render();
    expect(tableOf(chart).querySelectorAll('tbody tr')).toHaveLength(50);
    expect(tableOf(chart).querySelector('caption')?.textContent).toContain('5000');
    chart.destroy();
  });

  it('escapes series names rather than injecting them as markup', () => {
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      series: [{ id: 'a', type: 'line', name: '<img src=x onerror=alert(1)>', data: [1, 2] }],
      plugins: [a11y()],
    });
    chart.render();
    expect(tableOf(chart).querySelector('img')).toBeNull();
    expect(tableOf(chart).textContent).toContain('<img');
    chart.destroy();
  });

  it('formats times through the chart locale', () => {
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      locale: 'en-US',
      timeZone: 'UTC',
      x: { type: 'time' },
      series: [{ id: 'a', type: 'line', data: [[Date.UTC(2023, 0, 7), 5]] }],
      plugins: [a11y()],
    });
    chart.render();
    expect(tableOf(chart).textContent).toContain('Jan');
    chart.destroy();
  });

  it('can be turned off', () => {
    const { chart } = chartWith({ table: false });
    expect(chart.canvas.nextElementSibling).toBeNull();
    chart.destroy();
  });
});

describe('keyboard', () => {
  it('makes the chart a focus stop', () => {
    const { chart } = chartWith();
    expect(chart.canvas.tabIndex).toBe(0);
    chart.destroy();
  });

  it('rings the canvas the keyboard focused', () => {
    const { chart } = chartWith();
    expect(ringed(chart)).toBe(false);
    chart.canvas.focus();
    expect(ringed(chart)).toBe(true);
    chart.destroy();
  });

  it('leaves the canvas a click focused alone', () => {
    const { chart } = chartWith();
    chart.canvas.focus();
    // What a pointer leaves behind: focus on the element, but no reason to
    // show anyone where the keyboard is.
    answerFocusVisible(chart.canvas, () => false);
    expect(ringed(chart)).toBe(false);
    chart.destroy();
  });

  it('rings it anyway where :focus-visible is not a selector', () => {
    const { chart } = chartWith();
    chart.canvas.focus();
    answerFocusVisible(chart.canvas, () => {
      throw new SyntaxError("':focus-visible' is not a valid selector");
    });
    expect(ringed(chart)).toBe(true);
    chart.destroy();
  });

  it('draws a frame when focus arrives, rather than waiting for one', () => {
    const { chart } = chartWith();
    let frames = 0;
    const real = chart.invalidate.bind(chart);
    chart.invalidate = () => {
      frames++;
      real();
    };
    chart.canvas.focus();
    expect(frames).toBeGreaterThan(0);
    frames = 0;
    chart.canvas.blur();
    expect(frames).toBeGreaterThan(0);
    chart.destroy();
  });

  it('walks points with the arrow keys', () => {
    const { chart } = chartWith();
    key(chart, 'ArrowRight');
    expect(chart.hoverIndex).toBe(0);
    key(chart, 'ArrowRight');
    expect(chart.hoverIndex).toBe(1);
    key(chart, 'ArrowLeft');
    expect(chart.hoverIndex).toBe(0);
    chart.destroy();
  });

  it('jumps to the ends and clears with Escape', () => {
    const { chart } = chartWith();
    key(chart, 'End');
    expect(chart.hoverIndex).toBe(2);
    key(chart, 'Home');
    expect(chart.hoverIndex).toBe(0);
    key(chart, 'Escape');
    expect(chart.hoverIndex).toBe(-1);
    chart.destroy();
  });

  it('stops at the ends rather than wrapping', () => {
    const { chart } = chartWith();
    for (let i = 0; i < 10; i++) key(chart, 'ArrowRight');
    expect(chart.hoverIndex).toBe(2);
    for (let i = 0; i < 10; i++) key(chart, 'ArrowLeft');
    expect(chart.hoverIndex).toBe(0);
    chart.destroy();
  });

  it('reports the move so listeners see it like a hover', () => {
    const { chart } = chartWith();
    const seen: unknown[] = [];
    chart.on('hover', (e) => seen.push(e));
    key(chart, 'ArrowRight');
    expect(seen).toEqual([{ index: 0, seriesId: null }]);
    chart.destroy();
  });

  it('walks the series the mouse hovered, not the longest one', () => {
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      series: [
        { id: 'long', type: 'line', name: 'Long', data: Array.from({ length: 50 }, (_, i) => [i, i]) },
        { id: 'short', type: 'line', name: 'Short', data: [[80, 1], [90, 2]] },
      ],
      plugins: [tooltip(), a11y()],
    });
    chart.render();

    // Hover the right-hand side, where only the short series has samples.
    (chart as never as { updateHover(s: unknown): void }).updateHover({
      type: 'move',
      x: chart.plot.x + chart.plot.w * 0.95,
      y: chart.plot.y + chart.plot.h / 2,
      inside: true,
      originalEvent: null,
    });
    expect(chart.hoverReference?.id).toBe('short');

    key(chart, 'ArrowRight');
    // Falling back to referenceSeries() here jumped the tooltip to `long` and
    // left `short` unreachable from the keyboard.
    expect(chart.hoverReference?.id).toBe('short');
    expect(chart.hoverIndex).toBe(1);
    chart.destroy();
  });

  it('falls back to the longest series when nothing is hovered', () => {
    const { chart } = chartWith();
    key(chart, 'End');
    expect(chart.hoverReference?.id).toBe('a');
    expect(chart.hoverIndex).toBe(2);
    chart.destroy();
  });

  it('consumes the keys it handles and leaves the rest alone', () => {
    const { chart } = chartWith();
    expect(key(chart, 'ArrowRight').defaultPrevented).toBe(true);
    expect(key(chart, 'a').defaultPrevented).toBe(false);
    chart.destroy();
  });

  it('detaches on destroy', () => {
    const { chart } = chartWith();
    const canvas = chart.canvas;
    chart.destroy();
    expect(canvas.getAttribute('tabindex')).toBeNull();
    expect(canvas.getAttribute('aria-describedby')).toBeNull();
    expect(canvas.nextElementSibling).toBeNull();
  });
});
