import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { contextOf, installCanvas, mount, setSize, useClock } from './helpers/dom.js';
import { Chart } from '../src/core/chart.js';
import { xAxis, yAxis } from '../src/index.js';

beforeAll(installCanvas);
let clock: ReturnType<typeof useClock>;
afterEach(() => clock?.restore());

const DAY = 86_400_000;

function timeChart(width = 600) {
  const host = mount(width, 300);
  const chart = new Chart(host, {
    height: 300,
    x: { type: 'time' },
    series: [{ id: 'a', type: 'line', data: Array.from({ length: 60 }, (_, i) => [i * DAY, i]) }],
    plugins: [yAxis(), xAxis()],
  });
  return { host, chart };
}

describe('tick labels', () => {
  it('draws the full tick set on the opening frame', () => {
    clock = useClock();
    const { chart } = timeChart();
    // Exactly what the constructor painted, with no further frames.
    const labels = contextOf(chart.canvas).texts();
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.some((l) => /^[A-Z][a-z]{2} \d/.test(l))).toBe(true);
    chart.destroy();
  });

  it('cross-fades to a new tick set and settles on it alone', () => {
    clock = useClock();
    const { host, chart } = timeChart();
    const ctx = contextOf(chart.canvas);

    clock.advance(1000);
    chart.render();
    const before = ctx.texts();

    setSize(host, 260, 300);
    chart.resize();
    ctx.clear();
    chart.render();
    const during = ctx.texts();
    // Both sets are on screen while the fade runs.
    expect(during.length).toBeGreaterThan(0);

    for (let i = 0; i < 40; i++) {
      clock.advance(16);
      chart.render();
    }
    ctx.clear();
    chart.render();
    const after = ctx.texts();

    expect(after.length).toBe(new Set(after).size);
    expect(after).not.toEqual(before);
    chart.destroy();
  });

  it('keeps animating while a fade is running', () => {
    clock = useClock();
    const { host, chart } = timeChart();
    clock.advance(1000);
    chart.render();
    setSize(host, 260, 300);
    chart.resize();
    const animating = (chart as never as { isAnimating(n: number): boolean }).isAnimating(clock.now());
    expect(animating).toBe(true);
    chart.destroy();
  });
});
