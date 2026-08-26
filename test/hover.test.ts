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

/** Moves the pointer to a fraction across the plot, without drawing. */
function move(chart: Chart, fraction: number): void {
  const x = chart.plot.x + chart.plot.w * fraction;
  const y = chart.plot.y + chart.plot.h / 2;
  (chart as never as { updateHover(s: unknown): void }).updateHover({
    type: 'move', x, y, inside: true, originalEvent: null,
  });
}

/** Moves the pointer to a fraction across the plot and returns the tooltip text. */
function hoverAt(chart: Chart, fraction: number): string[] {
  move(chart, fraction);
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

describe('the hover event', () => {
  /** Two single-point series, one at each end of the x axis. */
  function farApart() {
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      series: [
        { id: 'left', type: 'line', name: 'Left', data: [[0, 5]] },
        { id: 'right', type: 'line', name: 'Right', data: [[100, 9]] },
      ],
      plugins: [tooltip()],
    });
    chart.render();
    return chart;
  }

  it('fires when only the reference series changes', () => {
    const chart = farApart();
    const seen: { index: number; seriesId: string | null }[] = [];
    chart.on('hover', (event) => seen.push(event));

    move(chart, 0.05);
    expect(chart.hoverReference?.id).toBe('left');
    move(chart, 0.95);
    expect(chart.hoverReference?.id).toBe('right');

    // Both samples are index 0, so deduplicating on the index alone reported
    // one move where the reader made two.
    expect(seen).toHaveLength(2);
    chart.destroy();
  });

  it('still reports a repeated hover on the same point once', () => {
    const chart = farApart();
    const seen: unknown[] = [];
    chart.on('hover', (event) => seen.push(event));
    move(chart, 0.05);
    move(chart, 0.06);
    expect(seen).toHaveLength(1);
    chart.destroy();
  });
});

describe('hover over a gap', () => {
  function withOutage() {
    const host = mount(600, 300);
    const data = Array.from({ length: 40 }, (_, i) => (i >= 18 && i <= 23 ? null : i));
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      series: [{ id: 'errors', type: 'line', name: 'Errors', data }],
      plugins: [tooltip()],
    });
    chart.render();
    return chart;
  }

  it('does not hover a sample with no value', () => {
    const chart = withOutage();
    move(chart, 0.52);
    // A crosshair there would stand over a card the tooltip refuses to draw.
    expect(chart.hoverIndex).toBe(-1);
    expect(chart.hoverReference).toBeNull();
    chart.destroy();
  });

  it('prefers a series that has a value at the pointer', () => {
    const host = mount(600, 300);
    const gappy = Array.from({ length: 40 }, (_, i) => (i >= 18 && i <= 23 ? null : i));
    const solid = Array.from({ length: 40 }, (_, i) => i * 2);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      series: [
        { id: 'gappy', type: 'line', name: 'Gappy', data: gappy },
        { id: 'solid', type: 'line', name: 'Solid', data: solid },
      ],
      plugins: [tooltip()],
    });
    chart.render();
    move(chart, 0.52);
    expect(chart.hoverReference?.id).toBe('solid');
    chart.destroy();
  });

  it('still hovers either side of the outage', () => {
    const chart = withOutage();
    expect(hoverAt(chart, 0.1).join(' ')).toContain('Errors');
    expect(hoverAt(chart, 0.9).join(' ')).toContain('Errors');
    chart.destroy();
  });
});

describe('a hover that outlives its data', () => {
  function chartOf(data: number[]) {
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      series: [{ id: 'a', type: 'line', name: 'A', data }],
      plugins: [tooltip()],
    });
    chart.render();
    return chart;
  }

  it('drops a hover the new data cannot answer', () => {
    const chart = chartOf(Array.from({ length: 100 }, (_, i) => i * 10));
    move(chart, 0.95);
    expect(chart.hoverIndex).toBeGreaterThan(3);

    chart.setSeries([{ id: 'a', type: 'line', name: 'A', data: [1, 2, 3] }]);
    expect(chart.hoverIndex).toBe(-1);
    expect(chart.hoverReference).toBeNull();
    // Nothing left from the discarded series is on screen.
    expect(drawOnce(chart).texts().join(' ')).not.toContain('940');
    chart.destroy();
  });

  it('re-points a surviving hover at the new state object', () => {
    const chart = chartOf(Array.from({ length: 100 }, (_, i) => i * 10));
    move(chart, 0.5);
    const index = chart.hoverIndex;
    const longer = Array.from({ length: 120 }, (_, i) => i * 10 + 1);

    chart.setSeries([{ id: 'a', type: 'line', name: 'A', data: longer }]);
    expect(chart.hoverIndex).toBe(index);
    expect(chart.hoverReference).toBe(chart.seriesById('a'));
    chart.destroy();
  });

  it('keeps the reach of the tooltip finite next to a gap', () => {
    // The card only admits a series whose nearest sample is within half a step
    // of the hovered one. That step came out NaN beside a positionless hole,
    // and every comparison against NaN is false, so the filter let everything
    // in and the card reported values from a completely different x.
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      series: [
        { id: 'near', type: 'line', name: 'Near', data: [[0, 1], [10, 2], null] },
        { id: 'far', type: 'line', name: 'Far', data: [[900, 7], [1000, 8]] },
      ],
      plugins: [tooltip()],
    });
    chart.render();
    // Onto the last sample before the hole, so the hole is the neighbour the
    // step is measured against.
    const fraction = (chart.xScale.map(10) - chart.plot.x) / chart.plot.w;
    const labels = hoverAt(chart, fraction).join(' ');
    expect(labels).toContain('Near');
    expect(labels).not.toContain('Far');
    chart.destroy();
  });

  it('drops a hover whose series is gone', () => {
    const chart = chartOf([1, 2, 3, 4]);
    move(chart, 0.5);
    expect(chart.hoverReference?.id).toBe('a');

    chart.setSeries([{ id: 'b', type: 'line', name: 'B', data: [1, 2, 3, 4] }]);
    expect(chart.hoverIndex).toBe(-1);
    expect(chart.hoverReference).toBeNull();
    chart.destroy();
  });
});
