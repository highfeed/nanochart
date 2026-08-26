import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { contextOf, installCanvas, mount, useClock } from './helpers/dom.js';
import { Chart } from '../src/core/chart.js';
import { logTicks, niceLogDomain, scaleLog } from '../src/core/scale.js';
import { formatLog } from '../src/core/utils.js';
import { xAxis, yAxis } from '../src/index.js';

beforeAll(installCanvas);
let clock: ReturnType<typeof useClock> | undefined;
afterEach(() => {
  clock?.restore();
  clock = undefined;
});

describe('scaleLog', () => {
  it('places each decade at an equal distance', () => {
    const scale = scaleLog(1, 1000, 0, 300);
    expect(scale.map(1)).toBeCloseTo(0);
    expect(scale.map(10)).toBeCloseTo(100);
    expect(scale.map(100)).toBeCloseTo(200);
    expect(scale.map(1000)).toBeCloseTo(300);
  });

  it('round-trips through invert', () => {
    const scale = scaleLog(1, 1000, 0, 300);
    expect(scale.invert(scale.map(42))).toBeCloseTo(42);
  });

  it('refuses to let zero or a negative bound break the axis', () => {
    const scale = scaleLog(0, 100, 0, 200);
    expect(Number.isFinite(scale.map(1))).toBe(true);
    expect(scale.d0).toBeGreaterThan(0);
  });
});

describe('log domain and ticks', () => {
  it('widens to whole decades', () => {
    expect(niceLogDomain(3, 4200)).toEqual({ min: 1, max: 10000 });
  });

  it('gives decades, with 2s and 5s when there is room', () => {
    expect(logTicks(1, 100, 12)).toEqual([1, 2, 5, 10, 20, 50, 100]);
    expect(logTicks(1, 1e6, 6)).toEqual([1, 10, 100, 1000, 10000, 100000, 1000000]);
  });

  it('thins decades when there are more than will fit', () => {
    expect(logTicks(1, 1e12, 4).length).toBeLessThanOrEqual(7);
  });
});

describe('formatLog', () => {
  it('takes precision from each value, not a shared step', () => {
    expect(formatLog(0.001)).toBe('0.001');
    expect(formatLog(0.05)).toBe('0.05');
    expect(formatLog(1)).toBe('1');
    expect(formatLog(1500)).toBe('1.5K');
  });
});

describe('log axis end to end', () => {
  it('labels decades instead of collapsing them to zero', () => {
    clock = useClock();
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      y: { type: 'log' },
      series: [{ id: 'a', type: 'line', data: [0.01, 1, 100, 10000] }],
      plugins: [yAxis()],
    });
    chart.render();
    const labels = contextOf(chart.canvas).texts();
    expect(labels).toContain('0.01');
    expect(labels).toContain('10K');
    // The old compactFormatter(step) path rendered every sub-1 tick as "0".
    expect(labels.filter((l) => l === '0')).toHaveLength(0);
    chart.destroy();
  });

  it('never forces zero into the domain, even for a bar series', () => {
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      y: { type: 'log' },
      series: [{ id: 'a', type: 'bar', data: [10, 100, 1000] }],
    });
    chart.render();
    expect(chart.domain('y').min.target).toBeGreaterThan(0);
    chart.destroy();
  });
});

describe('category axis', () => {
  const categories = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  it('labels slots from the category list', () => {
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      x: { type: 'category', categories },
      series: [{ id: 'a', type: 'bar', data: [3, 1, 4, 1, 5] }],
      plugins: [xAxis()],
    });
    chart.render();
    const labels = contextOf(chart.canvas).texts();
    expect(labels).toContain('Mon');
    expect(labels).toContain('Fri');
    chart.destroy();
  });

  it('leaves half a slot at each end so edge bars are whole', () => {
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      x: { type: 'category', categories },
      series: [{ id: 'a', type: 'bar', data: [3, 1, 4, 1, 5] }],
    });
    chart.render();
    const [from, to] = chart.xExtent;
    expect(from).toBeCloseTo(-0.5);
    expect(to).toBeCloseTo(4.5);
    chart.destroy();
  });
});

describe('y axis placement', () => {
  it('overlays the plot by default', () => {
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      series: [{ id: 'a', type: 'line', data: [1, 2, 3] }],
      plugins: [yAxis()],
    });
    chart.render();
    expect(chart.plot.x).toBe(0);
    expect(chart.plot.w).toBe(600);
    chart.destroy();
  });

  it('reserves a gutter sized to its widest label when placed outside', () => {
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      series: [{ id: 'a', type: 'line', data: [1000, 200000, 3000000] }],
      plugins: [yAxis({ placement: 'outside' })],
    });
    chart.render();
    chart.render();   // ticks exist now, so layout can size the gutter
    expect(chart.plot.x).toBeGreaterThan(0);
    expect(chart.plot.w).toBeLessThan(600);
    expect(chart.plot.x + chart.plot.w).toBe(600);
    chart.destroy();
  });

  it('draws outside labels clear of the plot', () => {
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      series: [{ id: 'a', type: 'line', data: [1000, 200000] }],
      plugins: [yAxis({ placement: 'outside' })],
    });
    chart.render();
    const ctx = contextOf(chart.canvas);
    ctx.clear();
    chart.render();
    const label = ctx.calls('fillText')[0];
    expect(label).toBeDefined();
    expect(label.args[1] as number).toBeLessThanOrEqual(chart.plot.x);
    chart.destroy();
  });
});
