import { beforeAll, describe, expect, it, vi } from 'vitest';
import { installCanvas, mount } from './helpers/dom.js';
import { ChartController } from '../src/adapters/controller.js';
import { nanochart } from '../src/svelte.js';
import { telegramDark, telegramLight } from '../src/index.js';
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

describe('svelte action', () => {
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
});
