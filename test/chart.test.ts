import { beforeAll, describe, expect, it } from 'vitest';
import { contextOf, installCanvas, mount, setSize } from './helpers/dom.js';
import { Chart } from '../src/core/chart.js';
import { telegramDark, telegramLight } from '../src/themes/telegram.js';
import '../src/index.js';

beforeAll(installCanvas);

const base = (over: Record<string, unknown> = {}) => ({
  animation: false as const,
  height: 300,
  series: [{ id: 'a', type: 'line', name: 'A', data: [1, 2, 3] }],
  ...over,
});

describe('lifecycle', () => {
  it('creates its own canvas and removes it on destroy', () => {
    const host = mount();
    const chart = new Chart(host, base());
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
    chart.destroy();
    expect(host.querySelectorAll('canvas')).toHaveLength(0);
  });

  it('renders into a canvas it was handed, and leaves it in place', () => {
    const host = mount();
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    const chart = new Chart(canvas, base());
    chart.destroy();
    expect(host.contains(canvas)).toBe(true);
  });

  it('survives an empty series list', () => {
    const host = mount();
    const chart = new Chart(host, base({ series: [] }));
    expect(() => chart.render()).not.toThrow();
    chart.destroy();
  });

  it('throws on a target that does not exist', () => {
    expect(() => new Chart('#nope', base())).toThrow(/target element not found/);
  });
});

describe('visibility', () => {
  it('toggles a series and reports it', () => {
    const host = mount();
    const chart = new Chart(host, base());
    const events: unknown[] = [];
    chart.on('toggle', (e) => events.push(e));
    chart.toggle('a');
    expect(chart.seriesById('a')!.visible).toBe(false);
    expect(events).toEqual([{ id: 'a', visible: false }]);
    chart.destroy();
  });

  // toggle() writes to series.visible but never to series.options.visible, so
  // the next setSeries() rebuild reads the stale option back.
  it.fails('keeps a toggled state across an unrelated updateSeries', () => {
    const host = mount();
    const chart = new Chart(host, base({
      series: [
        { id: 'a', type: 'line', data: [1, 2, 3], visible: false },
        { id: 'b', type: 'line', data: [3, 2, 1] },
      ],
    }));
    chart.toggle('a', true);
    chart.updateSeries('b', { color: '#ff0000' });
    expect(chart.seriesById('a')!.visible).toBe(true);
    chart.destroy();
  });
});

describe('range', () => {
  it('clamps and orders the window', () => {
    const host = mount();
    const chart = new Chart(host, base());
    chart.setRange(0.8, 0.2, false);
    const [from, to] = chart.range();
    expect(from).toBeLessThan(to);
    expect(from).toBeCloseTo(0.2);
    chart.destroy();
  });

  it('emits rangechange', () => {
    const host = mount();
    const chart = new Chart(host, base());
    const seen: unknown[] = [];
    chart.on('rangechange', (e) => seen.push(e));
    chart.setRange(0.25, 0.75, false);
    expect(seen).toHaveLength(1);
    chart.destroy();
  });
});

describe('sizing', () => {
  it('uses an explicit height', () => {
    const host = mount(600, 999);
    const chart = new Chart(host, base({ height: 250 }));
    expect(chart.renderer.height).toBe(250);
    chart.destroy();
  });

  it('follows the container width', () => {
    const host = mount(600, 300);
    const chart = new Chart(host, base());
    setSize(host, 800, 300);
    chart.resize();
    expect(chart.renderer.width).toBe(800);
    chart.destroy();
  });

  // The canvas height is written once in the constructor, and resize() then
  // reads that same value back off the canvas instead of the container.
  it.fails('follows the container height when no height was given', () => {
    const host = mount(600, 200);
    const chart = new Chart(host, base({ height: undefined }));
    setSize(host, 600, 400);
    chart.resize();
    expect(chart.renderer.height).toBe(400);
    chart.destroy();
  });
});

describe('domain', () => {
  it('covers the data range', () => {
    const host = mount();
    const chart = new Chart(host, base({ series: [{ id: 'a', type: 'line', data: [10, 90] }] }));
    chart.render();
    const y = chart.domain('y');
    expect(y.min.target).toBeLessThanOrEqual(10);
    expect(y.max.target).toBeGreaterThanOrEqual(90);
    chart.destroy();
  });

  it('honours explicit min and max', () => {
    const host = mount();
    const chart = new Chart(host, base({ y: { min: -50, max: 150 } }));
    chart.render();
    expect(chart.domain('y').min.target).toBe(-50);
    expect(chart.domain('y').max.target).toBe(150);
    chart.destroy();
  });

  // A one-point series has no x span, so xExtent falls back to [0, 1] and the
  // point is scaled off screen.
  it.fails('places a single-point series inside the x extent', () => {
    const host = mount();
    const chart = new Chart(host, base({ series: [{ id: 'a', type: 'line', data: [[5, 42]] }] }));
    chart.render();
    const [from, to] = chart.xExtent;
    expect(from).toBeLessThanOrEqual(5);
    expect(to).toBeGreaterThanOrEqual(5);
    chart.destroy();
  });
});

describe('themes', () => {
  it('swaps the background on setTheme', () => {
    const host = mount();
    const chart = new Chart(host, base({ theme: telegramLight }));
    chart.render();
    const light = contextOf(chart.canvas).calls('set:fillStyle')[0]?.args[0];
    chart.setTheme(telegramDark, false);
    chart.render();
    const dark = contextOf(chart.canvas).calls('set:fillStyle').at(-1);
    expect(light).not.toEqual(dark?.args[0]);
    chart.destroy();
  });
});

describe('unknown series type', () => {
  // Silently drawing nothing is the worst possible failure mode for a typo.
  it.fails('does not silently ignore a type nobody registered', () => {
    const host = mount();
    expect(() => new Chart(host, base({ series: [{ id: 'a', type: 'nope', data: [1, 2] }] })).render())
      .toThrow(/nope/);
  });
});
