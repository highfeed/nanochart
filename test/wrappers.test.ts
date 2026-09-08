import { beforeAll, describe, expect, it, vi } from 'vitest';
import { installCanvas, mount } from './helpers/dom.js';
import { ChartController } from '../src/adapters/controller.js';
import { nanochart } from '../src/svelte.js';
import { telegramDark, telegramLight, xAxis, yAxis } from '../src/index.js';
import type { Chart } from '../src/core/chart.js';
import type { ChartOptions } from '../src/core/types.js';

beforeAll(installCanvas);

const base = (over: Partial<ChartOptions> = {}): ChartOptions => ({
  animation: false,
  height: 300,
  series: [{ id: 'a', type: 'line', name: 'A', data: [1, 2, 3] }],
  ...over,
});

describe('ChartController', () => {
  it('builds a chart on the given element', () => {
    const host = mount();
    const controller = new ChartController(host, base());
    expect(host.querySelector('canvas')).toBeTruthy();
    controller.destroy();
    expect(host.querySelector('canvas')).toBeNull();
  });

  it('patches a changed series instead of rebuilding the list', () => {
    const host = mount();
    const controller = new ChartController(host, base());
    const setSeries = vi.spyOn(controller.chart, 'setSeries');
    const updateSeries = vi.spyOn(controller.chart, 'updateSeries');

    controller.update(base({ series: [{ id: 'a', type: 'line', name: 'A', data: [1, 2, 3], color: '#f00' }] }));
    expect(updateSeries).toHaveBeenCalledTimes(1);
    expect(setSeries).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('rebuilds when the ids change', () => {
    const host = mount();
    const controller = new ChartController(host, base());
    const setSeries = vi.spyOn(controller.chart, 'setSeries');
    controller.update(base({ series: [{ id: 'b', type: 'line', data: [1, 2, 3] }] }));
    expect(setSeries).toHaveBeenCalledTimes(1);
    controller.destroy();
  });

  it('rebuilds when a type changes, since the renderer is bound at build time', () => {
    const host = mount();
    const controller = new ChartController(host, base());
    const setSeries = vi.spyOn(controller.chart, 'setSeries');
    controller.update(base({ series: [{ id: 'a', type: 'bar', name: 'A', data: [1, 2, 3] }] }));
    expect(setSeries).toHaveBeenCalledTimes(1);
    controller.destroy();
  });

  it('rebuilds when the count changes', () => {
    const host = mount();
    const controller = new ChartController(host, base());
    const setSeries = vi.spyOn(controller.chart, 'setSeries');
    controller.update(base({
      series: [
        { id: 'a', type: 'line', name: 'A', data: [1, 2, 3] },
        { id: 'b', type: 'line', data: [3, 2, 1] },
      ],
    }));
    expect(setSeries).toHaveBeenCalledTimes(1);
    controller.destroy();
  });

  it('does nothing when the same options come back', () => {
    const host = mount();
    const options = base();
    const controller = new ChartController(host, options);
    const setSeries = vi.spyOn(controller.chart, 'setSeries');
    const updateSeries = vi.spyOn(controller.chart, 'updateSeries');
    const setTheme = vi.spyOn(controller.chart, 'setTheme');

    controller.update(options);
    expect(setSeries).not.toHaveBeenCalled();
    expect(updateSeries).not.toHaveBeenCalled();
    expect(setTheme).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('follows an options object that was edited in place', () => {
    // A wrapper may hand back the very object it was given — a Vue `deep`
    // watch does — so the diff cannot compare it against itself.
    const host = mount();
    const options = base();
    const controller = new ChartController(host, options);

    options.series = [{ id: 'a', type: 'line', name: 'A', data: [1, 2, 3, 4, 5] }];
    controller.update(options);
    expect(controller.chart.series[0].data.length).toBe(5);

    options.height = 150;
    controller.update(options);
    expect(controller.chart.renderer.height).toBe(150);

    options.theme = telegramDark;
    controller.update(options);
    expect(controller.chart.theme).toBe(telegramDark);
    controller.destroy();
  });

  it('follows a series object that was edited in place', () => {
    const host = mount();
    const options = base();
    const controller = new ChartController(host, options);
    const setSeries = vi.spyOn(controller.chart, 'setSeries');

    options.series[0].name = 'Renamed';
    controller.update(options);
    expect(controller.chart.series[0].name).toBe('Renamed');
    expect(setSeries).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('cross-fades a new theme', () => {
    const host = mount();
    const controller = new ChartController(host, base({ theme: telegramLight }));
    controller.update(base({ theme: telegramDark }));
    expect(controller.chart.theme).toBe(telegramDark);
    controller.destroy();
  });

  it('follows a changed range', () => {
    const host = mount();
    const controller = new ChartController(host, base({ range: [0, 1] }));
    controller.update(base({ range: [0.25, 0.75] }));
    const [from, to] = controller.chart.range();
    expect(from).toBeCloseTo(0.25, 6);
    expect(to).toBeCloseTo(0.75, 6);
    controller.destroy();
  });

  it('resizes for a changed height', () => {
    const host = mount();
    const controller = new ChartController(host, base({ height: 300 }));
    controller.update(base({ height: 150 }));
    expect(controller.chart.renderer.height).toBe(150);
    controller.destroy();
  });
});

describe('ChartController and the options a chart reads once', () => {
  it('rebuilds the chart when one of them changes, and reports the new one', () => {
    const host = mount();
    const seen: Chart[] = [];
    const controller = new ChartController(host, base({ x: { type: 'linear' } }), (chart) => seen.push(chart));
    const first = controller.chart;
    controller.update(base({ x: { type: 'time' } }));
    expect(controller.chart).not.toBe(first);
    expect(controller.chart.xAxis.type).toBe('time');
    expect(seen).toEqual([first, controller.chart]);
    // The old chart is gone, not left beside the new one.
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
    controller.destroy();
  });

  it('keeps the chart across an axis object rebuilt with the same fields', () => {
    const host = mount();
    const controller = new ChartController(host, base({ x: { type: 'category', categories: ['a', 'b', 'c'] } }));
    const first = controller.chart;
    controller.update(base({ x: { type: 'category', categories: ['a', 'b', 'c'] } }));
    expect(controller.chart).toBe(first);
    controller.destroy();
  });

  it('tells a changed plugin list from a re-created one', () => {
    const host = mount();
    const controller = new ChartController(host, base({ plugins: [yAxis()] }));
    const first = controller.chart;
    // A page that builds its plugins inline hands over new instances every render.
    controller.update(base({ plugins: [yAxis()] }));
    expect(controller.chart).toBe(first);
    controller.update(base({ plugins: [yAxis(), xAxis()] }));
    expect(controller.chart).not.toBe(first);
    controller.destroy();
  });

  it('follows a series whose data was appended to in place', () => {
    const host = mount();
    const data = [1, 2, 3];
    const options = base({ series: [{ id: 'a', type: 'line', data }] });
    const controller = new ChartController(host, options);
    data.push(4);
    controller.update(options);
    expect(controller.chart.series[0].data.length).toBe(4);
    controller.destroy();
  });

  it('patches only the fields that changed', () => {
    const host = mount();
    const data = [1, 2, 3];
    const controller = new ChartController(host, base({ series: [{ id: 'a', type: 'line', data }] }));
    const parsed = controller.chart.series[0].data;
    controller.update(base({ series: [{ id: 'a', type: 'line', data, color: '#f00' }] }));
    expect(controller.chart.series[0].options.color).toBe('#f00');
    // Same samples, same array: nothing to parse again.
    expect(controller.chart.series[0].data).toBe(parsed);
    controller.destroy();
  });
});

describe('svelte action', () => {
  it('hands the chart to onChart', () => {
    const host = mount();
    let seen: Chart | null = null;
    const action = nanochart(host, { ...base(), onChart: (chart) => { seen = chart; } });
    expect(seen).not.toBeNull();
    expect(host.querySelector('canvas')).toBeTruthy();
    action.destroy();
  });

  it('mounts, updates and tears down', () => {
    const host = mount();
    const action = nanochart(host, base());
    expect(host.querySelector('canvas')).toBeTruthy();

    action.update(base({ series: [{ id: 'a', type: 'line', name: 'Renamed', data: [1, 2, 3] }] }));
    action.destroy();
    expect(host.querySelector('canvas')).toBeNull();
  });
});

describe('react wrapper', () => {
  it('mounts a chart and hands it back, then tears it down', async () => {
    const { createElement } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { NanoChart } = await import('../src/react.js');
    const { act } = await import('react');

    const host = mount();
    const root = createRoot(host);
    let seen: unknown = 'never called';

    await act(async () => {
      root.render(createElement(NanoChart, { ...base(), onChart: (c: unknown) => { if (c) seen = c; } }));
    });
    expect(host.querySelector('canvas')).toBeTruthy();
    expect(seen).not.toBe('never called');

    await act(async () => root.unmount());
    expect(host.querySelector('canvas')).toBeNull();
  });

  it('reports the chart again after a rebuild', async () => {
    const { createElement } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { NanoChart } = await import('../src/react.js');
    const { act } = await import('react');

    const host = mount();
    const root = createRoot(host);
    const seen: (Chart | null)[] = [];
    const render = (x: ChartOptions['x']) =>
      act(async () => {
        root.render(createElement(NanoChart, { ...base(), x, onChart: (c: Chart | null) => seen.push(c) }));
      });

    await render({ type: 'linear' });
    await render({ type: 'time' });
    expect(seen).toHaveLength(2);
    expect(seen[1]).not.toBe(seen[0]);
    expect(seen[1]?.xAxis.type).toBe('time');

    await act(async () => root.unmount());
    expect(seen[2]).toBeNull();
  });
});

describe('vue wrapper', () => {
  it('mounts a chart and tears it down', async () => {
    const { createApp, h } = await import('vue');
    const { NanoChart } = await import('../src/vue.js');

    const host = mount();
    const app = createApp({ render: () => h(NanoChart, { options: base() }) });
    app.mount(host);
    expect(host.querySelector('canvas')).toBeTruthy();

    app.unmount();
    expect(host.querySelector('canvas')).toBeNull();
  });

  it('follows options mutated in place, which is what its deep watch hands back', async () => {
    const { createApp, h, nextTick, reactive } = await import('vue');
    const { NanoChart } = await import('../src/vue.js');

    const host = mount();
    const options = reactive(base());
    let chart: ChartController['chart'] | null = null;
    const app = createApp({
      render: () => h(NanoChart, { options, onReady: (c: ChartController['chart']) => { chart = c; } }),
    });
    app.mount(host);
    expect(chart).not.toBeNull();

    options.series = [{ id: 'a', type: 'line', name: 'A', data: [1, 2, 3, 4, 5] }];
    await nextTick();
    expect(chart!.series[0].data.length).toBe(5);

    app.unmount();
  });

  it('follows a series pushed to in place', async () => {
    const { createApp, h, nextTick, reactive } = await import('vue');
    const { NanoChart } = await import('../src/vue.js');

    const host = mount();
    const options = reactive(base());
    let chart: Chart | null = null;
    const app = createApp({
      render: () => h(NanoChart, { options, onReady: (c: Chart) => { chart = c; } }),
    });
    app.mount(host);

    // The ordinary way to stream into a Vue-held array. The deep watch fires,
    // and the array is the same array, one sample longer.
    (options.series[0].data as number[]).push(4);
    await nextTick();
    expect(chart!.series[0].data.length).toBe(4);

    app.unmount();
  });
});
