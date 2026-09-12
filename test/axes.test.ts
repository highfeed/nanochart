import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { contextOf, drawOnce, installCanvas, mount, setSize, useClock } from './helpers/dom.js';
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
    // Pinned, because the assertions below read the month names: on a host
    // locale that is not English the ticks come out as "7 янв." and match
    // nothing. What the locale itself does to a label is intl.test.ts's.
    locale: 'en-US',
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

  /** Every label of the last frame with the colour it was drawn in. */
  function painted(chart: Chart): { text: string; color: string }[] {
    const out: { text: string; color: string }[] = [];
    let color = '';
    for (const op of contextOf(chart.canvas).ops) {
      if (op.name === 'set:fillStyle') color = String(op.args[0]);
      else if (op.name === 'fillText') out.push({ text: String(op.args[0]), color });
    }
    return out;
  }

  const alphaOf = (color: string): number => {
    const match = /rgba\(\d+,\d+,\d+,([\d.]+)\)/.exec(color);
    return match ? Number(match[1]) : 1;
  };

  it('fades tick by tick, holding the ones in both sets', () => {
    clock = useClock();
    const host = mount(600, 300);
    const chart = new Chart(host, {
      height: 300,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      series: [{ id: 'a', type: 'line', data: [0, 10] }],
      plugins: [yAxis()],
    });
    clock.advance(1000);
    chart.render();
    const before = chart.domain('y').ticks;

    chart.updateSeries('a', { data: [0, 20] });
    chart.render();
    const after = chart.domain('y').ticks;
    const kept = before.filter((value) => after.includes(value));
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(after.length);

    clock.advance(chart.duration / 2);
    drawOnce(chart);
    const labels = painted(chart);
    for (const value of kept) {
      // Once, and at full strength. Drawn as two whole sets, one over the
      // other, a shared label was painted twice and read at 75% mid-fade.
      const drawn = labels.filter((label) => label.text === String(value));
      expect(drawn).toHaveLength(1);
      expect(alphaOf(drawn[0].color)).toBe(1);
    }
    for (const value of before) {
      if (kept.includes(value)) continue;
      expect(alphaOf(labels.find((label) => label.text === String(value))!.color)).toBeLessThan(0.5);
    }
    // The domain is still growing towards the new set, so its top ticks are
    // not on screen yet; the ones that are come in at the fade's strength.
    const arriving = labels.filter((label) => after.includes(Number(label.text)) && !kept.includes(Number(label.text)));
    expect(arriving.length).toBeGreaterThan(0);
    for (const label of arriving) {
      expect(alphaOf(label.color)).toBeGreaterThan(0.5);
      expect(alphaOf(label.color)).toBeLessThan(1);
    }
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

describe('label backdrop', () => {
  function chartWith(axis: ReturnType<typeof yAxis>) {
    const host = mount(600, 300);
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      series: [{ id: 'a', type: 'bar', data: [3, 1, 4, 1, 5] }],
      plugins: [axis],
    });
    return drawOnce(chart);
  }

  // A muted grey label over the first bar had a contrast of about 1.6:1.
  it('washes the background behind each overlaid label', () => {
    const ctx = chartWith(yAxis());
    const labels = ctx.texts().length;
    expect(labels).toBeGreaterThan(0);
    // One rounded rect per label: four corners each.
    expect(ctx.calls('arcTo')).toHaveLength(labels * 4);
    expect(ctx.calls('set:fillStyle').map((op) => op.args[0])).toContain('rgba(255,255,255,0.8)');
  });

  it('draws the wash under the label, not over it', () => {
    const ctx = chartWith(yAxis());
    const first = ctx.ops.findIndex((op) => op.name === 'fillText');
    const wash = ctx.ops.findIndex((op) => op.name === 'arcTo');
    expect(wash).toBeGreaterThanOrEqual(0);
    expect(wash).toBeLessThan(first);
  });

  it('leaves labels bare when asked, and when they have a colour of their own', () => {
    expect(chartWith(yAxis({ backdrop: false })).calls('arcTo')).toHaveLength(0);
    expect(chartWith(yAxis({ color: '#fff' })).calls('arcTo')).toHaveLength(0);
  });

  it('has nothing to wash outside the plot', () => {
    expect(chartWith(yAxis({ placement: 'outside' })).calls('arcTo')).toHaveLength(0);
  });
});
