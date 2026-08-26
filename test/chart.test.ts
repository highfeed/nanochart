import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { contextOf, installCanvas, mount, setSize, useClock } from './helpers/dom.js';
import { Chart } from '../src/core/chart.js';
import { telegramDark, telegramLight } from '../src/themes/telegram.js';
import '../src/index.js';

beforeAll(installCanvas);
let clock: ReturnType<typeof useClock> | undefined;
afterEach(() => {
  clock?.restore();
  clock = undefined;
});

const base = (over: Record<string, unknown> = {}) => ({
  animation: false as const,
  height: 300,
  series: [{ id: 'a', type: 'line', name: 'A', data: [1, 2, 3] }],
  ...over,
});

describe('x extent with gaps', () => {
  const HOUR = 3_600_000;
  const T = Date.UTC(2026, 7, 24);
  const hourly = (count: number) =>
    Array.from({ length: count }, (_, i) => [T + i * HOUR, i] as [number, number]);

  it('is not stretched by a gap that carries no position', () => {
    // The demo's outage, written the way it was written: bare nulls over a
    // series of [timestamp, value] pairs. Reading their index as a timestamp
    // put the extent at the epoch and crushed 72 hours into one pixel column.
    const data: ([number, number] | null)[] = hourly(72);
    for (let i = 38; i < 44; i++) data[i] = null;

    const host = mount();
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      x: { type: 'time' },
      series: [{ id: 'a', type: 'line', name: 'A', data }],
    });
    const [from, to] = chart.xExtent;
    expect(from).toBe(T);
    expect(to).toBe(T + 71 * HOUR);
    chart.destroy();
  });

  it('reads past a gap sitting at either end of the series', () => {
    const data: ([number, number] | null)[] = hourly(6);
    data[0] = null;
    data[5] = null;

    const host = mount();
    const chart = new Chart(host, {
      animation: false,
      height: 300,
      x: { type: 'time' },
      series: [{ id: 'a', type: 'line', name: 'A', data }],
    });
    // Taking the ends blindly would read NaN and lose the extent entirely.
    expect(chart.xExtent[0]).toBe(T + HOUR);
    expect(chart.xExtent[1]).toBe(T + 4 * HOUR);
    chart.destroy();
  });
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
  it('keeps a toggled state across an unrelated updateSeries', () => {
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
  it('follows the container height when no height was given', () => {
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
  it('places a single-point series inside the x extent', () => {
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
  it('does not silently ignore a type nobody registered', () => {
    const host = mount();
    expect(() => new Chart(host, base({ series: [{ id: 'a', type: 'nope', data: [1, 2] }] })).render())
      .toThrow(/nope/);
  });
});

describe('destroy on a borrowed canvas', () => {
  it('restores the attributes it set', () => {
    const host = mount();
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    const chart = new Chart(canvas, base({ ariaLabel: 'Revenue' }));
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toBe('Revenue');

    chart.destroy();
    expect(canvas.getAttribute('role')).toBeNull();
    expect(canvas.getAttribute('aria-label')).toBeNull();
    expect(canvas.style.touchAction).toBe('');
    expect(host.contains(canvas)).toBe(true);
  });
});

describe('theme cross-fade', () => {
  it('mixes colour keys the built-in themes do not declare', () => {
    clock = useClock();
    const host = mount();
    const brandLight = { ...telegramLight, name: 'brand', accent: '#000000' } as never;
    const brandDark = { ...telegramDark, name: 'brand-dark', accent: '#ffffff' } as never;
    const chart = new Chart(host, base({ theme: brandLight, animation: { duration: 200 } }));

    chart.setTheme(brandDark);
    // Halfway through, so the second switch has to snapshot a running fade.
    clock.advance(140);
    chart.setTheme(brandLight);

    const snapshot = (chart as never as { themeState: { prev: Record<string, string> } }).themeState.prev;
    // Neither endpoint: the custom key was interpolated like any built-in one.
    expect(snapshot.accent).toMatch(/^rgba?\(/);
    expect(snapshot.accent).not.toBe('#000000');
    expect(snapshot.accent).not.toBe('#ffffff');
    chart.destroy();
  });
});

describe('updateSeries', () => {
  it('patches one series without re-parsing the others', () => {
    const host = mount();
    const chart = new Chart(host, base({
      series: [
        { id: 'a', type: 'line', data: [1, 2, 3] },
        { id: 'b', type: 'line', data: [3, 2, 1] },
      ],
    }));
    const untouched = chart.seriesById('b')!.data;
    chart.updateSeries('a', { color: '#ff0000' });
    // Same object: series b was never rebuilt.
    expect(chart.seriesById('b')!.data).toBe(untouched);
    expect(chart.seriesById('a')!.options.color).toBe('#ff0000');
    chart.destroy();
  });

  it('re-normalizes only when data is part of the patch', () => {
    const host = mount();
    const chart = new Chart(host, base());
    const before = chart.seriesById('a')!.data;
    chart.updateSeries('a', { name: 'Renamed' });
    expect(chart.seriesById('a')!.data).toBe(before);
    expect(chart.seriesById('a')!.name).toBe('Renamed');

    chart.updateSeries('a', { data: [9, 8, 7] });
    expect(chart.seriesById('a')!.data).not.toBe(before);
    expect(Array.from(chart.seriesById('a')!.data.y)).toEqual([9, 8, 7]);
    chart.destroy();
  });

  it('rebuilds when the type changes, since the renderer is bound at build time', () => {
    const host = mount();
    const chart = new Chart(host, base());
    chart.updateSeries('a', { type: 'bar' });
    expect(chart.seriesById('a')!.type).toBe('bar');
    chart.destroy();
  });

  it('still animates and reports a visibility patch', () => {
    const host = mount();
    const chart = new Chart(host, base());
    const seen: unknown[] = [];
    chart.on('toggle', (e) => seen.push(e));
    chart.updateSeries('a', { visible: false });
    expect(chart.seriesById('a')!.visible).toBe(false);
    expect(seen).toEqual([{ id: 'a', visible: false }]);
    chart.destroy();
  });

  it('ignores an unknown id', () => {
    const host = mount();
    const chart = new Chart(host, base());
    expect(() => chart.updateSeries('nope', { color: '#000' })).not.toThrow();
    chart.destroy();
  });
});

describe('setHeight', () => {
  it('pins a new height', () => {
    const host = mount(600, 500);
    const chart = new Chart(host, base({ height: 300 }));
    chart.setHeight(150);
    expect(chart.renderer.height).toBe(150);
    chart.destroy();
  });

  it('hands the height back to the container when omitted', () => {
    const host = mount(600, 420);
    const chart = new Chart(host, base({ height: 300 }));
    chart.setHeight(undefined);
    expect(chart.renderer.height).toBe(420);
    chart.destroy();
  });
});
