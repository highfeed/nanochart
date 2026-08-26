import { beforeAll, describe, expect, it } from 'vitest';
import { contextOf, drawOnce, installCanvas, mount } from './helpers/dom.js';
import { Chart } from '../src/core/chart.js';
import { legend } from '../src/index.js';

beforeAll(installCanvas);

const SERIES = [
  { id: 'a', type: 'line', name: 'Alpha', data: [1, 2, 3] },
  { id: 'b', type: 'line', name: 'Beta', data: [3, 2, 1] },
  { id: 'c', type: 'line', name: 'Gamma', data: [2, 2, 2] },
];

function chartWith(options: Record<string, unknown>) {
  const host = mount(600, 400);
  const chart = new Chart(host, {
    animation: false,
    height: 400,
    padding: { left: 0, right: 0, top: 0, bottom: 0 },
    series: SERIES as never,
    plugins: [legend(options)],
  });
  drawOnce(chart);
  return chart;
}

describe('legend', () => {
  it('lists every series by default', () => {
    const chart = chartWith({});
    expect(contextOf(chart.canvas).texts()).toEqual(['Alpha', 'Beta', 'Gamma']);
    chart.destroy();
  });

  it('drops the series a filter rejects', () => {
    const chart = chartWith({ filter: (s: { id: string }) => s.id !== 'b' });
    expect(contextOf(chart.canvas).texts()).toEqual(['Alpha', 'Gamma']);
    chart.destroy();
  });

  it('reserves no space when the filter rejects everything', () => {
    const chart = chartWith({ filter: () => false });
    expect(contextOf(chart.canvas).texts()).toEqual([]);
    expect(chart.plot.h).toBe(400);
    chart.destroy();
  });

  it('sits below the plot by default and above it on request', () => {
    const below = chartWith({});
    const belowTop = chart_y(below);
    below.destroy();

    const above = chartWith({ position: 'top' });
    const aboveTop = chart_y(above);
    expect(aboveTop).toBeLessThan(belowTop);
    expect(above.plot.y).toBeGreaterThan(0);
    above.destroy();
  });

  it('stacks one item per row when vertical', () => {
    const chart = chartWith({ orientation: 'vertical' });
    const rows = new Set(contextOf(chart.canvas).calls('fillText').map((op) => Math.round(op.args[2] as number)));
    expect(rows.size).toBe(3);
    chart.destroy();
  });

  it('keeps one row when horizontal and there is room', () => {
    const chart = chartWith({});
    const rows = new Set(contextOf(chart.canvas).calls('fillText').map((op) => Math.round(op.args[2] as number)));
    expect(rows.size).toBe(1);
    chart.destroy();
  });

  it('centres and right-aligns a row on request', () => {
    const start = firstLabelX(chartWith({ align: 'start' }));
    const centre = firstLabelX(chartWith({ align: 'center' }));
    const end = firstLabelX(chartWith({ align: 'end' }));
    expect(centre).toBeGreaterThan(start);
    expect(end).toBeGreaterThan(centre);
  });
});

/** Y of the first legend label. */
function chart_y(chart: Chart): number {
  return contextOf(chart.canvas).calls('fillText')[0].args[2] as number;
}

/** X of the first legend label. */
function firstLabelX(chart: Chart): number {
  const x = contextOf(chart.canvas).calls('fillText')[0].args[1] as number;
  chart.destroy();
  return x;
}
