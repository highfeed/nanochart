import { beforeAll, describe, expect, it } from 'vitest';
import { drawOnce, installCanvas, layout, mount, pointer } from './helpers/dom.js';
import { Chart } from '../src/core/chart.js';
import { legend, tooltip, zoom } from '../src/index.js';
import type { Plugin } from '../src/core/types.js';

beforeAll(installCanvas);

const FLAT = { left: 0, right: 0, top: 0, bottom: 0 };

function lineChart(plugins: Plugin[] = [tooltip()]) {
  const host = mount(600, 300);
  const chart = new Chart(host, {
    animation: false,
    height: 300,
    padding: FLAT,
    series: [{ id: 'a', type: 'line', name: 'A', data: Array.from({ length: 100 }, (_, i) => [i, i]) }],
    plugins,
  });
  chart.render();
  layout(chart.canvas);
  return chart;
}

function selections(chart: Chart) {
  const seen: { index: number; seriesId: string | null }[] = [];
  chart.on('select', (event) => seen.push(event));
  return seen;
}

function click(chart: Chart, x: number, y: number) {
  pointer(chart.canvas, 'pointerdown', x, y);
  pointer(chart.canvas, 'pointerup', x, y);
}

describe('select', () => {
  it('reports a click on a point', () => {
    const chart = lineChart();
    const seen = selections(chart);
    click(chart, 300, 150);
    expect(chart.hoverIndex).toBeGreaterThanOrEqual(0);
    expect(seen).toEqual([{ index: chart.hoverIndex, seriesId: null }]);
    chart.destroy();
  });

  it('is not the end of a pan', () => {
    const chart = lineChart([tooltip(), zoom()]);
    chart.setRange(0.4, 0.6, false);
    const seen = selections(chart);

    // The zoom plugin captures the moves; releasing the pointer used to read as
    // a click on whatever point was under it by then.
    pointer(chart.canvas, 'pointerdown', 400, 150);
    pointer(chart.canvas, 'pointermove', 350, 150);
    pointer(chart.canvas, 'pointermove', 300, 150);
    pointer(chart.canvas, 'pointerup', 300, 150);
    expect(chart.range()[0]).toBeGreaterThan(0.4);
    expect(seen).toEqual([]);

    // A click with the same plugin, and the window still zoomed, is still one.
    click(chart, 300, 150);
    expect(seen).toHaveLength(1);
    chart.destroy();
  });

  it('names the slice of a pie', () => {
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      padding: FLAT,
      series: [
        { id: 'apples', type: 'pie', data: [10] },
        { id: 'pears', type: 'pie', data: [10] },
      ],
      plugins: [tooltip()],
    });
    chart.render();
    layout(chart.canvas);
    const seen = selections(chart);
    // Slices start at the top and run clockwise, so the first one is the right half.
    click(chart, 380, 150);
    expect(seen).toEqual([{ index: -1, seriesId: 'apples' }]);
    chart.destroy();
  });

  it('does not follow a pointer the browser cancelled', () => {
    const chart = lineChart();
    const seen = selections(chart);
    pointer(chart.canvas, 'pointermove', 300, 150);
    expect(chart.hoverIndex).toBeGreaterThanOrEqual(0);

    // A touch the browser took for scrolling: the press never ends in a click.
    pointer(chart.canvas, 'pointerdown', 300, 150, { pointerType: 'touch' });
    pointer(chart.canvas, 'pointercancel', 300, 150, { pointerType: 'touch' });
    expect(seen).toEqual([]);
    expect(chart.hoverIndex).toBe(-1);
    expect(chart.pointerInside).toBe(false);
    chart.destroy();
  });
});

describe('legend pills and the pointer', () => {
  function legendChart() {
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      padding: FLAT,
      series: [
        { id: 'a', type: 'line', name: 'Alpha', data: [1, 2, 3] },
        { id: 'b', type: 'line', name: 'Beta', data: [3, 2, 1] },
      ],
      plugins: [legend()],
    });
    const ctx = drawOnce(chart);
    layout(chart.canvas);
    // The label is painted inside its pill, so its anchor is a point on the pill.
    const pill = (name: string): [number, number] => {
      const label = ctx.calls('fillText').find((op) => op.args[0] === name);
      if (!label) throw new Error(`no pill for ${name}`);
      return [label.args[1] as number, label.args[2] as number];
    };
    const toggles: unknown[] = [];
    chart.on('toggle', (event) => toggles.push(event));
    return { chart, pill, toggles };
  }

  it('toggles on a press and a release on the same pill', () => {
    const { chart, pill, toggles } = legendChart();
    const [x, y] = pill('Alpha');
    pointer(chart.canvas, 'pointerdown', x, y);
    pointer(chart.canvas, 'pointerup', x, y);
    expect(toggles).toEqual([{ id: 'a', visible: false }]);
    chart.destroy();
  });

  it('ignores a pointer the browser cancelled', () => {
    const { chart, pill, toggles } = legendChart();
    const [x, y] = pill('Alpha');
    // A finger lands on the pill and the page starts scrolling.
    pointer(chart.canvas, 'pointerdown', x, y, { pointerType: 'touch' });
    pointer(chart.canvas, 'pointercancel', x, y, { pointerType: 'touch' });
    expect(toggles).toEqual([]);
    expect(chart.seriesById('a')!.visible).toBe(true);
    chart.destroy();
  });

  it('ignores a release on a pill the press did not start on', () => {
    const { chart, pill, toggles } = legendChart();
    const [ax, ay] = pill('Alpha');
    const [bx, by] = pill('Beta');

    // Dragged off the plot and let go over a pill.
    pointer(chart.canvas, 'pointerdown', 300, 100);
    pointer(chart.canvas, 'pointerup', ax, ay);
    // Pressed on one pill, released on its neighbour.
    pointer(chart.canvas, 'pointerdown', ax, ay);
    pointer(chart.canvas, 'pointerup', bx, by);
    expect(toggles).toEqual([]);
    chart.destroy();
  });
});
