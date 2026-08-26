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

  it('keeps the price axis off zero when a candle is missing', () => {
    // `extent` scans the OHLC columns directly rather than going through `y`,
    // so a hole that left zeros behind used to read as a candle at zero and
    // pull the whole domain down to it.
    const chart = chartWith('candlestick', [
      { x: 0, open: 100, high: 110, low: 95, close: 105 },
      null,
      { x: 2, open: 105, high: 115, low: 100, close: 112 },
    ]);
    const y = chart.domain('y');
    expect(y.min.target).toBeGreaterThan(0);
    expect(y.min.target).toBeLessThanOrEqual(95);
    chart.destroy();
  });

  it('measures every candle when the hole is not between them', () => {
    const chart = chartWith('candlestick', [
      { x: 0, open: 100, high: 110, low: 95, close: 105 },
      { x: 2, open: 105, high: 115, low: 100, close: 112 },
      null,
    ]);
    const y = chart.domain('y');
    expect(y.min.target).toBeGreaterThan(0);
    expect(y.max.target).toBeGreaterThanOrEqual(115);
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

describe('room for the bars at the edges', () => {
  /** Every bar `rect`, as `[x, width]`. The clip box is a rect too, so it goes. */
  const bars = (chart: Chart): [number, number][] => {
    const ops = contextOf(chart.canvas).ops;
    const out: [number, number][] = [];
    for (let i = 0; i < ops.length; i++) {
      if (ops[i].name !== 'rect' || ops[i + 1]?.name === 'clip') continue;
      out.push([ops[i].args[0] as number, ops[i].args[2] as number]);
    }
    return out;
  };

  it('leaves half a bar at each end, so the first and last are whole', () => {
    // A bar is centred on its sample and the domain ends on the last sample,
    // so without room for it the outer half is clipped away at the plot edge.
    const chart = chartWith('bar', [[0, 5], [10, 7], [20, 6], [30, 8]]);
    const drawn = bars(chart);
    const first = drawn[0];
    const last = drawn[drawn.length - 1];
    expect(first[0]).toBeGreaterThanOrEqual(0);
    expect(last[0] + last[1]).toBeLessThanOrEqual(WIDTH);
    // And the room is only what the bar needs, not an arbitrary margin.
    expect(first[0]).toBeLessThan(2);
    chart.destroy();
  });

  it('measures the room from the data, not from the pixels', () => {
    const chart = chartWith('bar', [[0, 5], [10, 7], [20, 6], [30, 8]]);
    // Half a bar: the step is 10, and a bar fills 0.72 of it by default.
    expect(chart.xExtent[0]).toBeCloseTo(0 - 3.6, 6);
    expect(chart.xExtent[1]).toBeCloseTo(30 + 3.6, 6);
    chart.destroy();
  });

  it('follows barWidth', () => {
    const chart = chartWith('bar', [[0, 5], [10, 7]], { barWidth: 1 });
    expect(chart.xExtent[0]).toBeCloseTo(-5, 6);
    chart.destroy();
  });

  it('gives candles the same room', () => {
    const candles = [0, 10, 20].map((x) => ({ x, open: 1, high: 3, low: 0, close: 2 }));
    const chart = chartWith('candlestick', candles);
    // Candles default to 0.62 of the step.
    expect(chart.xExtent[0]).toBeCloseTo(-3.1, 6);
    chart.destroy();
  });

  it('leaves a chart with no bars alone', () => {
    const chart = chartWith('line', [[0, 5], [10, 7], [20, 6]]);
    expect(chart.xExtent).toEqual([0, 20]);
    chart.destroy();
  });

  it('keeps a larger x padding when the caller asks for one', () => {
    const chart = chartWith('bar', [[0, 5], [10, 7], [20, 6]], {});
    const auto = chart.xExtent[0];
    chart.destroy();

    const host = mount(WIDTH, HEIGHT);
    const padded = new Chart(host, {
      animation: false,
      height: HEIGHT,
      x: { padding: 0.5 },
      series: [{ id: 'a', type: 'bar', data: [[0, 5], [10, 7], [20, 6]] }],
    });
    expect(padded.xExtent[0]).toBeLessThan(auto);
    expect(padded.xExtent[0]).toBeCloseTo(-10, 6);
    padded.destroy();
  });
});
