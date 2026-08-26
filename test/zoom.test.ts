import { beforeAll, describe, expect, it } from 'vitest';
import { installCanvas, mount, wheelEvent } from './helpers/dom.js';
import { Chart } from '../src/core/chart.js';
import { rangeSelector, zoom } from '../src/index.js';

beforeAll(installCanvas);

function chartWith(options: Record<string, unknown> = {}, chartOptions: Record<string, unknown> = {}) {
  const host = mount(600, 300);
  const chart = new Chart(host, {
    animation: false,
    height: 300,
    padding: { left: 0, right: 0, top: 0, bottom: 0 },
    series: [{ id: 'a', type: 'line', data: Array.from({ length: 100 }, (_, i) => [i, i]) }],
    plugins: [zoom(options)],
    ...chartOptions,
  });
  chart.render();
  return chart;
}

/** Dispatches a wheel event the plugin will see. */
function wheel(chart: Chart, x: number, y: number, deltaY: number, init: WheelEventInit = {}) {
  const event = wheelEvent(x, y, deltaY, init);
  chart.canvas.dispatchEvent(event);
  return event;
}

/** Drives a pointer gesture through the plugin's own hook. */
function drag(chart: Chart, from: number, to: number) {
  const plugin = (chart as never as { plugins: { pointer?: Function }[] }).plugins[0];
  plugin.pointer?.(chart, { type: 'down', x: from, y: 150, inside: true, originalEvent: null });
  plugin.pointer?.(chart, { type: 'move', x: to, y: 150, inside: true, originalEvent: null });
  plugin.pointer?.(chart, { type: 'up', x: to, y: 150, inside: true, originalEvent: null });
}

describe('wheel zoom', () => {
  it('narrows the window scrolling up and widens it scrolling down', () => {
    const chart = chartWith();
    const full = chart.range()[1] - chart.range()[0];
    wheel(chart, 300, 150, -100);
    const zoomed = chart.range()[1] - chart.range()[0];
    expect(zoomed).toBeLessThan(full);

    wheel(chart, 300, 150, 100);
    expect(chart.range()[1] - chart.range()[0]).toBeGreaterThan(zoomed);
    chart.destroy();
  });

  it('holds the value under the cursor still', () => {
    const chart = chartWith();
    const at = 0.25;
    const px = chart.plot.x + at * chart.plot.w;
    const before = chart.xScale.invert(px);
    wheel(chart, px, 150, -100);
    chart.render();
    const after = chart.xScale.invert(px);
    expect(after).toBeCloseTo(before, 5);
    chart.destroy();
  });

  it('stops at the chart minSpan', () => {
    const chart = chartWith({}, { minSpan: 0.2 });
    for (let i = 0; i < 40; i++) wheel(chart, 300, 150, -100);
    expect(chart.range()[1] - chart.range()[0]).toBeCloseTo(0.2, 6);
    chart.destroy();
  });

  it('consumes the gesture so the page does not scroll too', () => {
    const chart = chartWith();
    expect(wheel(chart, 300, 150, -100).defaultPrevented).toBe(true);
    chart.destroy();
  });

  it('ignores the wheel outside the plot', () => {
    const chart = chartWith();
    const before = chart.range();
    // Past the bottom of the plot, where an x axis or legend would live.
    expect(wheel(chart, 300, chart.plot.y + chart.plot.h + 20, -100).defaultPrevented).toBe(false);
    expect(chart.range()).toEqual(before);
    chart.destroy();
  });

  it('waits for a modifier when one is required', () => {
    const chart = chartWith({ modifier: 'ctrl' });
    const before = chart.range();
    wheel(chart, 300, 150, -100);
    expect(chart.range()).toEqual(before);

    wheel(chart, 300, 150, -100, { ctrlKey: true });
    expect(chart.range()[1] - chart.range()[0]).toBeLessThan(before[1] - before[0]);
    chart.destroy();
  });

  it('detaches its listener on destroy', () => {
    const chart = chartWith();
    const canvas = chart.canvas;
    chart.destroy();
    const event = wheelEvent(300, 150, -100);
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('drag pan', () => {
  it('moves the window opposite the drag', () => {
    const chart = chartWith();
    chart.setRange(0.4, 0.6, false);
    drag(chart, 400, 300);
    expect(chart.range()[0]).toBeGreaterThan(0.4);
    chart.destroy();
  });

  it('keeps the span while panning', () => {
    const chart = chartWith();
    chart.setRange(0.4, 0.6, false);
    drag(chart, 400, 300);
    const [from, to] = chart.range();
    expect(to - from).toBeCloseTo(0.2, 6);
    chart.destroy();
  });

  it('does nothing when the whole extent is already visible', () => {
    const chart = chartWith();
    drag(chart, 400, 300);
    expect(chart.range()).toEqual([0, 1]);
    chart.destroy();
  });

  it('stays inside the extent', () => {
    const chart = chartWith();
    chart.setRange(0, 0.2, false);
    drag(chart, 100, 500);
    expect(chart.range()[0]).toBeGreaterThanOrEqual(0);
    chart.destroy();
  });

  it('can be turned off', () => {
    const chart = chartWith({ drag: false });
    chart.setRange(0.4, 0.6, false);
    drag(chart, 400, 300);
    expect(chart.range()[0]).toBeCloseTo(0.4, 6);
    chart.destroy();
  });
});

describe('minSpan agreement', () => {
  it('lets the scrubber raise the floor but not lower it', () => {
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      minSpan: 0.1,
      series: [{ id: 'a', type: 'line', data: [1, 2, 3] }],
      plugins: [rangeSelector({ minSpan: 0.01 })],
    });
    chart.setRange(0.5, 0.51, false);
    expect(chart.range()[1] - chart.range()[0]).toBeCloseTo(0.1, 6);
    chart.destroy();
  });
});
