import { beforeAll, describe, expect, it } from 'vitest';
import { contextOf, drawOnce, installCanvas, mount } from './helpers/dom.js';
import { Chart } from '../src/core/chart.js';
import '../src/index.js';

beforeAll(installCanvas);

const WIDTH = 600;
const HEIGHT = 300;

function chartWith(type: string, data: unknown[], extra: Record<string, unknown> = {}) {
  const host = mount(WIDTH, HEIGHT);
  const chart = new Chart(host, {
    animation: false,
    height: HEIGHT,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    series: [{ id: 'a', type, data, ...extra } as never],
  });
  drawOnce(chart);
  return chart;
}

/** Path ops recorded on the Path2D handed to `fill`. */
function pathOps(chart: Chart): { name: string; args: unknown[] }[] {
  const fills = contextOf(chart.canvas).calls('fill');
  const path = fills.map((op) => op.args[0]).find((a): a is { ops: never[] } => !!a && Array.isArray((a as never)['ops']));
  return path ? (path.ops as never) : [];
}

describe('line decimation', () => {
  it('draws far fewer vertices than there are points', () => {
    const data = Array.from({ length: 100_000 }, (_, i) => [i, Math.sin(i / 50)]);
    const chart = chartWith('line', data);
    const vertices = contextOf(chart.canvas).vertices('moveTo', 'lineTo');
    // At most first/min/max/last per pixel column.
    expect(vertices.length).toBeLessThanOrEqual(WIDTH * 4 + 8);
    chart.destroy();
  });

  /**
   * Decimation currently keeps every Nth point, so a narrow spike between two
   * samples is dropped. The y axis still scales to it, so the chart shows an
   * axis up to the peak and a flat line — it silently misrepresents the data.
   */
  it('keeps a single-point spike that decimation would skip', () => {
    const data = Array.from({ length: 100_000 }, (_, i) => [i, i === 50_000 ? 1000 : 0]);
    const chart = chartWith('line', data);
    const vertices = contextOf(chart.canvas).vertices('moveTo', 'lineTo');
    const highest = Math.min(...vertices.map(([, y]) => y));
    // The spike must reach the top of the plot, not sit on the baseline.
    expect(highest).toBeLessThan(HEIGHT * 0.2);
    chart.destroy();
  });
});

describe('bar', () => {
  it('emits one rect per visible point', () => {
    const chart = chartWith('bar', [1, 2, 3, 4]);
    expect(contextOf(chart.canvas).calls('rect').length).toBeGreaterThanOrEqual(4);
    chart.destroy();
  });

  // Bars, unlike lines, have no decimation: 100k points means 100k rects on a
  // 600px canvas.
  it('collapses bars that share a pixel column', () => {
    const chart = chartWith('bar', Array.from({ length: 100_000 }, (_, i) => [i, 1]));
    expect(contextOf(chart.canvas).calls('rect').length).toBeLessThan(WIDTH * 3);
    chart.destroy();
  });
});

describe('scatter', () => {
  it('emits one arc per point', () => {
    const chart = chartWith('scatter', [1, 2, 3]);
    expect(pathOps(chart).filter((op) => op.name === 'arc')).toHaveLength(3);
    chart.destroy();
  });

  it('collapses dots that share a pixel', () => {
    const chart = chartWith('scatter', Array.from({ length: 100_000 }, (_, i) => [i, 1]));
    expect(pathOps(chart).filter((op) => op.name === 'arc').length).toBeLessThan(WIDTH * 3);
    chart.destroy();
  });
});

describe('candlestick', () => {
  it('derives the domain from high and low', () => {
    const chart = chartWith('candlestick', [
      { x: 0, open: 10, high: 20, low: 5, close: 15 },
      { x: 1, open: 15, high: 30, low: 12, close: 28 },
    ]);
    const y = chart.domain('y');
    expect(y.max.target).toBeGreaterThanOrEqual(30);
    expect(y.min.target).toBeLessThanOrEqual(5);
    chart.destroy();
  });
});

describe('pie', () => {
  it('is excluded from the cartesian domain', () => {
    const host = mount(WIDTH, HEIGHT);
    const chart = new Chart(host, {
      animation: false,
      height: HEIGHT,
      series: [{ id: 'a', type: 'pie', data: [10] }, { id: 'b', type: 'pie', data: [30] }],
    });
    chart.render();
    expect(chart.domain('y').used).toBe(false);
    chart.destroy();
  });
});
