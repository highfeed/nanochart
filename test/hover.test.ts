import { beforeAll, describe, expect, it } from 'vitest';
import { drawOnce, installCanvas, mount } from './helpers/dom.js';
import { Chart } from '../src/core/chart.js';
import { tooltip } from '../src/index.js';

beforeAll(installCanvas);

/**
 * An order book: bids and asks sit on disjoint halves of the price axis, so no
 * single series covers the width of the plot.
 */
function orderBook() {
  const host = mount(600, 300);
  const bids = Array.from({ length: 40 }, (_, i) => [66500 + i * 48, 2000 - i * 50]);
  const asks = Array.from({ length: 40 }, (_, i) => [68450 + i * 48, i * 50]);
  const chart = new Chart(host, {
    animation: false,
    height: 300,
    padding: { left: 0, right: 0, top: 0, bottom: 0 },
    series: [
      { id: 'bids', type: 'area', name: 'Bids', data: bids },
      { id: 'asks', type: 'area', name: 'Asks', data: asks },
    ],
    plugins: [tooltip()],
  });
  chart.render();
  return chart;
}

/** Moves the pointer to a fraction across the plot and returns the tooltip text. */
function hoverAt(chart: Chart, fraction: number): string[] {
  const x = chart.plot.x + chart.plot.w * fraction;
  const y = chart.plot.y + chart.plot.h / 2;
  (chart as never as { updateHover(s: unknown): void }).updateHover({
    type: 'move', x, y, inside: true, originalEvent: null,
  });
  return drawOnce(chart).texts();
}

describe('hover across series on disjoint x ranges', () => {
  it('reports bids on the bid side', () => {
    const chart = orderBook();
    expect(hoverAt(chart, 0.2).join(' ')).toContain('Bids');
    chart.destroy();
  });

  it('reports asks on the ask side', () => {
    const chart = orderBook();
    const labels = hoverAt(chart, 0.8).join(' ');
    expect(labels).toContain('Asks');
    chart.destroy();
  });

  it('does not pin the crosshair to the end of the first series', () => {
    const chart = orderBook();
    hoverAt(chart, 0.85);
    const reference = chart.hoverReference;
    expect(reference?.id).toBe('asks');
    // The reported point must be near the pointer, not at the bids' last x.
    const px = chart.xScale.map(reference!.data.x[chart.hoverIndex]);
    expect(Math.abs(px - (chart.plot.x + chart.plot.w * 0.85))).toBeLessThan(20);
    chart.destroy();
  });

  it('still picks a single series when the ranges overlap', () => {
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      series: [
        { id: 'a', type: 'line', name: 'A', data: [1, 2, 3, 4] },
        { id: 'b', type: 'line', name: 'B', data: [4, 3, 2, 1] },
      ],
      plugins: [tooltip()],
    });
    chart.render();
    const labels = hoverAt(chart, 0.5).join(' ');
    expect(labels).toContain('A');
    expect(labels).toContain('B');
    chart.destroy();
  });
});
